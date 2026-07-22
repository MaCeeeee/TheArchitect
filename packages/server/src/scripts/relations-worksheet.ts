/**
 * relations-worksheet — erzeugt aus einem Relations-Golden(-Draft) eine
 * EINZELNE, in sich geschlossene HTML-Datei zum Adjudizieren im Browser.
 *
 * Je Fall: ZWEI Paragraphen (A/B, aus verschiedenen Gesetzen) nebeneinander +
 * eine Relations-Dropdown (nur `inferred`-Typen aus der E7-Ontologie + "kein
 * Zusammenhang") + eine gekoppelte Richtungs-Dropdown. Optionen sind auf
 * vorhandene Labels VORBELEGT (LLM-Vorschlag adjudizieren); "— (offen)" =
 * noch nicht gelabelt, "kein Zusammenhang" = bewusste Negativ-Klasse (→ null).
 *
 * Kopplung Relation↔Direction (RelationsGoldenCaseSchema erzwingt das im
 * Schema; hier wird es strukturell im Formular selbst erzwungen): solange
 * keine Relation gewählt ist ("— offen" oder "kein Zusammenhang"), ist die
 * Richtungs-Dropdown DEAKTIVIERT — ein ungültiger Export (direction ohne
 * relation, oder direction bei relation:null) ist damit gar nicht erst
 * konstruierbar, unabhängig vom RUBRIC-Text.
 *
 *   npm run relations:worksheet -- src/evals/golden/relations.v1.draft.json /tmp/relations-label.html
 *
 * Linear: THE-421 · Muster: typing-worksheet.ts (THE-430)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY, isInferredRelation } from '@thearchitect/shared';
import {
  loadRelationsGolden,
  type RelationsGoldenSet,
  type RelationsGoldenCase,
  type RelationsGoldenPairSide,
} from '../evals/relationsGolden';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Nur `inferred`-Relationstypen dürfen im Adjudikationsformular auftauchen (THE-433 AC-5). */
const INFERRED_RELATIONS = NORM_ONTOLOGY.relationTypes.filter((r) => isInferredRelation(r.id));

function relationOptionsHtml(current: string | null | undefined): string {
  // current: undefined → "offen"; null → "kein Zusammenhang"; string → vorbelegter Typ.
  const open = current === undefined ? ' selected' : '';
  const none = current === null ? ' selected' : '';
  const rows = INFERRED_RELATIONS.map(
    (r) => `<option value="${esc(r.id)}"${current === r.id ? ' selected' : ''}>${esc(r.label)}</option>`
  ).join('');
  return (
    `<option value="__open"${open}>— (offen)</option>` +
    `<option value="__none"${none}>kein Zusammenhang (no relation)</option>` +
    rows
  );
}

function directionOptionsHtml(a: RelationsGoldenPairSide, b: RelationsGoldenPairSide, current: string | undefined): string {
  const aToB = current === 'a-to-b' ? ' selected' : '';
  const bToA = current === 'b-to-a' ? ' selected' : '';
  // Kein Default-"selected" wenn current fehlt — die Richtung ist bewusst noch
  // nicht getroffen, solange keine Relation gewählt wurde (Select ist dann
  // ohnehin deaktiviert; sobald aktiviert, muss die Person aktiv wählen).
  return (
    `<option value="a-to-b"${aToB}>${esc(a.regulationKey)} → ${esc(b.regulationKey)}</option>` +
    `<option value="b-to-a"${bToA}>${esc(b.regulationKey)} → ${esc(a.regulationKey)}</option>`
  );
}

function sideHtml(tag: 'A' | 'B', side: RelationsGoldenPairSide): string {
  return `
        <div class="side side-${tag.toLowerCase()}">
          <div class="side-hd">
            <span class="tag">${tag}</span>
            <span class="src">${esc(side.regulationKey.toUpperCase())} · ${esc(side.paragraphNumber)}</span>
          </div>
          <div class="ttl">${esc(side.title ?? '')}</div>
          <div class="law">${esc(side.fullText)}</div>
        </div>`;
}

/** Rendert das Relations-Golden als eigenständiges HTML-Adjudikationsformular. Rein (kein I/O). */
export function renderRelationsWorksheet(set: RelationsGoldenSet): string {
  const embedded = JSON.stringify({
    version: set.version,
    ontologyVersion: set.ontologyVersion,
    rubricRef: set.rubricRef,
    cases: set.cases.map((c: RelationsGoldenCase) => ({
      caseId: c.caseId,
      a: c.a,
      b: c.b,
    })),
  }).replace(/</g, '\\u003c');

  const cards = set.cases
    .map((c, ci) => {
      const dirDisabled = c.relation === undefined || c.relation === null;
      return `
    <section class="case" data-case="${esc(c.caseId)}">
      <div class="pair">${sideHtml('A', c.a)}${sideHtml('B', c.b)}</div>
      <div class="q">Wie stehen A und B zueinander? „kein Zusammenhang" ist eine gültige, bewusste Antwort.</div>
      <div class="controls">
        <label class="axis">
          <span class="axl">Relation</span>
          <select id="rel_${ci}" class="relsel" data-ci="${ci}">${relationOptionsHtml(c.relation)}</select>
        </label>
        <label class="axis">
          <span class="axl">Richtung</span>
          <select id="dir_${ci}" class="dirsel"${dirDisabled ? ' disabled' : ''}>${directionOptionsHtml(c.a, c.b, c.direction)}</select>
        </label>
      </div>
      <div class="meta">
        <label class="amb"><input type="checkbox" id="amb_${ci}"${c.ambiguous ? ' checked' : ''}> mehrdeutig / unsicher</label>
        <input type="text" class="note" id="note_${ci}" placeholder="Notiz (optional)" value="${esc(c.notes ?? '')}">
      </div>
    </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relations-Golden Adjudikation — ${esc(set.version)}</title>
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
  .case { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  .side { border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .side-a { border-left:3px solid var(--accent); }
  .side-b { border-left:3px solid #16a34a; }
  .side-hd { display:flex; gap:8px; align-items:baseline; margin-bottom:6px; }
  .tag { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; background:var(--accent); color:#fff; font-weight:700; font-size:12px; }
  .side-b .tag { background:#16a34a; }
  .src { font-weight:700; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
  .ttl { font-weight:600; margin-bottom:6px; }
  .law { background:#fafbfc; border:1px solid var(--line); border-radius:6px; padding:10px 12px; color:#26313f; white-space:pre-wrap; max-height:220px; overflow:auto; font-size:13px; }
  .q { margin:14px 0 8px; font-size:13px; color:var(--muted); }
  .controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
  .axis { display:flex; flex-direction:column; gap:4px; }
  .axl { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
  .axis select { padding:7px 9px; border:1px solid var(--line); border-radius:7px; font-size:14px; background:#fff; }
  .axis select:disabled { background:#f1f2f5; color:var(--muted); cursor:not-allowed; }
  .meta { display:flex; gap:14px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  .amb { font-size:13px; color:var(--muted); } .note { flex:1; min-width:200px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style>
</head>
<body>
<header>
  <h1>Relations-Golden Adjudikation</h1>
  <span id="prog"></span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name (annotator)">
  <button onclick="exportJSON()">⬇ Export als JSON</button>
</header>
<div class="wrap">
  ${cards}
  <footer>${set.cases.length} Fälle · Version ${esc(set.version)} · E7 ${esc(set.ontologyVersion)} · nach Export: Kappa prüfen, dann frozen:true</footer>
</div>
<script>
const SET = ${embedded};
function syncDirection(ci){
  const rel = document.getElementById('rel_'+ci).value;
  const dir = document.getElementById('dir_'+ci);
  // Nur bei einer ECHTEN Relation darf eine Richtung existieren — "offen" und
  // "kein Zusammenhang" deaktivieren die Dropdown strukturell.
  dir.disabled = (rel === '__open' || rel === '__none');
}
function syncAll(){
  SET.cases.forEach((c,ci)=>syncDirection(ci));
}
function updateProg(){
  let done=0, total=SET.cases.length;
  SET.cases.forEach((c,ci)=>{ if(document.getElementById('rel_'+ci).value!=='__open') done++; });
  document.getElementById('prog').textContent = done+' / '+total+' Fälle entschieden';
}
document.addEventListener('change', function(){ syncAll(); updateProg(); });
function download(text, name){
  const b=new Blob([text],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}
function readRelation(ci){
  const v = document.getElementById('rel_'+ci).value;
  if (v === '__open') return undefined;
  if (v === '__none') return null;
  return v;
}
function readDirection(ci){
  const dir = document.getElementById('dir_'+ci);
  if (dir.disabled) return undefined;
  return dir.value;
}
function exportJSON(){
  const annotator=(document.getElementById('annotator').value||'').trim()||'annotator-b';
  const today=new Date().toISOString().slice(0,10);
  const out={version:SET.version.replace(/-draft$/,''), frozen:false, ontologyVersion:SET.ontologyVersion, rubricRef:SET.rubricRef||'RUBRIC.md', cases:[]};
  SET.cases.forEach((c,ci)=>{
    const relation=readRelation(ci);
    const direction=readDirection(ci);
    const amb=document.getElementById('amb_'+ci).checked;
    const note=(document.getElementById('note_'+ci).value||'').trim();
    const nc={caseId:c.caseId, a:c.a, b:c.b, annotator, labeledAt:today};
    if(relation!==undefined) nc.relation=relation;
    if(direction!==undefined) nc.direction=direction;
    if(amb) nc.ambiguous=true;
    if(note) nc.notes=note;
    out.cases.push(nc);
  });
  download(JSON.stringify(out,null,2), 'relations-labeled-'+annotator+'.json');
}
syncAll();
updateProg();
</script>
</body>
</html>
`;
}

function main(): void {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('Usage: relations-worksheet <relations-golden.json> <out.html>');
    process.exitCode = 2;
    return;
  }
  const set = loadRelationsGolden(path.resolve(inPath));
  const html = renderRelationsWorksheet(set);
  fs.writeFileSync(path.resolve(outPath), html);
  console.log(
    `[relations-worksheet] ${set.cases.length} Fälle → ${outPath}\n` +
      `[relations-worksheet] Im Browser öffnen, adjudizieren, „Export als JSON".`
  );
}

if (require.main === module) {
  main();
}
