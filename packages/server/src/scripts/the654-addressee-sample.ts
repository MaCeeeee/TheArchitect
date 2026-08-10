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

// ─────────────────────────────────────────────────────────────────────────────
// AKTEURS-MARKIERUNG — eine Lesehilfe, KEIN Urteil
//
// Die Markierung ist rein mechanisch: eine Wortliste, kein Modell. Sie sagt
// nicht, WER der Adressat ist — sie zeigt nur, WELCHE Akteure der Artikel
// überhaupt nennt, und ob der Typraum sie kennt.
//
// Damit bleibt der Bogen blind gegenüber der Modell-Vermutung (die würde das
// Urteil ankern), gibt aber die Information, die A von B trennt:
//   – nur GRÜNE Treffer  → der Adressat stünde im Typraum  → Verdacht A
//   – ROTE Treffer       → ein Akteur fehlt dort           → Verdacht B
//   – gar keine Treffer  → möglicherweise wirklich niemand → Verdacht C
// ─────────────────────────────────────────────────────────────────────────────

/** Akteure, die der Typraum kennt — Textbegriff → Klasse. */
const IM_TYPRAUM: Array<[RegExp, string]> = [
  [/Mitgliedstaat(en|es|lich\w*)?|Member States?/gi, 'member_state'],
  [/Aufsichtsbehörden?|supervisory authorit(y|ies)/gi, 'supervisory_authority'],
  [/Anbieter(s|n)?\b|providers?\b/gi, 'provider'],
  [/Hersteller(s|n)?|manufacturers?/gi, 'manufacturer'],
  [/Verantwortliche(r|n|m)?\b|controllers?\b/gi, 'controller'],
  [/Auftragsverarbeiter(s|n)?|processors?\b/gi, 'processor'],
  [/Einführer(s|n)?|importers?/gi, 'importer'],
  [/Händler(s|n)?|distributors?/gi, 'distributor'],
  [/Betreiber(s|n)?|deployers?/gi, 'deployer'],
  [/betroffene[nr]? Person(en)?|data subjects?/gi, 'data_subject'],
  [/Dateninhaber(s|n)?|data holders?/gi, 'data_holder'],
  [/Konformitätsbewertungsstellen?|notifizierte[nr]? Stellen?|notified bod(y|ies)|conformity assessment bod(y|ies)/gi, 'conformity_assessment_body'],
  [/Vertrauensdiensteanbieter(s|n)?|trust service providers?/gi, 'trust_service_provider'],
  [/Finanzunternehmen|financial entit(y|ies)/gi, 'financial_entity'],
  [/IKT-Drittdienstleister(s|n)?|ICT third-party (service )?providers?/gi, 'ict_third_party_provider'],
  [/wesentliche[nr]? (und |oder )?wichtige[nr]? Einrichtungen?|essential (and |or )?important entit(y|ies)/gi, 'essential_important_entity'],
  [/verpflichtete[nrs]? Unternehmen|obligated enterprises?/gi, 'obligated_enterprise'],
  [/Bevollmächtigte[rn]?\b|authoris?ed representatives?/gi, 'authorized_representative'],
  [/Anbieter elektronischer Kommunikationsdienste|providers? of electronic communications/gi, 'ecs_provider'],
];

/** Akteure, die im Gesetzestext vorkommen und im Typraum FEHLEN. */
const NICHT_IM_TYPRAUM: Array<[RegExp, string]> = [
  [/(europäische[nr]? )?Normungsorganisationen?|(European )?standardisation organisations?|ESOs?\b/gi, 'Normungsorganisation'],
  [/nationale[nr]? Normungsorganisationen?|national standardisation bod(y|ies)/gi, 'nationale Normungsorganisation'],
  [/\bKommission\b|\bCommission\b/gi, 'Europäische Kommission'],
  [/Büros? für Künstliche Intelligenz|AI Office/gi, 'AI Office'],
  [/KI-Gremium|\bAI Board\b/gi, 'KI-Gremium'],
  [/Beratungsforum|advisory forum/gi, 'Beratungsforum'],
  [/Wissenschaftlergremium|scientific panel/gi, 'Wissenschaftlergremium'],
  [/Europäische[rn]? Datenschutzausschuss|European Data Protection Board|\bEDPB\b/gi, 'Datenschutzausschuss'],
  [/\bENISA\b|Agentur der Europäischen Union für Cybersicherheit/gi, 'EU-Agentur'],
  [/\b(EBA|ESMA|EIOPA)\b|Europäische[nr]? Bankenaufsichtsbehörde/gi, 'EU-Aufsichtsagentur'],
  [/Marktüberwachungsbehörden?|market surveillance authorit(y|ies)/gi, 'Marktüberwachungsbehörde'],
  [/Gerichte?n?\b|courts? or tribunals?/gi, 'Gericht'],
  [/Interessenträger(s|n)?|stakeholders?/gi, 'Interessenträger'],
  [/\bKMU\b|small and medium-sized enterprises|\bSMEs?\b/gi, 'KMU'],
  [/Zertifizierungsstellen?|certification bod(y|ies)/gi, 'Zertifizierungsstelle'],
  [/Prüflaboratorien|testing laborator(y|ies)/gi, 'Prüflabor'],
  [/Rat\b(?! der)|Council\b/g, 'Rat'],
  [/Europäische[ns]? Parlament|European Parliament/gi, 'Parlament'],
];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Markiert {
  html: string;
  bekannt: Set<string>;
  fehlend: Set<string>;
}

/**
 * Markiert Akteursbegriffe im Text.
 *
 * Erst werden alle Treffer gesammelt und nach Position sortiert; überlappende
 * werden verworfen (der längere gewinnt). Das verhindert, dass „nationale
 * Normungsorganisation" zweimal markiert wird, und dass ein Ersetzen im bereits
 * ersetzten HTML weiterläuft.
 */
function markiere(text: string): Markiert {
  const treffer: Array<{ start: number; end: number; klasse: string; art: 'ok' | 'fehlt' }> = [];
  for (const [re, klasse] of IM_TYPRAUM) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      treffer.push({ start: m.index, end: m.index + m[0].length, klasse, art: 'ok' });
    }
  }
  for (const [re, klasse] of NICHT_IM_TYPRAUM) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      treffer.push({ start: m.index, end: m.index + m[0].length, klasse, art: 'fehlt' });
    }
  }
  treffer.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const behalten: typeof treffer = [];
  let bisher = -1;
  for (const t of treffer) {
    if (t.start < bisher) continue;
    behalten.push(t);
    bisher = t.end;
  }

  const bekannt = new Set<string>();
  const fehlend = new Set<string>();
  let html = '';
  let pos = 0;
  for (const t of behalten) {
    html += esc(text.slice(pos, t.start));
    const cls = t.art === 'ok' ? 'akteur-ok' : 'akteur-fehlt';
    html += `<mark class="${cls}" title="${esc(t.klasse)}">${esc(text.slice(t.start, t.end))}</mark>`;
    (t.art === 'ok' ? bekannt : fehlend).add(t.klasse);
    pos = t.end;
  }
  html += esc(text.slice(pos));
  return { html, bekannt, fehlend };
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

function htmlBlock(d: Doc, i: number, isControl: boolean): string {
  const m = markiere(excerpt(d.fullText));
  const id = `f${i}`;
  const hinweis =
    m.fehlend.size > 0
      ? `<span class="hint hint-b">nennt Akteure außerhalb des Typraums: ${[...m.fehlend].map(esc).join(' · ')}</span>`
      : m.bekannt.size > 0
        ? `<span class="hint hint-a">nennt nur bekannte Akteure: ${[...m.bekannt].map(esc).join(' · ')}</span>`
        : `<span class="hint hint-c">nennt keinen der erfassten Akteursbegriffe</span>`;

  return `
<article class="fall${isControl ? ' gegenprobe' : ''}" id="${id}">
  <header>
    <span class="nr">${String(i).padStart(2, '0')}</span>
    <span class="quelle">${esc(d.source)} · ${esc(d.paragraphNumber ?? '?')}</span>
    ${isControl ? '<span class="badge-gegen">Gegenprobe</span>' : ''}
  </header>
  <h3>${esc(d.title ?? '(ohne Titel)')}</h3>
  ${hinweis}
  <blockquote>${m.html}</blockquote>
  <div class="urteil">
    <div class="radios">
      ${(
        [
          ['A', 'Adressat im Typraum — übersehen'],
          ['B', 'Adressat fehlt im Typraum'],
          ['C', 'kein Adressat'],
          ['D', 'unklar'],
        ] as Array<[string, string]>
      )
        .map(
          ([k, label]) => `
      <label class="opt opt-${k.toLowerCase()}">
        <input type="radio" name="${id}" value="${k}" data-key="${id}">
        <span class="k">${k}</span><span class="l">${esc(label)}</span>
      </label>`,
        )
        .join('')}
    </div>
    <input class="feld" type="text" data-key="${id}-adressat" placeholder="Adressat (bei A oder B) — wie müsste die Klasse heißen?">
    <input class="feld" type="text" data-key="${id}-notiz" placeholder="Notiz (optional)">
  </div>
  <footer><code>${esc(d.regulationKey)}</code></footer>
</article>`;
}

function renderHtml(args: {
  all: number;
  ohne: number;
  verdacht: number;
  rahmen: number;
  sample: Doc[];
  control: Doc[];
  laws: Set<string>;
}): string {
  const { all, ohne, verdacht, rahmen, sample, control, laws } = args;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>THE-654 — Adressaten-Adjudikation</title>
<style>
  :root {
    --bg:#fbfaf8; --fg:#1a1a1a; --muted:#6b6b6b; --line:#e2ded8; --card:#fff;
    --ok:#0f7b3f; --ok-bg:#d9f2e4; --fehlt:#b4341c; --fehlt-bg:#ffe0d6;
    --a:#1565c0; --b:#b4341c; --c:#0f7b3f; --d:#8a6d00;
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:0 1rem 6rem; background:var(--bg); color:var(--fg);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif; }
  .wrap { max-width:52rem; margin:0 auto; }
  h1 { font-size:1.6rem; margin:2rem 0 .3rem; line-height:1.25; }
  h2 { font-size:1.15rem; margin:2.5rem 0 .8rem; padding-top:1rem; border-top:2px solid var(--line); }
  h3 { font-size:1.05rem; margin:.4rem 0 .5rem; }
  .sub { color:var(--muted); font-size:.9rem; margin:0 0 1.5rem; }
  .box { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1rem 1.2rem; margin:1.2rem 0; }
  .box h4 { margin:.2rem 0 .6rem; font-size:.95rem; }
  table.urteile { width:100%; border-collapse:collapse; font-size:.92rem; }
  table.urteile td { padding:.45rem .5rem; border-bottom:1px solid var(--line); vertical-align:top; }
  table.urteile tr:last-child td { border-bottom:none; }
  .kk { font-weight:700; width:1.6rem; }
  .kk-a{color:var(--a)} .kk-b{color:var(--b)} .kk-c{color:var(--c)} .kk-d{color:var(--d)}
  mark.akteur-ok { background:var(--ok-bg); color:var(--ok); padding:.05em .25em; border-radius:3px; font-weight:600; }
  mark.akteur-fehlt { background:var(--fehlt-bg); color:var(--fehlt); padding:.05em .25em; border-radius:3px;
    font-weight:700; box-shadow:inset 0 -2px 0 var(--fehlt); }
  .legende { display:flex; gap:1.5rem; flex-wrap:wrap; font-size:.88rem; margin:.6rem 0 0; }
  article.fall { background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:1.1rem 1.3rem 1rem; margin:1.1rem 0; }
  article.gegenprobe { border-left:4px solid var(--muted); }
  article header { display:flex; align-items:center; gap:.7rem; font-size:.85rem; color:var(--muted); }
  .nr { font-weight:700; color:var(--fg); font-size:1rem; }
  .quelle { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .badge-gegen { margin-left:auto; background:#eee; color:var(--muted); border-radius:99px; padding:.1rem .6rem; font-size:.75rem; }
  blockquote { margin:.7rem 0 1rem; padding:.8rem 1rem; background:#fdfcfa; border-left:3px solid var(--line);
    border-radius:0 6px 6px 0; font-size:.93rem; }
  .hint { display:inline-block; font-size:.82rem; padding:.15rem .55rem; border-radius:99px; margin-bottom:.2rem; }
  .hint-b { background:var(--fehlt-bg); color:var(--fehlt); font-weight:600; }
  .hint-a { background:var(--ok-bg); color:var(--ok); }
  .hint-c { background:#f0eee9; color:var(--muted); }
  .radios { display:grid; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr)); gap:.4rem; margin-bottom:.5rem; }
  .opt { display:flex; align-items:center; gap:.45rem; padding:.45rem .6rem; border:1.5px solid var(--line);
    border-radius:7px; cursor:pointer; font-size:.86rem; background:#fff; }
  .opt:hover { background:#faf8f5; }
  .opt .k { font-weight:700; }
  .opt-a .k{color:var(--a)} .opt-b .k{color:var(--b)} .opt-c .k{color:var(--c)} .opt-d .k{color:var(--d)}
  .opt:has(input:checked) { border-width:2px; }
  .opt-a:has(input:checked){border-color:var(--a);background:#e8f1fb}
  .opt-b:has(input:checked){border-color:var(--b);background:var(--fehlt-bg)}
  .opt-c:has(input:checked){border-color:var(--c);background:var(--ok-bg)}
  .opt-d:has(input:checked){border-color:var(--d);background:#fdf6dd}
  .feld { width:100%; padding:.45rem .6rem; border:1px solid var(--line); border-radius:7px;
    font:inherit; font-size:.86rem; margin-top:.35rem; background:#fff; }
  article footer { margin-top:.6rem; font-size:.75rem; color:var(--muted); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .bar { position:fixed; bottom:0; left:0; right:0; background:rgba(255,255,255,.97);
    border-top:1px solid var(--line); padding:.7rem 1rem; display:flex; align-items:center;
    gap:1rem; justify-content:center; backdrop-filter:blur(6px); }
  .bar .stand { font-size:.9rem; }
  .bar button { font:inherit; font-size:.86rem; padding:.45rem .9rem; border-radius:7px;
    border:1px solid var(--line); background:#fff; cursor:pointer; }
  .bar button.primary { background:var(--fg); color:#fff; border-color:var(--fg); }
  .tally { font-family:ui-monospace,monospace; font-size:.85rem; }
  @media print { .bar{display:none} article{break-inside:avoid} }
</style></head><body><div class="wrap">

<h1>Hat diese Bestimmung einen Adressaten?</h1>
<p class="sub">THE-654 · erzeugt am 2026-08-10 aus ${all} Korpus-Bestimmungen ·
${ohne} ohne Adressatenklasse, davon ${verdacht} mit Sachtitel und ${rahmen} Rahmenbestimmungen ·
Stichprobe <strong>${sample.length}</strong> über <strong>${laws.size}</strong> Gesetze, plus ${control.length} Gegenproben</p>

<div class="box">
  <h4>Die Leitfrage</h4>
  <p style="margin:.2rem 0"><strong>Wen verpflichtet dieser Artikel — wer muss danach etwas tun oder lassen?</strong><br>
  <span style="color:var(--muted)">Nicht: wovon handelt er. Ein Artikel über Normungsaufträge verpflichtet die
  Normungsorganisation, auch wenn das Wort „Pflicht" nicht vorkommt.</span></p>
</div>

<div class="box">
  <h4>Die vier Urteile</h4>
  <table class="urteile">
    <tr><td class="kk kk-a">A</td><td>Adressat vorhanden — <strong>und er steht im Typraum</strong></td>
        <td style="color:var(--muted)">Die Typisierung hat ihn übersehen. Extraktions-Problem.</td></tr>
    <tr><td class="kk kk-b">B</td><td>Adressat vorhanden — <strong>aber er fehlt im Typraum</strong></td>
        <td style="color:var(--muted)"><strong>Der gesuchte Fall.</strong> Bitte benennen, wie die Klasse heißen müsste.</td></tr>
    <tr><td class="kk kk-c">C</td><td><strong>Kein</strong> Normadressat</td>
        <td style="color:var(--muted)">Verfahren, Definition, Schlussbestimmung. Korrekt leer.</td></tr>
    <tr><td class="kk kk-d">D</td><td>unklar / mehrdeutig</td>
        <td style="color:var(--muted)">Eigene Klasse, nicht „Nein".</td></tr>
  </table>
</div>

<div class="box">
  <h4>Die Farben im Gesetzestext</h4>
  <p style="margin:.2rem 0 .5rem; color:var(--muted); font-size:.92rem">
    Rein mechanisch markiert — eine <strong>Wortliste, kein Modell</strong>. Die Farbe sagt nicht, wer der
    Adressat <em>ist</em>; sie zeigt, welche Akteure der Artikel <em>nennt</em> und ob der Typraum sie kennt.
    Was das Modell vermutet hat, steht bewusst nirgends: es würde das Urteil ankern.</p>
  <div class="legende">
    <span><mark class="akteur-ok">Mitgliedstaaten</mark> &nbsp;im Typraum → spricht für <strong style="color:var(--a)">A</strong></span>
    <span><mark class="akteur-fehlt">Normungsorganisation</mark> &nbsp;fehlt dort → spricht für <strong style="color:var(--b)">B</strong></span>
  </div>
  <p style="margin:.7rem 0 0; color:var(--muted); font-size:.85rem">
    Zeiger auf eine Markierung zeigt die Klasse. Keine Markierung heißt nicht „kein Adressat" —
    die Liste kennt 19 bekannte und 18 fehlende Begriffe, nicht alle.</p>
</div>

<div class="box">
  <h4>Der Typraum heute — 19 Klassen</h4>
  <p style="margin:.2rem 0; font-family:ui-monospace,monospace; font-size:.82rem; line-height:1.8; color:var(--muted)">
  member_state · supervisory_authority · financial_entity · provider · manufacturer · controller ·
  conformity_assessment_body · trust_service_provider · obligated_enterprise · data_holder ·
  ict_third_party_provider · essential_important_entity · processor · data_subject · ecs_provider ·
  importer · distributor · authorized_representative · deployer</p>
</div>

<h2>Stichprobe — ${sample.length} Fälle</h2>
${sample.map((d, i) => htmlBlock(d, i + 1, false)).join('')}

<h2>Gegenproben — ${control.length} Fälle</h2>
<p class="sub">Aus den ${rahmen} Rahmenbestimmungen gezogen. Sie <em>sollten</em> <strong style="color:var(--c)">C</strong>
ergeben — tun sie es nicht, trennt die Titel-Heuristik nicht, was sie zu trennen vorgibt, und die Zahl
„${verdacht} Verdachtsfälle" ist selbst fragwürdig. Ihre Antwort ist trotzdem offen.</p>
${control.map((d, i) => htmlBlock(d, sample.length + i + 1, true)).join('')}

<h2>Schwelle</h2>
<div class="box">
  <p style="margin:.2rem 0">Mindestens <strong>ein</strong> fehlender Klassenkandidat mit <strong>≥ 5</strong>
  Bestimmungen belegt → Richtung „Typraum erweitern". Bleibt <strong style="color:var(--b)">B</strong> darunter,
  ist ein explizites <code>noAddressee</code> die ehrliche Antwort und der Rest eine Anzeigefrage.</p>
  <p style="margin:.6rem 0 0; color:var(--muted)">Hochrechnung: Anteil B × ${verdacht} ≈ betroffene Bestimmungen im Korpus.</p>
</div>

</div>
<div class="bar">
  <span class="stand"><strong id="done">0</strong> / ${sample.length + control.length} beurteilt</span>
  <span class="tally" id="tally"></span>
  <button id="copy" class="primary">Ergebnis kopieren</button>
  <button id="reset">Zurücksetzen</button>
</div>
<script>
(function () {
  var KEY = 'the654-adjudication';
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { store = {}; }

  function save() { localStorage.setItem(KEY, JSON.stringify(store)); render(); }

  function render() {
    var total = ${sample.length + control.length}, done = 0;
    var t = { A: 0, B: 0, C: 0, D: 0 };
    for (var i = 1; i <= total; i++) {
      var v = store['f' + i];
      if (v) { done++; t[v] = (t[v] || 0) + 1; }
    }
    document.getElementById('done').textContent = done;
    document.getElementById('tally').textContent =
      'A ' + t.A + ' · B ' + t.B + ' · C ' + t.C + ' · D ' + t.D;
  }

  // Gespeicherten Stand wiederherstellen — ein halb ausgefüllter Bogen darf
  // durch ein versehentliches Neuladen nicht verloren gehen.
  document.querySelectorAll('input[type=radio]').forEach(function (el) {
    if (store[el.dataset.key] === el.value) el.checked = true;
    el.addEventListener('change', function () { store[el.dataset.key] = el.value; save(); });
  });
  document.querySelectorAll('input.feld').forEach(function (el) {
    if (store[el.dataset.key]) el.value = store[el.dataset.key];
    el.addEventListener('input', function () { store[el.dataset.key] = el.value; save(); });
  });

  document.getElementById('copy').addEventListener('click', function () {
    var rows = ['| # | Quelle | Urteil | Adressat | Notiz |', '|---|---|---|---|---|'];
    document.querySelectorAll('article.fall').forEach(function (a) {
      var id = a.id;
      var nr = a.querySelector('.nr').textContent;
      var q = a.querySelector('.quelle').textContent;
      rows.push('| ' + nr + ' | ' + q + ' | ' + (store[id] || '—') + ' | ' +
        (store[id + '-adressat'] || '') + ' | ' + (store[id + '-notiz'] || '') + ' |');
    });
    navigator.clipboard.writeText(rows.join('\\n')).then(function () {
      var b = document.getElementById('copy');
      var old = b.textContent; b.textContent = 'kopiert ✓';
      setTimeout(function () { b.textContent = old; }, 1600);
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('Alle Urteile verwerfen?')) return;
    store = {}; localStorage.removeItem(KEY);
    document.querySelectorAll('input[type=radio]').forEach(function (e) { e.checked = false; });
    document.querySelectorAll('input.feld').forEach(function (e) { e.value = ''; });
    render();
  });

  render();
})();
</script>
</body></html>`;
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

  const outHtml = resolve(__dirname, '../../../../docs/evals/the654-addressee-adjudication.html');
  writeFileSync(
    outHtml,
    renderHtml({ all: all.length, ohne: ohneRolle.length, verdacht: verdacht.length, rahmen: rahmen.length, sample, control, laws }),
  );
  console.log(`\n  Korpus            : ${all.length} Bestimmungen`);
  console.log(`  ohne Adressat     : ${ohneRolle.length}`);
  console.log(`  davon Verdacht    : ${verdacht.length} (nach Sprach-Dedupe)`);
  console.log(`  davon Rahmen      : ${rahmen.length}`);
  console.log(`  Stichprobe        : ${sample.length} über ${laws.size} Gesetze — ${[...laws].sort().join(', ')}`);
  console.log(`  Gegenproben       : ${control.length}`);
  const markiert = sample.filter((d) => markiere(excerpt(d.fullText)).fehlend.size > 0).length;
  console.log(`  davon mit Akteur außerhalb des Typraums: ${markiert} von ${sample.length}`);
  console.log(`\n  → ${out}`);
  console.log(`  → ${outHtml}\n`);
  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
