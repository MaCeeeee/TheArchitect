/**
 * THE-691: Implikationen zwischen den Typ-Achsen — Begriffsanalyse-Sonde, Teil 2.
 *
 *   npm run typing:implications
 *
 * READ-ONLY. Kein Modell beteiligt, reine Auszählung über `regulations.typing`.
 *
 * ── DIE FRAGE ──
 * Fünf Achsen beschreiben jede Bestimmung. Sind sie fünf *unabhängige* Aussagen
 * — oder sagt eine bereits, was die andere sagen wird? Eine Achse, die aus den
 * übrigen ableitbar ist, kostet Geld und Prompt-Platz, ohne etwas beizutragen.
 *
 * ── DREI FALLEN, DIE HIER MECHANISCH ABGEWEHRT WERDEN ──
 *
 * 1. DIE KONSTANTE. `bindingness` trägt bei 1748 von 1750 denselben Wert.
 *    Deshalb impliziert ALLES „binding" — mit 100 % Konfidenz und null
 *    Erkenntnis. Gegenmittel ist der LIFT: Konfidenz geteilt durch die
 *    Grundrate des Zielwerts. Lift ≈ 1 heißt „sagt nur die Mehrheit vor".
 *
 * 2. DIE MEMORIERUNG. Bedingt man auf eine Achse mit 19 Werten, entstehen
 *    viele winzige Zellen; jede Zelle mit einer einzigen Bestimmung ist
 *    trivial „eindeutig". Deshalb wird je Paar ausgewiesen, welcher Anteil der
 *    Bestimmungen in Zellen der Größe 1 sitzt. Hoher Anteil = die Zahl misst
 *    Auswendiglernen, nicht Struktur.
 *
 * 3. DIE STILLE DECKELUNG. Regeln unter der Mindest-Belegung werden nicht
 *    verschwiegen, sondern gezählt und gemeldet.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const PAKET_WURZEL = resolve(__dirname, '../..');
dotenv.config({ path: resolve(PAKET_WURZEL, '../../.env') });

const ACHSEN = ['normKind', 'bindingness', 'obligationKind', 'partyRole', 'provisionKind'] as const;
type Achse = (typeof ACHSEN)[number];

/** Eine Regel gilt erst ab dieser Belegung als Befund — darunter ist sie Zufall. */
const MIN_BELEGUNG = 20;
/** Ab hier heißt eine Regel „fast sicher". */
const MIN_KONFIDENZ = 0.95;
/** Darunter sagt die Regel nur die Mehrheit der Zielachse vor. */
const MIN_LIFT = 1.5;

type Zeile = Partial<Record<Achse, string>>;

function entropie(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return 0;
  let h = 0;
  for (const c of counts) { const p = c / n; if (p > 0) h -= p * Math.log2(p); }
  return h;
}

function zaehle<T>(xs: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

interface PaarBefund {
  von: string; nach: Achse;
  n: number; zellen: number; singletonAnteil: number;
  hZiel: number; hBedingt: number; u: number;
}

/** U(Ziel | Bedingung): wie viel der Unsicherheit über das Ziel die Bedingung wegnimmt. */
function bedingt(rows: Zeile[], bedingung: Achse[], ziel: Achse, label: string): PaarBefund | null {
  const paare = rows
    .map((r) => ({ a: bedingung.map((b) => r[b]), b: r[ziel] }))
    .filter((p) => p.b !== undefined && p.a.every((v) => v !== undefined))
    .map((p) => ({ a: p.a.join(' ∧ '), b: p.b as string }));
  if (paare.length === 0) return null;

  const zielVerteilung = zaehle(paare.map((p) => p.b));
  const hZiel = entropie([...zielVerteilung.values()]);

  const proZelle = new Map<string, string[]>();
  for (const p of paare) proZelle.set(p.a, [...(proZelle.get(p.a) ?? []), p.b]);

  let hBedingt = 0;
  let singletons = 0;
  for (const [, ziele] of proZelle) {
    hBedingt += (ziele.length / paare.length) * entropie([...zaehle(ziele).values()]);
    if (ziele.length === 1) singletons++;
  }
  return {
    von: label, nach: ziel,
    n: paare.length, zellen: proZelle.size, singletonAnteil: singletons / paare.length,
    hZiel, hBedingt, u: hZiel > 0 ? (hZiel - hBedingt) / hZiel : 0,
  };
}

interface Regel {
  wenn: string; dann: string; ziel: Achse;
  belegung: number; konfidenz: number; grundrate: number; lift: number;
}

function regeln(rows: Zeile[], von: Achse, nach: Achse): { gefunden: Regel[]; verworfenWegenBelegung: number } {
  const paare = rows.filter((r) => r[von] !== undefined && r[nach] !== undefined)
    .map((r) => ({ a: r[von] as string, b: r[nach] as string }));
  const grund = zaehle(paare.map((p) => p.b));
  const proWert = new Map<string, string[]>();
  for (const p of paare) proWert.set(p.a, [...(proWert.get(p.a) ?? []), p.b]);

  const gefunden: Regel[] = [];
  let verworfen = 0;
  for (const [wert, ziele] of proWert) {
    if (ziele.length < MIN_BELEGUNG) { verworfen++; continue; }
    const [zielWert, treffer] = [...zaehle(ziele).entries()].sort((x, y) => y[1] - x[1])[0];
    const konfidenz = treffer / ziele.length;
    if (konfidenz < MIN_KONFIDENZ) continue;
    const grundrate = (grund.get(zielWert) ?? 0) / paare.length;
    gefunden.push({
      wenn: `${von} = ${wert}`, dann: `${nach} = ${zielWert}`, ziel: nach,
      belegung: ziele.length, konfidenz, grundrate, lift: konfidenz / grundrate,
    });
  }
  return { gefunden, verworfenWegenBelegung: verworfen };
}

async function main(): Promise<void> {
  const uri = process.env.CORPUS_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('CORPUS_MONGODB_URI fehlt.');
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8_000 }).asPromise();
  const docs = await conn.collection('regulations')
    .find({ 'typing.status': { $exists: true } }, { projection: { typing: 1 } }).toArray();
  if (docs.length === 0) throw new Error('0 typisierte Bestimmungen — leere Messung ist kein Bestehen.');

  const rows: Zeile[] = docs.map((d) => {
    const t = (d as { typing?: Record<string, unknown> }).typing ?? {};
    const z: Zeile = {};
    for (const a of ACHSEN) { const v = t[a]; if (typeof v === 'string' && v.length > 0) z[a] = v; }
    return z;
  });

  const z: string[] = [];
  const sag = (s = '') => { console.log(s); z.push(s); };

  sag(`# THE-691 — Implikationen zwischen den Typ-Achsen`);
  sag();
  sag(`> Erzeugt von \`npm run typing:implications\` (read-only, kein Modell). Nicht von Hand pflegen.`);
  sag();
  sag(`Grundlage: **${rows.length}** typisierte Bestimmungen. Mindest-Belegung ${MIN_BELEGUNG}, Konfidenz ≥ ${MIN_KONFIDENZ}, Lift ≥ ${MIN_LIFT}.`);
  sag();

  // ── 1. Jede Achse für sich ──
  sag(`## Jede Achse für sich`);
  sag();
  sag(`| Achse | belegt | Werte | Entropie | Mehrheitswert |`);
  sag(`|---|---|---|---|---|`);
  for (const a of ACHSEN) {
    const werte = rows.map((r) => r[a]).filter((v): v is string => v !== undefined);
    const v = zaehle(werte);
    const top = [...v.entries()].sort((x, y) => y[1] - x[1])[0];
    sag(`| \`${a}\` | ${werte.length} | ${v.size} | ${entropie([...v.values()]).toFixed(3)} Bit | ${top[0]} ${(100 * top[1] / werte.length).toFixed(1)} % |`);
  }
  sag();

  // ── 2. Wie viel nimmt eine Achse der anderen ab ──
  sag(`## Was eine Achse über eine andere verrät`);
  sag();
  sag(`U = Anteil der Unsicherheit über die **Ziel**-Achse, den die **Quell**-Achse wegnimmt. 1,00 = vollständig ableitbar, 0,00 = unabhängig.`);
  sag();
  sag(`| Quelle → Ziel | n | Zellen | Einzelfall-Anteil | H(Ziel) | H(Ziel\\|Quelle) | **U** |`);
  sag(`|---|---|---|---|---|---|---|`);
  const paarBefunde: PaarBefund[] = [];
  for (const von of ACHSEN) for (const nach of ACHSEN) {
    if (von === nach) continue;
    const b = bedingt(rows, [von], nach, von);
    if (!b) continue;
    paarBefunde.push(b);
  }
  for (const b of [...paarBefunde].sort((x, y) => y.u - x.u)) {
    sag(`| \`${b.von}\` → \`${b.nach}\` | ${b.n} | ${b.zellen} | ${(100 * b.singletonAnteil).toFixed(1)} % | ${b.hZiel.toFixed(3)} | ${b.hBedingt.toFixed(3)} | **${b.u.toFixed(3)}** |`);
  }
  sag();

  // ── 3. Ist eine Achse aus ALLEN anderen ableitbar? ──
  sag(`## Ist eine Achse aus allen übrigen ableitbar?`);
  sag();
  sag(`Die eigentliche Redundanz-Frage. Hoher Einzelfall-Anteil entwertet die Zahl — dann misst sie Auswendiglernen.`);
  sag();
  sag(`| Ziel-Achse | n | Zellen | Einzelfall-Anteil | H(Ziel) | H(Ziel\\|Rest) | **U** |`);
  sag(`|---|---|---|---|---|---|---|`);
  for (const ziel of ACHSEN) {
    const rest = ACHSEN.filter((a) => a !== ziel);
    const b = bedingt(rows, [...rest], ziel, 'Rest');
    if (!b) continue;
    sag(`| \`${ziel}\` | ${b.n} | ${b.zellen} | ${(100 * b.singletonAnteil).toFixed(1)} % | ${b.hZiel.toFixed(3)} | ${b.hBedingt.toFixed(3)} | **${b.u.toFixed(3)}** |`);
  }
  sag();

  // ── 4. Konkrete Regeln ──
  sag(`## Regeln, die nicht bloß die Mehrheit vorsagen`);
  sag();
  const alle: Regel[] = [];
  let verworfenGesamt = 0;
  for (const von of ACHSEN) for (const nach of ACHSEN) {
    if (von === nach) continue;
    const r = regeln(rows, von, nach);
    alle.push(...r.gefunden);
    verworfenGesamt += r.verworfenWegenBelegung;
  }
  const stark = alle.filter((r) => r.lift >= MIN_LIFT).sort((a, b) => b.lift - a.lift);
  const trivial = alle.filter((r) => r.lift < MIN_LIFT);
  if (stark.length === 0) {
    sag(`_Keine._ Jede Regel mit ausreichender Belegung und ≥ ${MIN_KONFIDENZ} Konfidenz sagt lediglich den Mehrheitswert ihrer Zielachse vorher (Lift < ${MIN_LIFT}).`);
  } else {
    sag(`| wenn | dann | Belegung | Konfidenz | Grundrate | **Lift** |`);
    sag(`|---|---|---|---|---|---|`);
    for (const r of stark) {
      sag(`| \`${r.wenn}\` | \`${r.dann}\` | ${r.belegung} | ${(100 * r.konfidenz).toFixed(1)} % | ${(100 * r.grundrate).toFixed(1)} % | **${r.lift.toFixed(2)}×** |`);
    }
  }
  sag();
  sag(`**Nicht gezählt:** ${trivial.length} Regeln mit hoher Konfidenz, aber Lift < ${MIN_LIFT} — sie sagen nur die Mehrheit vorher. ${verworfenGesamt} Antezedenz-Werte lagen unter der Mindest-Belegung von ${MIN_BELEGUNG} und wurden übergangen.`);
  sag();

  const out = join(PAKET_WURZEL, '../../docs/evals/the691-achsen-implikationen.md');
  writeFileSync(out, z.join('\n') + '\n');
  console.log(`\n→ ${out}`);
  await conn.close();
}

main().catch(async (err) => {
  console.error('[typing-implications] Abbruch:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
