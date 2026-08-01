/**
 * pair-worksheet — erzeugt aus einer Stichprobe des Paar-Prüfsatzes eine
 * EINZELNE, in sich geschlossene HTML-Datei zum Adjudizieren im Browser
 * (THE-382 Slice 1, Task 4). Muster: relations-worksheet.ts.
 *
 * ── VIER EIGENSCHAFTEN, DIE DEN ANKER TRAGEN ──
 *
 * 1. GEBLENDET. Der Mensch sieht exakt das, was der Richter sieht — kein
 *    Gesetzesname, kein Artikel-Zitat. Sonst ist eine Abweichung doppeldeutig:
 *    anderes Urteil oder anderer Informationsstand?
 * 2. KEIN MASCHINENURTEIL. Keine Vorbelegung, kein Arm-Etikett, keine
 *    kanonische Handlung. Ein vorbelegter Wert misst Zustimmung, nicht Urteil.
 *    (Hier weicht das Blatt bewusst von `relations-worksheet.ts` ab, das
 *    LLM-Vorschläge adjudizieren lässt — dort ist Vorbelegung der Zweck, hier
 *    wäre sie der Fehler.)
 * 3. DIESELBE RUBRIK. Die vier Definitionen stehen wörtlich im Blatt. Bekämen
 *    Mensch und Richter verschiedene Rubriken, misst der Kappa die Differenz
 *    der Rubriken statt die der Urteile.
 * 4. „UNSICHER" IST WÄHLBAR und ist der Startzustand. Ein erzwungenes Urteil
 *    täuscht Gewissheit vor.
 *
 *   npm run pairs:worksheet -- 40 /tmp/pair-label.html
 *
 * Linear: THE-382 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import { blindLawNames, PAIR_RELATIONS } from '@thearchitect/shared';
import { loadActionGolden, DEFAULT_ACTION_GOLDEN_PATH, type ActionGoldenCase } from '../evals/actionGolden';
import { samplePairs } from '../evals/pairGold';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Die Rubrik — wörtlich die des Richters (`PAIR_RELATION_SYSTEM`). Änderungen
 * hier UND dort, sonst beantworten die beiden verschiedene Fragen.
 */
const RUBRIC: { id: (typeof PAIR_RELATIONS)[number]; label: string; text: string }[] = [
  {
    id: 'equal',
    label: 'gleich (equal)',
    text: 'Eine gemeinsam betriebene Maßnahme erfüllt BEIDE vollständig. Unterschiede beschränken sich auf Parameter (Adressat, Frist, Schwelle).',
  },
  {
    id: 'subset',
    label: 'enthalten (subset)',
    text: 'Die eine Pflicht ist vollständig in der anderen enthalten: wer die weitere erfüllt, erfüllt die engere automatisch mit.',
  },
  {
    id: 'intersects',
    label: 'überschneidet sich (intersects)',
    text: 'Es gibt einen gemeinsamen Kern, aber JEDE Pflicht verlangt zusätzlich etwas, das die andere nicht verlangt. Eine Maßnahme deckt beide nur teilweise ab.',
  },
  {
    id: 'unrelated',
    label: 'unverwandt (unrelated)',
    text: 'Getrennte Maßnahmen. Kein gemeinsamer Kern.',
  },
];

/** Genau die Darstellung, die auch `renderObligation` an den Richter gibt. */
function sideHtml(tag: 'A' | 'B', o: { title: string; text: string }): string {
  return `
        <div class="side side-${tag.toLowerCase()}">
          <div class="side-hd"><span class="tag">${tag}</span></div>
          <div class="ttl">${esc(blindLawNames(o.title))}</div>
          <div class="law">${esc(blindLawNames(o.text))}</div>
        </div>`;
}

function optionsHtml(): string {
  return (
    '<option value="__unsure" selected>— unsicher (zählt nicht als Urteil)</option>' +
    RUBRIC.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('')
  );
}

/**
 * Verschränkt die beiden Arme im Reißverschluss, proportional zu ihrer Größe.
 * Deterministisch — dasselbe Blatt zweimal erzeugt ist dasselbe Blatt.
 */
export function interleaveByArm(cases: ActionGoldenCase[]): ActionGoldenCase[] {
  const t = cases.filter((c) => c.arm === 'T');
  const k = cases.filter((c) => c.arm === 'K');
  if (t.length === 0 || k.length === 0) return [...cases];

  const out: ActionGoldenCase[] = [];
  const total = t.length + k.length;
  let ti = 0;
  let ki = 0;
  for (let i = 0; i < total; i++) {
    // Nimm aus dem Arm, der gemessen an seinem Anteil gerade "zurückliegt".
    const takeT = ki >= k.length || (ti < t.length && ti * k.length <= ki * t.length);
    out.push(takeT ? t[ti++] : k[ki++]);
  }
  return out;
}

/**
 * Rendert die Stichprobe als eigenständiges HTML-Formular. REIN (kein I/O),
 * damit die vier Eigenschaften oben testbar sind statt nur behauptet.
 *
 * Die Fälle werden NICHT nach Arm ausgegeben, sondern deterministisch
 * verschränkt — ein Block aus lauter Arm-K-Fällen wäre als solcher erkennbar
 * und würde das Urteil des Menschen ankern. Dasselbe Motiv wie beim Mischen
 * der Kanarienvögel (MV-8).
 */
export function renderPairWorksheet(cases: ActionGoldenCase[]): string {
  const interleaved = interleaveByArm(cases);

  const embedded = JSON.stringify({
    caseIds: interleaved.map((c) => c.id),
  }).replace(/</g, '\\u003c');

  const cards = interleaved
    .map(
      (c, ci) => `
    <section class="case">
      <div class="no">Fall ${ci + 1} / ${interleaved.length}</div>
      <div class="pair">${sideHtml('A', c.a)}${sideHtml('B', c.b)}</div>
      <div class="q">Wie verhalten sich die MASSNAHMEN zueinander, die zur Erfüllung nötig sind?</div>
      <div class="controls">
        <label class="axis">
          <span class="axl">Beziehung</span>
          <select id="rel_${ci}" class="relsel" data-ci="${ci}">${optionsHtml()}</select>
        </label>
        <label class="axis">
          <span class="axl">Welche ist die weitere?</span>
          <select id="wid_${ci}" class="widsel" disabled>
            <option value="A">A ist die weitere (B steckt in A)</option>
            <option value="B">B ist die weitere (A steckt in B)</option>
          </select>
        </label>
      </div>
      <input type="text" class="note" id="note_${ci}" placeholder="Notiz (optional)">
    </section>`
    )
    .join('');

  const rubricHtml = RUBRIC.map((r) => `<li><b>${esc(r.label)}</b> — ${esc(r.text)}</li>`).join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paar-Adjudikation — menschliches Gold</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1a2233; --muted:#5b6675; --line:#dfe3ea; --accent:#7c3aed; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  header { position:sticky; top:0; z-index:10; background:#111827; color:#fff; padding:12px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; box-shadow:0 1px 6px rgba(0,0,0,.2); }
  header h1 { font-size:15px; margin:0; font-weight:600; }
  header .grow { flex:1; }
  header input { padding:7px 10px; border-radius:7px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
  header button { padding:8px 16px; border:0; border-radius:7px; background:var(--accent); color:#fff; font-weight:600; font-size:14px; cursor:pointer; }
  #prog { font-variant-numeric:tabular-nums; color:#cbd5e1; font-size:13px; }
  .wrap { max-width:980px; margin:0 auto; padding:20px; }
  .rubric { background:#fffbe6; border:1px solid #f2e2a8; border-radius:10px; padding:14px 20px 14px 18px; margin-bottom:20px; font-size:14px; }
  .rubric h2 { font-size:14px; margin:0 0 8px; }
  .rubric ul { margin:0; padding-left:18px; }
  .rubric li { margin-bottom:6px; }
  .rubric .hint { margin-top:10px; color:var(--muted); font-size:13px; }
  .case { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .no { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.03em; margin-bottom:10px; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .side { border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .side-a { border-left:3px solid var(--accent); }
  .side-b { border-left:3px solid #16a34a; }
  .side-hd { margin-bottom:6px; }
  .tag { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; background:var(--accent); color:#fff; font-weight:700; font-size:12px; }
  .side-b .tag { background:#16a34a; }
  .ttl { font-weight:600; margin-bottom:6px; }
  .law { background:#fafbfc; border:1px solid var(--line); border-radius:6px; padding:10px 12px; color:#26313f; white-space:pre-wrap; max-height:220px; overflow:auto; font-size:13px; }
  .q { margin:14px 0 8px; font-size:13px; color:var(--muted); }
  .controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; }
  .axis { display:flex; flex-direction:column; gap:4px; }
  .axl { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
  .axis select { padding:7px 9px; border:1px solid var(--line); border-radius:7px; font-size:14px; background:#fff; }
  .axis select:disabled { background:#f1f2f5; color:var(--muted); cursor:not-allowed; }
  .note { width:100%; margin-top:12px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style>
</head>
<body>
<header>
  <h1>Paar-Adjudikation</h1>
  <span id="prog"></span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name (annotator)">
  <button onclick="exportJSON()">⬇ Export als JSON</button>
</header>
<div class="wrap">
  <div class="rubric">
    <h2>Die Frage: Wie verhalten sich die MASSNAHMEN zueinander — nicht die Texte?</h2>
    <ul>${rubricHtml}</ul>
    <div class="hint">„Unsicher" ist eine gültige Antwort und der Startzustand — ein erzwungenes Urteil hilft niemandem.
    Die Herkunft der Pflichten ist absichtlich nicht sichtbar.</div>
  </div>
  ${cards}
  <footer>${interleaved.length} Fälle · geblendet · nach Export: <code>pairs:ingest</code></footer>
</div>
<script>
const SET = ${embedded};
function syncWider(ci){
  const rel = document.getElementById('rel_'+ci).value;
  // Die Richtung existiert NUR bei subset — strukturell erzwungen, damit ein
  // ungueltiges Urteil gar nicht erst konstruierbar ist.
  document.getElementById('wid_'+ci).disabled = (rel !== 'subset');
}
function syncAll(){ SET.caseIds.forEach(function(_,ci){ syncWider(ci); }); }
function updateProg(){
  let done=0;
  SET.caseIds.forEach(function(_,ci){ if(document.getElementById('rel_'+ci).value!=='__unsure') done++; });
  document.getElementById('prog').textContent = done+' / '+SET.caseIds.length+' Fälle entschieden';
}
document.addEventListener('change', function(){ syncAll(); updateProg(); });
function download(text, name){
  const b=new Blob([text],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(){
  const annotator=(document.getElementById('annotator').value||'').trim()||'annotator-a';
  const out={version:'actions.human.v1', sourceSet:'actions.v1', annotator:annotator,
             blinded:true, labeledAt:new Date().toISOString().slice(0,10), verdicts:[]};
  SET.caseIds.forEach(function(caseId,ci){
    const v=document.getElementById('rel_'+ci).value;
    const note=(document.getElementById('note_'+ci).value||'').trim();
    const nv={caseId:caseId, relation: (v==='__unsure' ? null : v)};
    if(v==='subset') nv.wider=document.getElementById('wid_'+ci).value;
    if(note) nv.notes=note;
    out.verdicts.push(nv);
  });
  download(JSON.stringify(out,null,2), 'actions-human-'+annotator+'.json');
}
syncAll();
updateProg();
</script>
</body>
</html>
`;
}

function main(): void {
  const [countArg, outPath] = process.argv.slice(2);
  if (!countArg || !outPath) {
    console.error('Usage: pair-worksheet <count> <out.html> [golden.json]');
    process.exitCode = 2;
    return;
  }
  const set = loadActionGolden(process.argv[4] ? path.resolve(process.argv[4]) : DEFAULT_ACTION_GOLDEN_PATH);
  const cases = samplePairs(set, Number(countArg));
  fs.writeFileSync(path.resolve(outPath), renderPairWorksheet(cases));
  console.log(
    `[pair-worksheet] ${cases.length} Fälle (T ${cases.filter((c) => c.arm === 'T').length} · ` +
      `K ${cases.filter((c) => c.arm === 'K').length}) → ${outPath}\n` +
      `[pair-worksheet] Im Browser adjudizieren, „Export als JSON", dann: npm run pairs:ingest -- <datei>`
  );
}

if (require.main === module) {
  main();
}
