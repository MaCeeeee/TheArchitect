/**
 * reqtrace-worksheet — das menschliche Tor des senkrechten Schnitts
 * (THE-545, Task 8). Muster: pair-worksheet.ts.
 *
 *   npm run reqtrace:worksheet -- <run.json> /tmp/reqtrace-label.html
 *
 * ── DIE EINHEIT IST DIE MASSNAHME ──
 *
 * Das ist der ganze Unterschied zum Blatt aus THE-382. Dort sollten vierzig
 * PAARE beurteilt werden — eine Arbeit, die nach fünfzehn Fällen abgebrochen
 * wurde, weil die Paare fachlich nicht vergleichbar waren. Hier beantwortet
 * ein Mensch je Maßnahme genau eine Frage:
 *
 *     „Ist das eine Maßnahme, die man einmal baut?"
 *
 * Bei fünf Kandidaten sind das fünf Fragen. So arbeiten auch die Vorbilder
 * aus der Literatur: UGAF-ITS und Cisco lassen Menschen wenige Kontrollen
 * kuratieren, nicht viele Paare urteilen.
 *
 * ── DREI SPERREN GEGEN EIN WERTLOSES URTEIL ──
 *
 * 1. **Kein SCF-Name, kein Gold-Hinweis.** Wüsste der Adjudikator, welche
 *    Antwort das externe Gold erwartet, misst das Tor Zustimmung statt Urteil.
 * 2. **Keine Gesetzesnamen** — weder in den Anforderungen noch als Angabe,
 *    welche Rechtsakte die Maßnahme bedient. Genau das ist ja die Behauptung,
 *    die geprüft werden soll.
 * 3. **Startzustand „unsicher".** Ein vorbelegtes Ja misst Zustimmung.
 *
 * Linear: THE-545 · Rahmen: ADR-0007
 */
import fs from 'node:fs';
import path from 'node:path';
import { blindLawNames } from '@thearchitect/shared';

export interface MeasureCase {
  id: string;
  /** Nur für die Auswertung — wird NIE gerendert. */
  laws: string[];
  requirements: { id: string; text: string }[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Deterministisches Kürzel für eine Maßnahmen-Id.
 *
 * Die echte Id trägt die Klausel-Kennung und damit den GESETZESNAMEN
 * (`measure__dsgvo:art32:…`). Sie darf im Blatt nirgends stehen — auch nicht
 * im eingebetteten JavaScript, wo ein neugieriger Blick sie fände. Der Export
 * trägt deshalb dieses Kürzel; die Einlese-Stufe rechnet es aus den Ids des
 * Laufs nach. Kein Wissen geht verloren, nur die Sichtbarkeit.
 */
export function opaqueMeasureToken(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `m${h.toString(36)}`;
}

/**
 * Rendert die Maßnahmen als eigenständiges HTML-Formular. REIN (kein I/O).
 *
 * Die Maßnahmen-Id wird nicht angezeigt: sie trägt die Klausel-Kennung und
 * damit die Herkunft (`measure__dsgvo:art32:…`). Im Export ist sie der Anker,
 * im Blatt hat sie nichts zu suchen.
 */
export function renderReqtraceWorksheet(measures: MeasureCase[]): string {
  // NUR Kuerzel — die echten Ids tragen den Gesetzesnamen.
  const embedded = JSON.stringify({ tokens: measures.map((m) => opaqueMeasureToken(m.id)) }).replace(/</g, '\\u003c');

  const cards = measures
    .map(
      (m, ci) => `
    <section class="case">
      <div class="no">Maßnahme ${ci + 1} / ${measures.length}</div>
      <div class="q">Diese Anforderungen sollen von EINER gemeinsam betriebenen Maßnahme erfüllt werden:</div>
      <ul class="reqs">
        ${m.requirements.map((r) => `<li>${esc(blindLawNames(r.text))}</li>`).join('\n        ')}
      </ul>
      <label class="axis">
        <span class="axl">Ist das eine Maßnahme, die man einmal baut?</span>
        <select id="v_${ci}">
          <option value="__unsure" selected>— unsicher</option>
          <option value="ja">ja — ein Verfahren, das alle diese Anforderungen trägt</option>
          <option value="nein">nein — dafür braucht es getrennte Maßnahmen</option>
        </select>
      </label>
      <input type="text" class="note" id="n_${ci}" placeholder="Notiz (optional)">
    </section>`,
    )
    .join('');

  const empty = `
    <section class="case">
      <div class="q">Der Lauf hat <b>keine geteilte Maßnahme</b> erzeugt. Es gibt nichts zu adjudizieren —
      das ist ein gültiges Ergebnis und gehört so in das Verdikt.</div>
    </section>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maßnahmen-Adjudikation</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1a2233; --muted:#5b6675; --line:#dfe3ea; --accent:#7c3aed; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  header { position:sticky; top:0; z-index:10; background:#111827; color:#fff; padding:12px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; font-weight:600; }
  header .grow { flex:1; }
  header input { padding:7px 10px; border-radius:7px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
  header button { padding:8px 16px; border:0; border-radius:7px; background:var(--accent); color:#fff; font-weight:600; font-size:14px; cursor:pointer; }
  #prog { font-variant-numeric:tabular-nums; color:#cbd5e1; font-size:13px; }
  .wrap { max-width:900px; margin:0 auto; padding:20px; }
  .intro { background:#fffbe6; border:1px solid #f2e2a8; border-radius:10px; padding:14px 18px; margin-bottom:20px; font-size:14px; }
  .case { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .no { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.03em; margin-bottom:10px; }
  .q { font-size:14px; color:var(--muted); margin-bottom:10px; }
  .reqs { margin:0 0 14px; padding-left:20px; }
  .reqs li { margin-bottom:8px; }
  .axis { display:flex; flex-direction:column; gap:5px; }
  .axl { font-weight:600; }
  .axis select { padding:8px 10px; border:1px solid var(--line); border-radius:7px; font-size:14px; background:#fff; }
  .note { width:100%; margin-top:12px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; font-size:13px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 0 40px; }
</style>
</head>
<body>
<header>
  <h1>Maßnahmen-Adjudikation</h1>
  <span id="prog"></span>
  <span class="grow"></span>
  <input id="annotator" type="text" placeholder="Dein Name (annotator)">
  <button onclick="exportJSON()">⬇ Export als JSON</button>
</header>
<div class="wrap">
  <div class="intro">
    <b>Eine Frage je Maßnahme.</b> Du siehst mehrere Anforderungen, die nach unserer Kette von
    <i>einer</i> gemeinsam betriebenen Maßnahme erfüllt werden könnten. Beurteile nur das:
    trägt ein Verfahren alle diese Anforderungen, oder braucht es getrennte?
    <br><br>
    „Unsicher" ist eine gültige Antwort und der Startzustand. Die Herkunft der Anforderungen ist
    absichtlich nicht sichtbar.
  </div>
  ${measures.length ? cards : empty}
  <footer>${measures.length} Maßnahme(n) · nach Export: Verdikt gegen die Abbruchbedingungen</footer>
</div>
<script>
const SET = ${embedded};
function updateProg(){
  let done=0;
  SET.tokens.forEach(function(_,ci){ const e=document.getElementById('v_'+ci); if(e && e.value!=='__unsure') done++; });
  document.getElementById('prog').textContent = done+' / '+SET.tokens.length+' entschieden';
}
document.addEventListener('change', updateProg);
function download(text, name){
  const b=new Blob([text],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(){
  const annotator=(document.getElementById('annotator').value||'').trim()||'annotator-a';
  const out={version:'reqtrace.human.v1', annotator:annotator,
             labeledAt:new Date().toISOString().slice(0,10), verdicts:[]};
  SET.tokens.forEach(function(token,ci){
    const e=document.getElementById('v_'+ci); if(!e) return;
    const note=(document.getElementById('n_'+ci).value||'').trim();
    const v={measureToken:token, oneMeasure: (e.value==='__unsure' ? null : e.value==='ja')};
    if(note) v.notes=note;
    out.verdicts.push(v);
  });
  download(JSON.stringify(out,null,2), 'reqtrace-human-'+annotator+'.json');
}
updateProg();
</script>
</body>
</html>
`;
}

function main(): void {
  const [runPath, outPath] = process.argv.slice(2);
  if (!runPath || !outPath) {
    console.error('Usage: reqtrace-worksheet <run.json> <out.html>');
    process.exitCode = 2;
    return;
  }
  const run = JSON.parse(fs.readFileSync(path.resolve(runPath), 'utf8')) as {
    grouping: { measures: { id: string; memberIds: string[]; laws: string[] }[] };
    sysReqTexts?: Record<string, string>;
  };

  const measures: MeasureCase[] = run.grouping.measures
    .filter((m) => m.memberIds.length > 1)
    .map((m) => ({
      id: m.id,
      laws: m.laws,
      requirements: m.memberIds.map((id) => ({ id, text: run.sysReqTexts?.[id] ?? id })),
    }));

  fs.writeFileSync(path.resolve(outPath), renderReqtraceWorksheet(measures));
  console.log(
    `[reqtrace:worksheet] ${measures.length} Maßnahme(n) → ${outPath}\n` +
      '[reqtrace:worksheet] Im Browser adjudizieren, „Export als JSON".',
  );
}

if (require.main === module) {
  main();
}
