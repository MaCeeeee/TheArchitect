/**
 * THE-692: Der Gattungs-Bogen — die Erhebung gegen DEFINIERTE Begriffe.
 *
 *   packages/server$ npx ts-node --transpile-only src/scripts/the692-gattungs-bogen.ts
 *
 * READ-ONLY am Korpus.
 *
 * ── WARUM EIN NEUES INSTRUMENT ──
 * Der Bogen vom 19.08. fragte gegen den flachen 19-Rollen-Katalog. Der ist
 * gemessen gescheitert (50 % Katalog-Lücke). Sein Ergebnis bleibt als Beleg
 * bestehen — deshalb wird er NICHT umgebaut, sondern hier ein zweites
 * Instrument gestellt, mit eigener Pin-Datei und eigener Frage.
 *
 * ── WAS SICH ÄNDERT ──
 * 1. ZWEISTUFIG. Erst der Akteur WÖRTLICH aus dem Text (Freitext), dann die
 *    Gattung aus einer geschlossenen Liste von fünf. Die Rolle ist offen, die
 *    Gattung geschlossen — das ist das Modell aus THE-692, jetzt als Frage.
 * 2. GESCHICHTET NACH SATZTYP. Die Messung vom 19.08. zeigte: nur ~26 % der
 *    Pflichtsätze sind aktiv-explizit, der Rest ist passiv, unpersönlich oder
 *    anaphorisch. Eine Stichprobe ohne Schichtung misst die leichten Fälle.
 *    Jede Schicht ist im Bogen ausgewiesen — der Leser sieht, was er beurteilt.
 * 3. VOLLTEXT. Keine stille Kürzung; die 22 gekürzten Urteile vom 19.08. sind
 *    als Gold unbrauchbar, und der Mensch musste den Mangel finden, nicht das
 *    Werkzeug.
 * 4. „UNKLAR" IST EINE ANTWORT und wird gezählt. Über 10 % heißt: die
 *    Gattungsliste ist durchgefallen, nicht der Leser.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

const PRO_SCHICHT = 8;   // je Satztyp — ergibt 32 Fälle
const GEGENPROBEN = 4;   // Bestimmungen, die belegbar niemanden verpflichten

interface Doc {
  regulationKey: string; source: string; paragraphNumber: string;
  title: string; fullText: string; language: string;
}

/** Die vier Satztypen aus der Messung vom 19.08. — die Schichtung der Stichprobe. */
const SCHICHTEN: Array<{ id: string; label: string; erklaerung: string; test: (t: string, de: boolean) => boolean }> = [
  {
    id: 'aktiv', label: 'aktiv-explizit', erklaerung: 'Ein benannter Akteur steht als Subjekt vor dem Pflichtverb.',
    test: (t, de) => de
      ? /\b(?:Der|Die|Das|Jede[rs]?)\s+[A-ZÄÖÜ][a-zäöüß-]{4,}[^.;]{0,80}\b(?:muss|müssen|hat|haben|stellt|stellen|meldet|melden|sorgt|sorgen|trifft|treffen)\b/.test(t)
      : /\b(?:The|Each|Every)\s+[a-z][a-z-]{4,}[^.;]{0,80}\bshall\b/i.test(t),
  },
  {
    id: 'passiv', label: 'passiv', erklaerung: 'Die Pflicht steht im Passiv — der Verpflichtete ist grammatisch nicht das Subjekt.',
    test: (t, de) => de
      ? /\b(?:wird|werden)\s[^.;]{0,80}\b(?:ge\w{3,}t|ge\w{3,}en)\b|\b(?:ist|sind)\s[^.;]{0,60}\bzu\s\w+en\b/.test(t)
      : /\bshall\s+(?:not\s+)?be\s+\w+(?:ed|en)\b/i.test(t),
  },
  {
    id: 'unpersoenlich', label: 'unpersönlich', erklaerung: 'Kein handelndes Subjekt — „es ist untersagt", „bedarf der Zustimmung", „ist unwirksam".',
    test: (t, de) => de
      ? /\bes ist (?:untersagt|verboten|zulässig|erforderlich|nicht erforderlich)\b|\bes gelten\b|\bes bedarf\b|\bbedarf (?:der|des|einer|eines)\b|\bist (?:unwirksam|unzulässig|untersagt|verboten|erforderlich|nicht anzuwenden|sicherzustellen|zu gewährleisten|nachzuweisen|anzugeben|aufzubewahren)\b|\bsind (?:unwirksam|unzulässig|untersagt|erforderlich|sicherzustellen|zu gewährleisten|nachzuweisen|aufzubewahren)\b|\bfür [^.;]{0,60}\bgilt\b|\bhat zu erfolgen\b|\berfolgt (?:nach|gemäß|innerhalb|unverzüglich)\b/.test(t)
      : /\bit shall be (?:prohibited|permitted|ensured|required)\b|\bshall be void\b|\bthere shall be\b|\bit is necessary\b/i.test(t),
  },
  {
    id: 'anaphorisch', label: 'anaphorisch / verweisend', erklaerung: 'Der Adressat steht woanders — „sie stellt sicher", „gilt entsprechend".',
    test: (t, de) => de
      ? /\b(?:sie|er|es|dieser|diese|dieses)\s+(?:stellt|stellen|muss|müssen|hat|haben)\b|\bgilt entsprechend\b|\bgelten entsprechend\b/.test(t)
      : /\b(?:it|they)\s+shall\b|\bshall apply mutatis mutandis\b/i.test(t),
  },
];

/**
 * Bestimmungen, die belegbar niemanden verpflichten — die echte Negativ-Kontrolle.
 *
 * „Gegenstand" und „Anwendungsbereich" gehören AUSDRÜCKLICH NICHT dazu: Ein
 * Anwendungsbereichs-Artikel benennt naturgemäß, wen er erfasst. Am 19.08.
 * wurden genau solche Artikel als Gegenproben gezogen, und drei von fünf kamen
 * mit einem Adressaten zurück — die Kontrolle war falsch konstruiert, nicht der
 * Leser zu großzügig. Hier bleiben nur Definitions- und Schlussvorschriften.
 */
const NEGATIV = /^(begriffsbestimmungen|definitions|inkrafttreten|entry into force|umsetzung|transposition|adressaten|addressees)$/i;

const GATTUNGEN: Array<{ id: string; label: string; kurz: string; farbe: string }> = [
  { id: 'wirtschaftsakteur',  label: 'Wirtschaftsakteur',  kurz: 'handelt am Markt — Hersteller, Anbieter, Betreiber, Auftraggeber …', farbe: '#8C5A2B' },
  { id: 'mitgliedstaat',      label: 'Mitgliedstaat',      kurz: 'der Staat als Adressat des Unionsrechts',                            farbe: '#33478F' },
  { id: 'nationale_behoerde', label: 'Nationale Behörde',  kurz: 'mitgliedstaatliche Stelle mit hoheitlicher Aufgabe',                  farbe: '#14706A' },
  { id: 'unionsorgan',        label: 'Unionsorgan',        kurz: 'Kommission, Parlament, Agenturen, Gremien der Union',                 farbe: '#8E2F5A' },
  { id: 'beguenstigter',      label: 'Begünstigter',       kurz: 'geschützt oder berechtigt, nicht verpflichtet',                        farbe: '#4A7A3C' },
  { id: 'kein_adressat',      label: 'Kein Adressat',      kurz: 'setzt eine Rechtsfolge, ohne jemandem etwas aufzugeben',              farbe: '#64707D' },
  { id: 'unklar',             label: 'Unklar',             kurz: 'passt in keine der fünf — wird gezählt, nicht bestraft',              farbe: '#B0871B' },
];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function absaetze(t: string): string {
  return t.split(/\n{2,}|(?<=\.)\s(?=\(\d+\))/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join('');
}

/**
 * Eine Bestimmung trägt meist MEHRERE Satztypen — 37 % unserer Artikel tragen
 * sogar drei oder mehr Normtypen. Wer den erstbesten Treffer nimmt, ordnet
 * fast alles der häufigsten Schicht zu; die seltenen bleiben leer (im ersten
 * Lauf hatte „unpersönlich" genau EINEN Kandidaten bei 887 Bestimmungen).
 *
 * Deshalb gewinnt die SELTENSTE zutreffende Schicht: Die Stichprobe soll die
 * schweren Fälle enthalten, nicht die bequemen. Reihenfolge = Härte.
 */
const SCHICHT_HAERTE = ['unpersoenlich', 'anaphorisch', 'passiv', 'aktiv'];

function schichtVon(d: Doc): string {
  const de = d.language === 'de';
  const t = String(d.fullText ?? '');
  for (const id of SCHICHT_HAERTE) {
    const s = SCHICHTEN.find((x) => x.id === id)!;
    if (s.test(t, de)) return s.id;
  }
  return 'ohne';
}

/** Deterministische Auswahl: sortiert, dann gleichmäßig über die Quellen verteilt. */
function ziehe(docs: Doc[], n: number): Doc[] {
  const proQuelle = new Map<string, Doc[]>();
  for (const d of [...docs].sort((a, b) => a.regulationKey.localeCompare(b.regulationKey))) {
    const fam = d.source.replace(/-(de|en)$/, '');
    proQuelle.set(fam, [...(proQuelle.get(fam) ?? []), d]);
  }
  const familien = [...proQuelle.keys()].sort();
  const out: Doc[] = [];
  let runde = 0;
  while (out.length < n && runde < 50) {
    for (const f of familien) {
      const liste = proQuelle.get(f)!;
      if (liste.length > runde) out.push(liste[runde]);
      if (out.length >= n) break;
    }
    runde++;
  }
  return out.slice(0, n);
}

async function main(): Promise<void> {
  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt.');
  const conn = await getCorpusConnection().asPromise();
  const alle = (await conn.collection('regulations')
    .find({}, { projection: { regulationKey: 1, source: 1, paragraphNumber: 1, title: 1, fullText: 1, language: 1 } })
    .toArray()) as never as Doc[];
  if (alle.length === 0) throw new Error('0 Bestimmungen — leere Messung ist kein Bestehen.');

  // Eine Sprachfassung je Gesetz: die deutsche, wo vorhanden.
  const eineSprache = alle.filter((d) => d.language === 'de');

  const pinPfad = resolve(__dirname, '../../../../docs/evals/the692-sample-pin.json');
  let sample: Doc[];
  let gegen: Doc[];
  const byKey = new Map(alle.map((d) => [d.regulationKey, d]));

  if (existsSync(pinPfad)) {
    const pin = JSON.parse(readFileSync(pinPfad, 'utf8')) as { sample: string[]; gegenproben: string[] };
    const hol = (k: string): Doc => {
      const d = byKey.get(k);
      if (!d) throw new Error(`Gepinnter Fall ${k} ist nicht mehr im Korpus — Pin und Korpus driften.`);
      return d;
    };
    sample = pin.sample.map(hol);
    gegen = pin.gegenproben.map(hol);
    console.log(`  Stichprobe: EINGEFROREN aus ${pinPfad.split('/').pop()}`);
  } else {
    sample = [];
    for (const s of SCHICHTEN) {
      const kandidaten = eineSprache.filter((d) => schichtVon(d) === s.id && !NEGATIV.test(String(d.title ?? '').trim()));
      const gezogen = ziehe(kandidaten, PRO_SCHICHT);
      if (gezogen.length < PRO_SCHICHT) {
        console.warn(`  ⚠ Schicht "${s.label}": nur ${gezogen.length} von ${PRO_SCHICHT} verfügbar (${kandidaten.length} Kandidaten)`);
      }
      sample.push(...gezogen);
    }
    gegen = ziehe(eineSprache.filter((d) => NEGATIV.test(String(d.title ?? '').trim())), GEGENPROBEN);
    writeFileSync(pinPfad, JSON.stringify({
      note: 'THE-692 Gattungs-Bogen. Urteile hängen an der POSITION — wer die Liste ändert, hängt gefällte Urteile an andere Artikel. Neu ziehen nur mit neuer Datei.',
      frozenAt: new Date().toISOString().slice(0, 10),
      schichtung: SCHICHTEN.map((s) => s.id),
      sample: sample.map((d) => d.regulationKey),
      gegenproben: gegen.map((d) => d.regulationKey),
    }, null, 2) + '\n');
    console.log(`  Stichprobe NEU gezogen und eingefroren → ${pinPfad.split('/').pop()}`);
  }

  const faelle = [...sample, ...gegen];
  const proSchicht = new Map<string, number>();
  for (const d of sample) proSchicht.set(schichtVon(d), (proSchicht.get(schichtVon(d)) ?? 0) + 1);

  // ── HTML ──
  const gattungKnoepfe = (i: number): string => GATTUNGEN.map((g) => `
      <label class="opt"><input type="radio" name="g${i}" value="${g.id}">
        <span class="dot" style="background:${g.farbe}"></span>
        <span class="l"><b>${g.label}</b><em>${esc(g.kurz)}</em></span></label>`).join('');

  const fallBlock = (d: Doc, i: number, gegenprobe: boolean): string => {
    const s = SCHICHTEN.find((x) => x.id === schichtVon(d));
    const lang = String(d.fullText ?? '').length;
    return `
  <article class="fall" id="f${i}">
    <header>
      <span class="nr">${String(i).padStart(2, '0')}</span>
      <span class="src">${esc(d.source)} · ${esc(d.paragraphNumber)}</span>
      <span class="ti">${esc(d.title ?? '')}</span>
      ${gegenprobe ? '<span class="badge gp">Gegenprobe</span>' : `<span class="badge">${esc(s?.label ?? 'ohne Muster')}</span>`}
      <span class="len">${lang.toLocaleString('de-DE')} Zeichen · vollständig</span>
    </header>
    <div class="text">${absaetze(String(d.fullText ?? ''))}</div>
    <div class="fragen">
      <div class="f1">
        <label for="r${i}"><b>1 · Wen nennt der Text?</b> Den Akteur <em>wörtlich</em> abschreiben, wie er dasteht. Mehrere durch Komma. Niemanden? Feld leer lassen.</label>
        <input type="text" id="r${i}" name="r${i}" placeholder="z. B. Hersteller, Marktüberwachungsbehörde">
      </div>
      <div class="f2">
        <b>2 · Welche Gattung?</b>
        <div class="opts">${gattungKnoepfe(i)}</div>
      </div>
      <label class="mehr"><input type="checkbox" name="m${i}"> verpflichtet <b>mehr als einen</b> Akteur</label>
    </div>
  </article>`;
  };

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>THE-692 — Gattungs-Bogen</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#dfe4ea;--fg:#151a20;--dim:#5b6673;--gold:#B0871B;--ja:#2F7A4E}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:56rem;margin:0 auto;padding:2rem 1rem 6rem}
h1{font:600 1.9rem/1.15 ui-serif,Georgia,serif;margin:0 0 .5rem}
.intro{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1.1rem 1.25rem;margin:1rem 0 2rem}
.intro p{margin:.4rem 0;font-size:.94rem}
.intro b{font-weight:650}
table.sch{width:100%;border-collapse:collapse;font-size:.86rem;margin:.6rem 0}
table.sch td{padding:.3rem .5rem;border-bottom:1px solid var(--line)}
.fall{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:0 0 1.5rem;overflow:hidden}
.fall header{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline;padding:.75rem 1rem;background:#eef1f4;border-bottom:1px solid var(--line)}
.nr{font:700 1rem ui-monospace,monospace}
.src{font:.8rem ui-monospace,monospace;color:var(--dim)}
.ti{font-weight:600;flex:1 1 100%}
.badge{font:.66rem ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;background:var(--gold);color:#fff;padding:.15rem .5rem;border-radius:3px}
.badge.gp{background:var(--ja)}
.len{font:.72rem ui-monospace,monospace;color:var(--dim);margin-left:auto}
.text{padding:.9rem 1rem;max-height:26rem;overflow:auto;background:#fcfcfd;border-bottom:1px solid var(--line)}
.text p{margin:.5rem 0;font-size:.93rem}
.fragen{padding:1rem}
.f1 label{display:block;font-size:.9rem;margin-bottom:.4rem}
.f1 input{width:100%;padding:.55rem .7rem;border:1px solid var(--line);border-radius:5px;font:inherit;font-size:.92rem}
.f2{margin-top:1rem;font-size:.9rem}
.opts{display:grid;gap:.35rem;margin-top:.5rem}
.opt{display:flex;align-items:flex-start;gap:.55rem;padding:.45rem .6rem;border:1px solid var(--line);border-radius:5px;cursor:pointer}
.opt:hover{background:#f2f5f8}
.opt input{margin-top:.35rem}
.opt .dot{width:.7rem;height:.7rem;border-radius:50%;margin-top:.4rem;flex:none}
.opt .l{display:flex;flex-direction:column}
.opt .l em{font-style:normal;font-size:.8rem;color:var(--dim)}
.mehr{display:block;margin-top:.9rem;font-size:.88rem}
.bar{position:sticky;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:.8rem 1rem;display:flex;gap:.6rem;align-items:center}
button{font:inherit;padding:.5rem .9rem;border:1px solid var(--line);background:#fff;border-radius:5px;cursor:pointer}
button.p{background:var(--fg);color:#fff;border-color:var(--fg)}
#status{font-size:.85rem;color:var(--dim)}
</style></head><body><div class="wrap">
<h1>THE-692 — Gattungs-Bogen</h1>
<div class="intro">
  <p><b>Die Frage:</b> Wen verpflichtet oder berechtigt <em>diese</em> Bestimmung unmittelbar?</p>
  <p><b>Blickrichtung:</b> aus dem Gesetz heraus, nicht aus einem Kundenprofil hinein.</p>
  <p><b>Zwei Stufen:</b> erst der Akteur <em>wörtlich</em> aus dem Text, dann die Gattung. Die Rolle ist offen, die Gattung geschlossen.</p>
  <p><b>„Unklar" ist eine gültige Antwort</b> und wird gezählt. Über 10 % unklar heißt: die Gattungsliste ist durchgefallen — nicht der Leser.</p>
  <p><b>Blind:</b> Die Vermutung des Modells steht nicht im Bogen. Kriterien und Grenzfälle stehen in den Gattungs-Kriterienblättern.</p>
  <p><b>Volltext:</b> Kein Fall ist gekürzt. Die Zeichenzahl steht in jedem Kopf.</p>
  <table class="sch"><tr><td colspan="2"><b>Schichtung nach Satztyp</b> — damit nicht nur die leichten Fälle gemessen werden</td></tr>
  ${SCHICHTEN.map((s) => `<tr><td><b>${s.label}</b> — ${esc(s.erklaerung)}</td><td style="text-align:right">${proSchicht.get(s.id) ?? 0} Fälle</td></tr>`).join('')}
  <tr><td>Gegenproben (belegbar ohne Adressat)</td><td style="text-align:right">${gegen.length} Fälle</td></tr></table>
</div>
${sample.map((d, i) => fallBlock(d, i + 1, false)).join('')}
${gegen.map((d, i) => fallBlock(d, sample.length + i + 1, true)).join('')}
<div class="bar">
  <button class="p" onclick="kopieren()">Ergebnis kopieren</button>
  <button onclick="if(confirm('Alle Antworten verwerfen?'))document.querySelectorAll('input').forEach(i=>{i.checked=false;i.value=''})">Zurücksetzen</button>
  <span id="status"></span>
</div>
<script>
const N=${faelle.length};
function kopieren(){
  const z=['| # | Quelle | Akteur (wörtlich) | Gattung | mehrfach |','|---|---|---|---|---|'];
  const q=${JSON.stringify(faelle.map((d) => `${d.source} · ${d.paragraphNumber}`))};
  let offen=0;
  for(let i=1;i<=N;i++){
    const g=document.querySelector('input[name="g'+i+'"]:checked');
    const r=document.getElementById('r'+i).value.trim();
    const m=document.querySelector('input[name="m'+i+'"]').checked?'ja':'';
    if(!g)offen++;
    z.push('| '+String(i).padStart(2,'0')+' | '+q[i-1]+' | '+r+' | '+(g?g.value:'—')+' | '+m+' |');
  }
  navigator.clipboard.writeText(z.join('\\n')).then(()=>{
    document.getElementById('status').textContent=offen?('kopiert — '+offen+' Fälle noch ohne Gattung'):'kopiert — alle '+N+' Fälle beantwortet';
  });
}
</script></div></body></html>`;

  const out = resolve(__dirname, '../../../../docs/evals/the692-gattungs-bogen.html');
  writeFileSync(out, html);

  console.log(`\n  Korpus            : ${alle.length} Bestimmungen (${eineSprache.length} deutsch)`);
  for (const s of SCHICHTEN) console.log(`  Schicht ${s.label.padEnd(24)}: ${proSchicht.get(s.id) ?? 0} Fälle`);
  console.log(`  Gegenproben       : ${gegen.length}`);
  console.log(`  Fälle gesamt      : ${faelle.length}`);
  console.log(`  Volltext          : ja, ${Math.min(...faelle.map((d) => String(d.fullText ?? '').length))}–${Math.max(...faelle.map((d) => String(d.fullText ?? '').length))} Zeichen`);
  console.log(`\n  → ${out}`);
  await conn.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
