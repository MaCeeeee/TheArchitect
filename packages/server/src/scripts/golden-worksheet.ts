/**
 * golden-worksheet — erzeugt aus einem Golden-Set eine EINZELNE, in sich
 * geschlossene HTML-Datei zum Labeln im Browser (kein Server, kein JSON-Editor).
 *
 * Eine Fach-/Rechtsperson öffnet die HTML, liest je Fall den Gesetzestext,
 * hakt die betroffenen Elemente an und klickt „Export" — heraus fällt ein
 * schema-gültiges Golden-JSON, das direkt in `golden:kappa` / `eval:mapping`
 * geht. Vorhandene goldElementIds/Notizen werden NICHT angezeigt (kein Bias),
 * daher kann man die Datei direkt aus `mapping.v2.json` erzeugen — ein
 * separater Blind-Schritt ist nicht nötig.
 *
 *   npm run golden:worksheet -- src/evals/golden/mapping.v2.json /tmp/labeling.html
 *
 * Linear: THE-379 (REQ-EVAL-001.1) · Epic THE-378 (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadGoldenSet, type GoldenSet } from '../evals/goldenSet';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rendert das Golden-Set als eigenständiges HTML-Formular. Reine Funktion
 * (kein I/O) — testbar. Checkboxen starten IMMER leer; A's goldElementIds
 * und notes werden bewusst nicht gerendert.
 */
export function renderLabelingForm(set: GoldenSet): string {
  // Bias-frei: gold/notes/ambiguous/annotator werden aus dem eingebetteten
  // Datensatz entfernt (nicht nur aus der Anzeige — auch view-source zeigt sie nicht).
  const blind = {
    version: set.version,
    frozen: false,
    rubricRef: set.rubricRef,
    cases: set.cases.map(c => ({
      caseId: c.caseId,
      source: c.source,
      paragraphNumber: c.paragraphNumber,
      title: c.title,
      fullText: c.fullText,
      language: c.language,
      jurisdiction: c.jurisdiction,
      candidates: c.candidates,
    })),
  };
  const embedded = JSON.stringify(blind).replace(/</g, '\\u003c');

  const cards = set.cases
    .map((c, ci) => {
      const cands = c.candidates
        .map(
          (el, ei) => `
        <label class="cand">
          <input type="checkbox" id="cb_${ci}_${ei}">
          <span class="cbx"></span>
          <span class="cand-body">
            <span class="nm">${esc(el.name)} <em class="ty">${esc(el.type)}</em></span>
            ${el.description ? `<span class="ds">${esc(el.description)}</span>` : ''}
          </span>
        </label>`,
        )
        .join('');
      return `
    <section class="case" data-case="${esc(c.caseId)}">
      <div class="case-hd">
        <span class="src">${esc(c.source.toUpperCase())} ${esc(c.paragraphNumber)}</span>
        <span class="ttl">${esc(c.title ?? '')}</span>
        <span class="lang">${esc(c.language)} · ${esc(c.jurisdiction)}</span>
      </div>
      <div class="law">${esc(c.fullText)}</div>
      <div class="q">Welche Elemente sind von diesem Paragraphen <b>materiell betroffen</b>? (nichts ankreuzen = kein Element betroffen)</div>
      <div class="cands">${cands}</div>
      <div class="meta">
        <label class="amb"><input type="checkbox" id="amb_${ci}"> mehrdeutig / unsicher</label>
        <input type="text" class="note" id="note_${ci}" placeholder="Notiz zur Begründung (optional)">
      </div>
    </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Golden-Set Labeling — ${esc(set.version)}</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1a2233; --muted:#5b6675; --line:#dfe3ea; --accent:#7c3aed; --ok:#16a34a; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  header { position:sticky; top:0; z-index:10; background:#111827; color:#fff; padding:12px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; box-shadow:0 1px 6px rgba(0,0,0,.2); }
  header h1 { font-size:15px; margin:0; font-weight:600; }
  header .grow { flex:1; }
  header input { padding:7px 10px; border-radius:7px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
  header button { padding:8px 16px; border:0; border-radius:7px; background:var(--accent); color:#fff; font-weight:600; font-size:14px; cursor:pointer; }
  header button:hover { filter:brightness(1.1); }
  #prog { font-variant-numeric:tabular-nums; color:#cbd5e1; font-size:13px; }
  .wrap { max-width:860px; margin:0 auto; padding:20px; }
  .rubric { background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:14px 18px; margin-bottom:22px; font-size:14px; }
  .rubric summary { cursor:pointer; font-weight:600; color:var(--accent); }
  .rubric ul { margin:10px 0 0; padding-left:20px; } .rubric li { margin:4px 0; }
  .case { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .case-hd { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:10px; }
  .src { font-weight:700; color:var(--accent); }
  .ttl { font-weight:600; } .lang { margin-left:auto; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
  .law { background:#fafbfc; border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:6px; padding:12px 14px; color:#26313f; white-space:pre-wrap; max-height:220px; overflow:auto; font-size:14px; }
  .q { margin:14px 0 8px; font-size:13px; color:var(--muted); }
  .cand { display:flex; gap:10px; align-items:flex-start; padding:9px 11px; border:1px solid var(--line); border-radius:8px; margin-bottom:7px; cursor:pointer; }
  .cand:hover { border-color:var(--accent); background:#faf9ff; }
  .cand input { position:absolute; opacity:0; }
  .cbx { flex:0 0 auto; width:19px; height:19px; border:2px solid #b8c0cc; border-radius:5px; margin-top:1px; }
  .cand input:checked ~ .cbx { background:var(--ok); border-color:var(--ok); }
  .cand input:checked ~ .cbx::after { content:"✓"; color:#fff; font-size:13px; display:block; text-align:center; line-height:15px; }
  .cand input:checked ~ .cand-body .nm { color:var(--ok); }
  .cand-body { display:flex; flex-direction:column; }
  .nm { font-weight:600; } .ty { font-weight:400; color:var(--muted); font-style:normal; font-size:12px; background:#eef1f5; padding:1px 6px; border-radius:4px; margin-left:6px; }
  .ds { color:var(--muted); font-size:13px; margin-top:2px; }
  .meta { display:flex; gap:14px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  .amb { font-size:13px; color:var(--muted); } .note { flex:1; min-width:200px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style>
</head>
<body>
<header>
  <h1>Golden-Set Labeling</h1>
  <span id="prog">0 markiert</span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name (annotator)">
  <button onclick="exportJSON()">⬇ Export als JSON</button>
</header>
<div class="wrap">
  <details class="rubric">
    <summary>Kurz-Rubrik v2 — wann ist ein Element „betroffen"? (Details: RUBRIC.md)</summary>
    <ul>
      <li><b>match</b>, wenn der Paragraph das Element konkret <b>anpassen/prüfen/nachweisen</b> lässt: expliziter Scope, funktionale Pflicht, Datenbezug (s. Zwei-Stufen-Test), oder Nachweispflicht.</li>
      <li><b>Zwei-Stufen-Test für datenhaltende Systeme:</b> Verlangt der Paragraph eine <b>Fähigkeit im System selbst</b> (löschen können, absichern) → jeder Halter der Datenkategorie ist match, sofern die Daten in der Element-Beschreibung <b>explizit dokumentiert</b> sind. Verlangt er nur einen <b>Akt, den ein anderes Element ausführt</b> (Meldung, Verzeichnis, Bericht) → Datenhalter NICHT ankreuzen, nur den Ausführer.</li>
      <li><b>Merksatz:</b> „Muss an DIESEM Element etwas gebaut/geändert/nachgewiesen werden — oder steht es nur in einer Liste, die woanders geführt wird?"</li>
      <li><b>Adressaten-Test:</b> Richtet sich der Paragraph an Behörden/Mitgliedstaaten/EU-Gremien (nicht ans Unternehmen) → NICHTS ankreuzen, auch wenn ein Element thematisch passt.</li>
      <li><b>Regime-Grenze:</b> Ein Element, das die ähnliche Pflicht eines ANDEREN Gesetzes erfüllt (z. B. CSRD-Zyklus beim LkSG-Bericht, DSGVO-Meldeprozess bei LkSG-Prävention) → no-match.</li>
      <li><b>Capability + Prozess</b> schließen sich nicht aus: Capability ankreuzen, wenn das ganze Pflichtenbündel gemeint ist; den Prozess zusätzlich, wenn er eine namentlich geforderte Einzelpflicht implementiert.</li>
      <li><b>no-match</b> bei bloßer thematischer Nähe oder transitiver Betroffenheit (Hosting-Plattform, verbundene Systeme).</li>
      <li>Leitfrage: „Würde ein Auditor verlangen, dieses Element im Compliance-Nachweis für den Paragraphen aufzuführen?"</li>
      <li>Trifft <b>kein</b> Element zu → nichts ankreuzen (das ist ein gültiges „Hard Negative").</li>
      <li>50/50 → nicht ankreuzen <b>und</b> „mehrdeutig" markieren.</li>
    </ul>
  </details>
  ${cards}
  <footer>${set.cases.length} Fälle · Version ${esc(set.version)} · nach dem Export: <code>npm run golden:kappa</code></footer>
</div>
<script>
const SET = ${embedded};
function updateProg(){
  let n=0, t=0;
  SET.cases.forEach((c,ci)=>c.candidates.forEach((_,ei)=>{ t++; if(document.getElementById('cb_'+ci+'_'+ei).checked) n++; }));
  document.getElementById('prog').textContent = n+' / '+t+' Elemente markiert';
}
document.addEventListener('change', updateProg);
function download(text, name){
  const b=new Blob([text],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(){
  const annotator=(document.getElementById('annotator').value||'').trim()||'annotator-b';
  const today=new Date().toISOString().slice(0,10);
  const out={version:SET.version.replace(/-blind$/,''), frozen:false, rubricRef:SET.rubricRef||'../RUBRIC.md', cases:[]};
  SET.cases.forEach((c,ci)=>{
    const gold=[];
    c.candidates.forEach((el,ei)=>{ if(document.getElementById('cb_'+ci+'_'+ei).checked) gold.push(el.id); });
    const amb=document.getElementById('amb_'+ci).checked;
    const note=(document.getElementById('note_'+ci).value||'').trim();
    const nc=Object.assign({}, c, {goldElementIds:gold, ambiguous:amb, annotator, labeledAt:today});
    if(note) nc.notes=note; else delete nc.notes;
    out.cases.push(nc);
  });
  download(JSON.stringify(out,null,2), 'golden-labeled-'+annotator+'.json');
}
updateProg();
</script>
</body>
</html>
`;
}

function main(): void {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('Usage: golden-worksheet <golden.json> <out.html>');
    process.exitCode = 2;
    return;
  }
  const set = loadGoldenSet(path.resolve(inPath));
  const html = renderLabelingForm(set);
  fs.writeFileSync(path.resolve(outPath), html);
  console.log(
    `[worksheet] ${set.cases.length} Fälle → ${outPath}\n` +
      `[worksheet] Im Browser öffnen, ankreuzen, „Export als JSON", dann:\n` +
      `[worksheet]   npm run golden:kappa -- ${inPath} <exportierte-datei>.json`,
  );
}

if (require.main === module) {
  main();
}
