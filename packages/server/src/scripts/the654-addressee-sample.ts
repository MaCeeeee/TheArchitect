/**
 * THE-654: Die Stichprobe für die Adressaten-Adjudikation. READ-ONLY.
 *
 * ── WAS GEFRAGT WIRD ──
 *
 * 389 von 1746 Korpus-Bestimmungen tragen keine Adressatenklasse. Zwei sehr
 * verschiedene Gründe stecken darin, und die Zahl trennt sie nicht:
 *
 *   – die Bestimmung hat schlicht keinen Normadressaten (Begriffsbestimmungen,
 *     Inkrafttreten, Ausschussverfahren) → korrekt leer
 *   – sie HAT einen, aber der geschlossene Typraum kennt ihn nicht
 *     (Normungsorganisation, notifizierte Stelle, Beratungsgremium) → sie ist
 *     für die Anwendbarkeit unsichtbar, obwohl sie jemanden bindet
 *
 * ── WARUM VIER ANTWORTEN, NICHT ZWEI ──
 *
 * Ein binäres „hat Adressat: ja/nein" würde genau die Unterscheidung
 * verschlucken, um die es geht — ein Ja hiesse mal „Typisierung hat gepatzt"
 * und mal „Typraum ist zu eng". Der Antwortraum trennt das (Präzedenz:
 * `reference_binary_rubric_trap` — vier Typen hoben κ von 0,308 auf 0,681).
 *
 * ── BLIND ──
 *
 * Die Vermutung des Modells steht NICHT im Bogen. Sie würde das Urteil ankern;
 * der Vergleich gehört hinter die Adjudikation, nicht davor.
 *
 * Lauf:
 *   packages/server$ npx ts-node --transpile-only src/scripts/the654-addressee-sample.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

/**
 * Titel, die typischerweise keinen Normadressaten tragen.
 *
 * Der Filter ist ein VORFILTER, keine Wahrheit — die Adjudikation entscheidet.
 * Er soll nur verhindern, dass die 30 Bögen mit Begriffsbestimmungen volllaufen.
 *
 * `subject.?matter` statt `subject matter`: Der erste Bogen enthielt DSGVO
 * Art. 1 „Subject-matter and objectives", weil die englische Fassung einen
 * Bindestrich setzt. Ein Fall von 389 — die Lücke war klein, aber sichtbar,
 * und ein offensichtliches C im Bogen verschwendet ein Urteil.
 */
const RAHMEN =
  /gegenstand|begriffsbestimmung|definition|anwendungsbereich|geltungsbereich|inkrafttreten|übergangs|aufhebung|änderung|überprüfung|bericht|ausschuss|befugnis|delegierte|durchführungsrechtsakt|sanktion|adressaten|schlussbestimmung|ziel|subject.?matter|scope|entry into force|repeal|amendment|review|report|committee|delegat|transitional/i;

const SAMPLE_SIZE = 30;
const CONTROL_SIZE = 5;
const EXCERPT = 700;

interface Doc {
  source: string;
  regulationKey: string;
  paragraphNumber?: string;
  title?: string;
  fullText?: string;
  typing?: { partyRole?: string | null };
}

/** Eine Fassung je Gesetz — sonst adjudiziert man denselben Artikel zweimal. */
function dedupeByLaw(docs: Doc[]): Doc[] {
  const seen = new Set<string>();
  const out: Doc[] = [];
  for (const d of docs) {
    const law = d.source.replace(/-(de|en)$/, '');
    const key = `${law}|${d.paragraphNumber ?? d.regulationKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * Reihum je Gesetz ziehen, statt der Reihe nach.
 *
 * Eine Stichprobe aus den ersten 30 Treffern käme aus zwei Gesetzen — dann
 * misst man die Eigenart einer Verordnung und nennt es Typraum. Deterministisch
 * (kein Zufall), damit derselbe Lauf denselben Bogen erzeugt.
 */
function stratify(docs: Doc[], n: number): Doc[] {
  const byLaw = new Map<string, Doc[]>();
  for (const d of docs) {
    const law = d.source.replace(/-(de|en)$/, '');
    byLaw.set(law, [...(byLaw.get(law) ?? []), d]);
  }
  for (const list of byLaw.values()) list.sort((a, b) => a.regulationKey.localeCompare(b.regulationKey));
  const laws = [...byLaw.keys()].sort();
  const out: Doc[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const law of laws) {
      const list = byLaw.get(law)!;
      if (round < list.length && out.length < n) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

function excerpt(t?: string): string {
  const clean = (t ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT ? `${clean.slice(0, EXCERPT)}…` : clean || '(kein Text im Korpus)';
}

function block(d: Doc, i: number, isControl: boolean): string {
  return [
    `### ${String(i).padStart(2, '0')} · ${d.source} · ${d.paragraphNumber ?? '?'}${isControl ? '   *(Gegenprobe)*' : ''}`,
    '',
    `**${d.title ?? '(ohne Titel)'}**`,
    '',
    `> ${excerpt(d.fullText)}`,
    '',
    '| | |',
    '|---|---|',
    '| **Urteil** | `A` / `B` / `C` / `D` → ' + ' '.repeat(20) + ' |',
    '| **Adressat (bei A oder B)** | ' + ' '.repeat(40) + ' |',
    '| **Notiz** | ' + ' '.repeat(40) + ' |',
    '',
    `<sub>\`${d.regulationKey}\`</sub>`,
    '',
    '---',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt — ohne Korpus keine Stichprobe.');
  const conn = await getCorpusConnection().asPromise();
  const all = (await conn
    .collection('regulations')
    .find({}, { projection: { source: 1, regulationKey: 1, paragraphNumber: 1, title: 1, fullText: 1, typing: 1 } })
    .toArray()) as unknown as Doc[];

  // Eigene Regel: eine leere Messung ist kein Bestehen (THE-653).
  if (all.length === 0) throw new Error('Korpus lieferte 0 Bestimmungen — die Abfrage stimmt nicht.');

  const ohneRolle = all.filter((d) => !d.typing?.partyRole);
  const verdacht = dedupeByLaw(ohneRolle.filter((d) => !RAHMEN.test(d.title ?? '')));
  const rahmen = dedupeByLaw(ohneRolle.filter((d) => RAHMEN.test(d.title ?? '')));

  const sample = stratify(verdacht, SAMPLE_SIZE);
  const control = stratify(rahmen, CONTROL_SIZE);
  if (sample.length < SAMPLE_SIZE) {
    throw new Error(`Nur ${sample.length} Verdachtsfälle gezogen, ${SAMPLE_SIZE} verlangt.`);
  }
  const laws = new Set(sample.map((d) => d.source.replace(/-(de|en)$/, '')));
  if (laws.size < 4) throw new Error(`Stichprobe deckt nur ${laws.size} Gesetze ab, mindestens 4 verlangt.`);

  const md = [
    '# THE-654 — Adjudikation: hat diese Bestimmung einen Adressaten?',
    '',
    `**Erzeugt am 2026-08-10** aus ${all.length} Korpus-Bestimmungen · ${ohneRolle.length} ohne Adressatenklasse`,
    `· davon ${verdacht.length} mit Sachtitel (Verdacht) und ${rahmen.length} Rahmenbestimmungen.`,
    `Stichprobe: **${sample.length}** über **${laws.size}** Gesetze, plus **${control.length}** Gegenproben.`,
    '',
    '> Erzeugt von `packages/server/src/scripts/the654-addressee-sample.ts` — derselbe Lauf ergibt denselben Bogen.',
    '',
    '## Die vier Urteile',
    '',
    '| | Bedeutung | Was daraus folgt |',
    '|---|---|---|',
    '| **A** | Adressat vorhanden — **und er steht im Typraum unten** | Die Typisierung hat ihn übersehen. Extraktions-Problem, kein Typraum-Problem. |',
    '| **B** | Adressat vorhanden — **aber er fehlt im Typraum** | Der gesuchte Fall. Bitte im Feld darunter benennen, wie er heißen müsste. |',
    '| **C** | **Kein** Normadressat — die Bestimmung richtet sich an niemanden (Verfahren, Definition, Schlussbestimmung) | Korrekt leer. |',
    '| **D** | unklar / mehrdeutig | Zählt als eigene Klasse, nicht als Nein. |',
    '',
    '**Die Leitfrage:** *Wen verpflichtet dieser Artikel — wer muss danach etwas tun oder lassen?*',
    'Nicht: wovon handelt er. Ein Artikel über Normungsaufträge verpflichtet die Normungsorganisation,',
    'auch wenn das Wort „Pflicht" nicht vorkommt.',
    '',
    '## Der Typraum heute (19 Klassen)',
    '',
    '```',
    'member_state · supervisory_authority · financial_entity · provider · manufacturer',
    'controller · conformity_assessment_body · trust_service_provider · obligated_enterprise',
    'data_holder · ict_third_party_provider · essential_important_entity · processor',
    'data_subject · ecs_provider · importer · distributor · authorized_representative · deployer',
    '```',
    '',
    '## Warum die Gegenproben mitlaufen',
    '',
    `Die ${control.length} Fälle am Ende stammen aus den ${rahmen.length} Rahmenbestimmungen — sie sollten **C** ergeben.`,
    'Tun sie es nicht, trennt die Titel-Heuristik nicht, was sie zu trennen vorgibt, und die Zahl',
    `„${verdacht.length} Verdachtsfälle" ist selbst fragwürdig. Sie sind als *(Gegenprobe)* markiert, damit`,
    'beim Auswerten klar ist, welche Rolle sie spielen — ihre Antwort ist trotzdem offen.',
    '',
    '---',
    '',
    '## Stichprobe',
    '',
    ...sample.map((d, i) => block(d, i + 1, false)),
    '## Gegenproben',
    '',
    ...control.map((d, i) => block(d, sample.length + i + 1, true)),
    '## Auswertung (nach der Adjudikation ausfüllen)',
    '',
    '| Urteil | Anzahl | |',
    '|---|---|---|',
    '| A — Adressat im Typraum, übersehen | | Extraktions-Qualität, gehört zu THE-421/432 |',
    '| B — Adressat fehlt im Typraum | | **die gesuchte Zahl** |',
    '| C — kein Adressat | | korrekt leer |',
    '| D — unklar | | |',
    '',
    '**Schwelle aus dem Ticket:** Mindestens ein fehlender Klassenkandidat mit **≥ 5** Bestimmungen belegt',
    '→ Richtung A/C des Optionenblocks. Bleibt B unter der Schwelle, ist Option B (explizites',
    '`noAddressee`) die ehrliche Antwort und der Rest eine Anzeigefrage.',
    '',
    '**Hochrechnung:** Anteil B in der Stichprobe × ' + String(verdacht.length) + ' ≈ betroffene Bestimmungen im Korpus.',
    '',
  ].join('\n');

  const out = resolve(__dirname, '../../../../docs/evals/the654-addressee-adjudication.md');
  writeFileSync(out, md);
  console.log(`\n  Korpus            : ${all.length} Bestimmungen`);
  console.log(`  ohne Adressat     : ${ohneRolle.length}`);
  console.log(`  davon Verdacht    : ${verdacht.length} (nach Sprach-Dedupe)`);
  console.log(`  davon Rahmen      : ${rahmen.length}`);
  console.log(`  Stichprobe        : ${sample.length} über ${laws.size} Gesetze — ${[...laws].sort().join(', ')}`);
  console.log(`  Gegenproben       : ${control.length}`);
  console.log(`\n  → ${out}\n`);
  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
