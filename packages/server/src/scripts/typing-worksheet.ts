/**
 * typing-worksheet — erzeugt aus einem Typing-Golden(-Draft) eine EINZELNE,
 * in sich geschlossene HTML-Datei zum Adjudizieren im Browser.
 *
 * Je Provision: Gesetzestext + vier Dropdowns (normKind / bindingness /
 * obligationKind / partyRole) aus den geschlossenen E6-Räumen. Optionen sind
 * auf vorhandene `labels` VORBELEGT (LLM-Vorschlag adjudizieren); "— (offen)"
 * = noch nicht gelabelt, "n/a (nicht anwendbar)" = bewusst kein Wert (→ null).
 * "Export" liefert ein schema-gültiges Typing-Golden-JSON.
 *
 *   npm run typing:worksheet -- src/evals/golden/typing.dsgvo.draft.json /tmp/typing-label.html
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster: golden-worksheet.ts (THE-379)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { loadTypingGolden, TYPING_AXES, type TypingGoldenSet, type TypingAxis } from '../evals/typingGolden';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** id→label Optionen je Achse aus der E6-Datei (single source of truth). */
const AXIS_OPTIONS: Record<TypingAxis, ReadonlyArray<{ id: string; label: string }>> = {
  normKind: NORM_ONTOLOGY.normKinds.map((k) => ({ id: k.id, label: k.label })),
  bindingness: NORM_ONTOLOGY.bindingness.map((b) => ({ id: b.id, label: b.label })),
  obligationKind: NORM_ONTOLOGY.obligationKinds.map((o) => ({ id: o.id, label: o.label })),
  partyRole: NORM_ONTOLOGY.partyRoles.map((p) => ({ id: p.id, label: p.label })),
};

const AXIS_TITLE: Record<TypingAxis, string> = {
  normKind: 'NormKind',
  bindingness: 'Bindingness',
  obligationKind: 'Obligation',
  partyRole: 'PartyRole',
};

function optionsHtml(axis: TypingAxis, current: string | null | undefined): string {
  // current: undefined → "offen"; null → "n/a"; string → vorbelegter Wert.
  const open = current === undefined ? ' selected' : '';
  const na = current === null ? ' selected' : '';
  const rows = AXIS_OPTIONS[axis]
    .map((o) => `<option value="${esc(o.id)}"${current === o.id ? ' selected' : ''}>${esc(o.label)}</option>`)
    .join('');
  return (
    `<option value="__open"${open}>— (offen)</option>` +
    `<option value="__na"${na}>n/a (nicht anwendbar)</option>` +
    rows
  );
}

/** Rendert das Typing-Golden als eigenständiges HTML-Adjudikationsformular. Rein (kein I/O). */
export function renderTypingWorksheet(set: TypingGoldenSet): string {
  const embedded = JSON.stringify({
    version: set.version,
    ontologyVersion: set.ontologyVersion,
    rubricRef: set.rubricRef,
    cases: set.cases.map((c) => ({
      caseId: c.caseId,
      source: c.source,
      paragraphNumber: c.paragraphNumber,
      title: c.title,
      language: c.language,
      jurisdiction: c.jurisdiction,
      fullText: c.fullText,
    })),
  }).replace(/</g, '\\u003c');

  const cards = set.cases
    .map((c, ci) => {
      const selects = TYPING_AXES.map(
        (axis) => `
        <label class="axis">
          <span class="axl">${AXIS_TITLE[axis]}</span>
          <select id="ax_${ci}_${axis}">${optionsHtml(axis, c.labels[axis])}</select>
        </label>`
      ).join('');
      return `
    <section class="case" data-case="${esc(c.caseId)}">
      <div class="case-hd">
        <span class="src">${esc(c.source.toUpperCase())} ${esc(c.paragraphNumber)}</span>
        <span class="ttl">${esc(c.title ?? '')}</span>
        <span class="lang">${esc(c.language)} · ${esc(c.jurisdiction)}</span>
      </div>
      <div class="law">${esc(c.fullText)}</div>
      <div class="q">Typisiere diese Provision gegen die geschlossenen E6-Räume. „n/a" wenn eine Achse hier bewusst nicht anwendbar ist.</div>
      <div class="axes">${selects}</div>
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
<title>Typing-Golden Adjudikation — ${esc(set.version)}</title>
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
  .wrap { max-width:860px; margin:0 auto; padding:20px; }
  .case { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .case-hd { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:10px; }
  .src { font-weight:700; color:var(--accent); }
  .ttl { font-weight:600; } .lang { margin-left:auto; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
  .law { background:#fafbfc; border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:6px; padding:12px 14px; color:#26313f; white-space:pre-wrap; max-height:220px; overflow:auto; font-size:14px; }
  .q { margin:14px 0 8px; font-size:13px; color:var(--muted); }
  .axes { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
  .axis { display:flex; flex-direction:column; gap:4px; }
  .axl { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
  .axis select { padding:7px 9px; border:1px solid var(--line); border-radius:7px; font-size:14px; background:#fff; }
  .meta { display:flex; gap:14px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  .amb { font-size:13px; color:var(--muted); } .note { flex:1; min-width:200px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style>
</head>
<body>
<header>
  <h1>Typing-Golden Adjudikation</h1>
  <span id="prog"></span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name (annotator)">
  <button onclick="exportJSON()">⬇ Export als JSON</button>
</header>
<div class="wrap">
  ${cards}
  <footer>${set.cases.length} Provisions · Version ${esc(set.version)} · E6 ${esc(set.ontologyVersion)} · nach Export: Kappa prüfen, dann frozen:true</footer>
</div>
<script>
const SET = ${embedded};
const AXES = ${JSON.stringify(TYPING_AXES)};
function readAxis(ci, axis){
  const v = document.getElementById('ax_'+ci+'_'+axis).value;
  if (v === '__open') return undefined;
  if (v === '__na') return null;
  return v;
}
function updateProg(){
  let done=0, total=SET.cases.length;
  SET.cases.forEach((c,ci)=>{ if(AXES.every(a=>readAxis(ci,a)!==undefined)) done++; });
  document.getElementById('prog').textContent = done+' / '+total+' Provisions vollständig';
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
  const out={version:SET.version.replace(/-draft$/,''), frozen:false, ontologyVersion:SET.ontologyVersion, rubricRef:SET.rubricRef||'../RUBRIC.md', cases:[]};
  SET.cases.forEach((c,ci)=>{
    const labels={};
    AXES.forEach(a=>{ const v=readAxis(ci,a); if(v!==undefined) labels[a]=v; });
    const amb=document.getElementById('amb_'+ci).checked;
    const note=(document.getElementById('note_'+ci).value||'').trim();
    const nc={caseId:c.caseId, source:c.source, paragraphNumber:c.paragraphNumber, title:c.title, fullText:c.fullText, language:c.language, jurisdiction:c.jurisdiction, labels, annotator, labeledAt:today};
    if(amb) nc.ambiguous=true;
    if(note) nc.notes=note;
    out.cases.push(nc);
  });
  download(JSON.stringify(out,null,2), 'typing-labeled-'+annotator+'.json');
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
    console.error('Usage: typing-worksheet <typing-golden.json> <out.html>');
    process.exitCode = 2;
    return;
  }
  const set = loadTypingGolden(path.resolve(inPath));
  const html = renderTypingWorksheet(set);
  fs.writeFileSync(path.resolve(outPath), html);
  console.log(
    `[typing-worksheet] ${set.cases.length} Provisions → ${outPath}\n` +
      `[typing-worksheet] Im Browser öffnen, adjudizieren, „Export als JSON".`
  );
}

if (require.main === module) {
  main();
}
