/**
 * requirement-worksheet — HTML-Labelvorlage für Stufe B (Requirement → Element).
 *
 * Zeigt je Requirement den architektursprachlichen Titel + Beschreibung +
 * Priorität und die Kandidatenliste. Der Labeler hakt an, welche Elemente das
 * Requirement erfüllen MÜSSEN — Architektur gegen Architektur, kein
 * Juristensprech-Sprung mehr. Bias-frei: keine Vorauswahl, gold/notes werden
 * nicht eingebettet.
 *
 *   npm run req:worksheet -- src/evals/golden/requirements.self.v1.json ~/Desktop/req-labeling.html
 *
 * Linear: THE-378 (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRequirementGolden, type RequirementGoldenSet } from '../evals/requirementsGolden';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderRequirementForm(set: RequirementGoldenSet): string {
  // Bias-freier Blind-Datensatz (nur zum Rekonstruieren des Schemas beim Export).
  const blind = {
    version: set.version,
    rubricRef: set.rubricRef,
    candidates: set.candidates.map(c => ({ id: c.id, name: c.name, type: c.type, description: c.description })),
    requirements: set.requirements.map(r => ({
      reqId: r.reqId, source: r.source, paragraphNumber: r.paragraphNumber,
      title: r.title, description: r.description, priority: r.priority,
    })),
  };
  const embedded = JSON.stringify(blind).replace(/</g, '\\u003c');

  const cards = set.requirements
    .map((r, ri) => {
      const cands = set.candidates
        .map(
          (el, ei) => `
        <label class="cand">
          <input type="checkbox" id="cb_${ri}_${ei}">
          <span class="cbx"></span>
          <span class="cand-body">
            <span class="nm">${esc(el.name)} <em class="ty">${esc(el.type)}</em></span>
            ${el.description ? `<span class="ds">${esc(el.description)}</span>` : ''}
          </span>
        </label>`,
        )
        .join('');
      return `
    <section class="req" data-req="${esc(r.reqId)}">
      <div class="req-hd">
        <span class="pri pri-${esc(r.priority)}">${esc(r.priority.toUpperCase())}</span>
        <span class="ttl">${esc(r.title)}</span>
        <span class="src">${esc(r.source.toUpperCase())} ${esc(r.paragraphNumber)}</span>
      </div>
      <div class="desc">${esc(r.description)}</div>
      <div class="q">Welche Elemente MÜSSEN dieses Requirement erfüllen? (nichts ankreuzen = kein Element / Lücke)</div>
      <div class="cands">${cands}</div>
      <div class="meta">
        <label class="amb"><input type="checkbox" id="amb_${ri}"> unsicher</label>
        <input type="text" class="note" id="note_${ri}" placeholder="Notiz (optional)">
      </div>
    </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Requirement-Labeling — ${esc(set.version)}</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1a2233; --muted:#5b6675; --line:#dfe3ea; --accent:#7c3aed; --ok:#16a34a; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  header { position:sticky; top:0; z-index:10; background:#111827; color:#fff; padding:12px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; box-shadow:0 1px 6px rgba(0,0,0,.2); }
  header h1 { font-size:15px; margin:0; font-weight:600; }
  header .grow { flex:1; }
  header input { padding:7px 10px; border-radius:7px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
  header button { padding:8px 16px; border:0; border-radius:7px; background:var(--accent); color:#fff; font-weight:600; font-size:14px; cursor:pointer; }
  #prog { font-variant-numeric:tabular-nums; color:#cbd5e1; font-size:13px; }
  .wrap { max-width:900px; margin:0 auto; padding:20px; }
  .intro { background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:14px 18px; margin-bottom:22px; font-size:14px; }
  .req { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .req-hd { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:8px; }
  .ttl { font-weight:700; font-size:16px; } .src { margin-left:auto; color:var(--muted); font-size:12px; text-transform:uppercase; }
  .pri { font-size:11px; font-weight:700; padding:2px 8px; border-radius:5px; color:#fff; }
  .pri-must { background:#dc2626; } .pri-should { background:#d97706; } .pri-may { background:#6b7280; }
  .desc { color:#26313f; background:#fafbfc; border-left:3px solid var(--accent); border-radius:6px; padding:10px 14px; margin-bottom:12px; font-size:14px; }
  .q { margin:6px 0 8px; font-size:13px; color:var(--muted); }
  .cands { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  @media (max-width:680px){ .cands{ grid-template-columns:1fr; } }
  .cand { display:flex; gap:9px; align-items:flex-start; padding:7px 10px; border:1px solid var(--line); border-radius:8px; cursor:pointer; }
  .cand:hover { border-color:var(--accent); background:#faf9ff; }
  .cand input { position:absolute; opacity:0; }
  .cbx { flex:0 0 auto; width:18px; height:18px; border:2px solid #b8c0cc; border-radius:5px; margin-top:1px; }
  .cand input:checked ~ .cbx { background:var(--ok); border-color:var(--ok); }
  .cand input:checked ~ .cbx::after { content:"✓"; color:#fff; font-size:12px; display:block; text-align:center; line-height:14px; }
  .cand input:checked ~ .cand-body .nm { color:var(--ok); }
  .cand-body { display:flex; flex-direction:column; min-width:0; }
  .nm { font-weight:600; font-size:14px; } .ty { font-weight:400; color:var(--muted); font-style:normal; font-size:11px; background:#eef1f5; padding:1px 5px; border-radius:4px; margin-left:4px; }
  .ds { color:var(--muted); font-size:12px; margin-top:2px; }
  .meta { display:flex; gap:14px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  .amb { font-size:13px; color:var(--muted); } .note { flex:1; min-width:180px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style></head>
<body>
<header>
  <h1>Requirement → Element Labeling</h1>
  <span id="prog">0</span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name">
  <button onclick="exportJSON()">⬇ Export JSON</button>
</header>
<div class="wrap">
  <div class="intro">
    <b>Aufgabe:</b> Für jedes <b>Requirement</b> (schon in Architektursprache übersetzt) ankreuzen, welche
    Elemente es <b>erfüllen müssen</b>. Leitfrage: „Muss an DIESEM Element etwas gebaut/geändert/nachgewiesen
    werden, damit dieses Requirement erfüllt ist?" — Nichts ankreuzen ist gültig (Lücke / kein System).
    Facts stehen je Element in der Beschreibung (z. B. <code>holds account,credentials</code>).
  </div>
  ${cards}
  <footer>${set.requirements.length} Requirements · ${set.candidates.length} Kandidaten · Version ${esc(set.version)}</footer>
</div>
<script>
const SET = ${embedded};
function updateProg(){ let n=0; SET.requirements.forEach((r,ri)=>SET.candidates.forEach((_,ei)=>{ if(document.getElementById('cb_'+ri+'_'+ei).checked) n++; })); document.getElementById('prog').textContent = n+' Häkchen'; }
document.addEventListener('change', updateProg);
function download(text,name){ const b=new Blob([text],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function exportJSON(){
  const annotator=(document.getElementById('annotator').value||'').trim()||'annotator-b';
  const today=new Date().toISOString().slice(0,10);
  const out={ version:SET.version.replace(/-blind$/,''), frozen:false, rubricRef:SET.rubricRef||'../RUBRIC.md', candidates:SET.candidates, requirements:[] };
  SET.requirements.forEach((r,ri)=>{
    const gold=[]; SET.candidates.forEach((el,ei)=>{ if(document.getElementById('cb_'+ri+'_'+ei).checked) gold.push(el.id); });
    const amb=document.getElementById('amb_'+ri).checked;
    const note=(document.getElementById('note_'+ri).value||'').trim();
    const nc=Object.assign({}, r, {goldElementIds:gold, ambiguous:amb, annotator, labeledAt:today});
    if(note) nc.notes=note;
    out.requirements.push(nc);
  });
  download(JSON.stringify(out,null,2), 'req-labeled-'+annotator+'.json');
}
updateProg();
</script>
</body></html>
`;
}

function main(): void {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('Usage: requirement-worksheet <requirements.json> <out.html>');
    process.exitCode = 2;
    return;
  }
  const set = loadRequirementGolden(path.resolve(inPath));
  fs.writeFileSync(path.resolve(outPath), renderRequirementForm(set));
  console.log(
    `[req-worksheet] ${set.requirements.length} Requirements → ${outPath}\n` +
      `[req-worksheet] Im Browser labeln, Export, dann: npm run req:kappa -- ${inPath} <export>.json`
  );
}

if (require.main === module) main();
