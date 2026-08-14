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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
// überhaupt nennt, und ob der Katalog sie führt.
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

/**
 * THE-682: Der Zweck neben dem Artikel — Erwägungsgründe, die den Artikel
 * WÖRTLICH zitieren (mechanischer Join über citedArticles aus THE-681).
 *
 * Zwei ehrlich getrennte Leerzustände:
 *   quelleVorhanden=true,  0 Treffer → "kein Erwägungsgrund verweist ausdrücklich…"
 *   quelleVorhanden=false            → "Erwägungsgründe dieser Fassung liegen noch nicht vor"
 * Der thematisch nächstliegende wird NIE gezeigt — ein geratener Zweck würde
 * das Urteil ankern, und die Blindheit des Bogens ist seine wichtigste Eigenschaft.
 */
interface Zweck {
  quelleVorhanden: boolean;
  treffer: Array<{ nummer: number; text: string }>;
}

const RECITAL_EXCERPT = 1200;

function kuerze(t: string): string {
  const clean = t.replace(/\s+/g, ' ').trim();
  return clean.length > RECITAL_EXCERPT ? `${clean.slice(0, RECITAL_EXCERPT)}…` : clean;
}

function block(d: Doc, i: number, isControl: boolean, defektGrund?: string, zweck?: Zweck): string {
  if (defektGrund) {
    return [
      `### ${String(i).padStart(2, '0')} · ${d.source} · ${d.paragraphNumber ?? '?'}   **— nicht bewertbar**`,
      '',
      `**${d.title ?? '(ohne Titel)'}**`,
      '',
      `> **Bitte überspringen — der Datensatz ist kaputt, nicht der Artikel.** ${defektGrund}`,
      '',
      `> ${excerpt(d.fullText)}`,
      '',
      `<sub>\`${d.regulationKey}\` · zählt nicht zu den Urteilen</sub>`,
      '',
      '---',
      '',
    ].join('\n');
  }
  return [
    `### ${String(i).padStart(2, '0')} · ${d.source} · ${d.paragraphNumber ?? '?'}${isControl ? '   *(Gegenprobe)*' : ''}`,
    '',
    `**${d.title ?? '(ohne Titel)'}**`,
    '',
    `> ${excerpt(d.fullText)}`,
    '',
    ...(zweck === undefined
      ? []
      : zweck.treffer.length > 0
        ? [
            `**Wozu es diesen Artikel gibt** *(Erwägungsgrund${zweck.treffer.length > 1 ? 'e' : ''} ${zweck.treffer.map((t) => `(${t.nummer})`).join(', ')} — erklärt den Zweck, ist kein Normtext)*`,
            '',
            ...zweck.treffer.slice(0, 4).flatMap((t) => [`> *(${t.nummer})* ${kuerze(t.text)}`, '>']),
            ...(zweck.treffer.length > 4
              ? [`> …und ${zweck.treffer.length - 4} weitere: ${zweck.treffer.slice(4).map((t) => `(${t.nummer})`).join(', ')}`, '>']
              : []),
            '',
          ]
        : zweck.quelleVorhanden
          ? ['*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel.*', '']
          : ['*Erwägungsgründe dieser Sprachfassung liegen noch nicht im Korpus vor.*', '']),
    '| | |',
    '|---|---|',
    '| **Urteil** | `A` / `B` / `C` / `D` → ' + ' '.repeat(20) + ' |',
    '| **mehr als ein Adressat?** | `ja` / `nein` → ' + ' '.repeat(20) + ' |',
    '| **Adressat(en) bei A oder B** | ' + ' '.repeat(40) + ' |',
    '| **Notiz** | ' + ' '.repeat(40) + ' |',
    '',
    `<sub>\`${d.regulationKey}\`</sub>`,
    '',
    '---',
    '',
  ].join('\n');
}

function zweckHtml(zweck?: Zweck): string {
  if (zweck === undefined) return '';
  if (zweck.treffer.length === 0) {
    return `
  <p class="zweck-leer">${
    zweck.quelleVorhanden
      ? 'Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel.'
      : 'Erwägungsgründe dieser Sprachfassung liegen noch nicht im Korpus vor.'
  }</p>`;
  }
  const sichtbar = zweck.treffer.slice(0, 4);
  const rest = zweck.treffer.slice(4);
  return `
  <div class="zweck">
    <p class="zweck-titel">Wozu es diesen Artikel gibt
      <span class="zweck-hinweis">erklärt den Zweck — kein Normtext, zählt nie gegen den Wortlaut</span></p>
    ${sichtbar
      .map(
        (t, idx) => `
    <details class="zweck-eintrag"${idx === 0 ? ' open' : ''}>
      <summary>Erwägungsgrund (${t.nummer})</summary>
      <p>${esc(kuerze(t.text))}</p>
    </details>`
      )
      .join('')}
    ${rest.length > 0 ? `<p class="zweck-mehr">…außerdem genannt in ${rest.map((t) => `(${t.nummer})`).join(', ')}</p>` : ''}
  </div>`;
}

function htmlBlock(d: Doc, i: number, isControl: boolean, defektGrund?: string, zweck?: Zweck): string {
  const m = markiere(excerpt(d.fullText));
  const id = `f${i}`;

  // Defekter Datensatz: Position bleibt stehen (sonst verrutschen gefällte
  // Urteile — der Speicher hängt an f1..fN), aber es gibt nichts anzukreuzen.
  // Der Text bleibt sichtbar: er IST der Beleg für den Defekt.
  if (defektGrund) {
    return `
<article class="fall defekt" id="${id}">
  <header>
    <span class="nr">${String(i).padStart(2, '0')}</span>
    <span class="quelle">${esc(d.source)} · ${esc(d.paragraphNumber ?? '?')}</span>
    <span class="badge-defekt">nicht bewertbar</span>
  </header>
  <h3>${esc(d.title ?? '(ohne Titel)')}</h3>
  <p class="defekt-grund"><strong>Bitte überspringen — der Datensatz ist kaputt, nicht der Artikel.</strong><br>
  ${esc(defektGrund)}</p>
  <blockquote>${m.html}</blockquote>
  <footer><code>${esc(d.regulationKey)}</code> · zählt nicht zu den ${'​'}Urteilen</footer>
</article>`;
  }

  const hinweis =
    m.fehlend.size > 0
      ? `<span class="hint hint-b">nennt Akteure nicht im Rollenkatalog: ${[...m.fehlend].map(esc).join(' · ')}</span>`
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
  ${zweckHtml(zweck)}
  <div class="urteil">
    <div class="radios">
      ${(
        [
          ['A', 'Rolle steht im Katalog — übersehen'],
          ['B', 'Rolle fehlt im Katalog'],
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
    <label class="mehrfach">
      <input type="checkbox" class="mehr" data-key="${id}-mehrfach">
      <span>verpflichtet <strong>mehr als einen</strong> Akteur</span>
    </label>
    <input class="feld" type="text" data-key="${id}-adressat" placeholder="Adressat(en) bei A oder B — bei mehreren durch Komma trennen">
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
  nachruecker: Doc[];
  defekt: Record<string, string>;
  bewertbar: number;
  laws: Set<string>;
  zweckJeFall: Map<string, Zweck>;
}): string {
  const { all, ohne, verdacht, rahmen, sample, control, nachruecker, defekt, bewertbar, laws, zweckJeFall } = args;
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
  /* Zweite Achse, kein fünftes Urteil — gestrichelt, damit es sich sichtbar
     von den A–D-Kacheln unterscheidet und niemand es als Alternative liest. */
  .mehrfach { display:flex; align-items:center; gap:.5rem; padding:.45rem .6rem; cursor:pointer;
    border:1.5px dashed var(--line); border-radius:7px; font-size:.86rem; background:#fff; }
  .mehrfach:hover { background:#faf8f5; }
  .mehrfach:has(input:checked) { border-style:solid; border-color:var(--d); background:#fdf6e8; }
  /* Zweck-Block (THE-682) — sichtbar ANDERS als der Normtext: eigene Fläche,
     Lesestimme, damit niemand Erwägungsgrund und Artikel verwechselt. */
  .zweck { margin:.6rem 0 .2rem; padding:.55rem .7rem; background:#f4f1ec; border-radius:8px;
    border:1px solid var(--line); }
  .zweck-titel { margin:0 0 .3rem; font-size:.86rem; font-weight:700; }
  .zweck-hinweis { font-weight:400; color:var(--muted); font-size:.78rem; margin-left:.4rem; }
  .zweck-eintrag { margin:.25rem 0; }
  .zweck-eintrag summary { cursor:pointer; font-size:.84rem; color:var(--muted); font-weight:600; }
  .zweck-eintrag p { margin:.3rem 0 .2rem; font-size:.86rem; line-height:1.55; }
  .zweck-mehr { margin:.3rem 0 0; font-size:.8rem; color:var(--muted); }
  .zweck-leer { margin:.5rem 0 .2rem; font-size:.8rem; color:var(--muted); font-style:italic; }
  /* Defekter Datensatz — sichtbar stillgelegt, Position bleibt erhalten. */
  article.defekt { opacity:.72; background:#faf8f5; }
  .badge-defekt { margin-left:auto; font-size:.72rem; font-weight:700; letter-spacing:.02em;
    padding:.15rem .5rem; border-radius:99px; background:var(--fehlt-bg); color:var(--fehlt); }
  .defekt-grund { margin:.5rem 0; padding:.6rem .75rem; border-left:3px solid var(--fehlt);
    background:#fff; font-size:.86rem; border-radius:0 6px 6px 0; }
  article footer { margin-top:.6rem; font-size:.75rem; color:var(--muted); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .bar { position:fixed; bottom:0; left:0; right:0; background:rgba(255,255,255,.97);
    border-top:1px solid var(--line); padding:.7rem 1rem; display:flex; align-items:center;
    gap:1rem; justify-content:center; backdrop-filter:blur(6px); }
  .bar .stand { font-size:.9rem; }
  .bar button { font:inherit; font-size:.86rem; padding:.45rem .9rem; border-radius:7px;
    border:1px solid var(--line); background:#fff; cursor:pointer; }
  .bar button.primary { background:var(--fg); color:#fff; border-color:var(--fg); }
  .tally { font-family:ui-monospace,monospace; font-size:.85rem; white-space:nowrap; }
  @media print { .bar{display:none} article{break-inside:avoid} }
</style></head><body><div class="wrap">

<h1>Hat diese Bestimmung einen Adressaten?</h1>
<p class="sub">THE-654 · erzeugt am 2026-08-10 aus ${all} Korpus-Bestimmungen ·
${ohne} ohne Adressatenklasse, davon ${verdacht} mit Sachtitel und ${rahmen} Rahmenbestimmungen ·
Stichprobe <strong>${sample.length}</strong> über <strong>${laws.size}</strong> Gesetze, plus ${control.length} Gegenproben</p>

<div class="box" style="border-color:var(--a)">
  <h4>Aus welcher Blickrichtung?</h4>
  <p style="margin:.2rem 0"><strong>Aus der Sicht der Norm — nicht aus der Sicht unseres Kunden.</strong>
  Gefragt ist, wen der Satz verpflichtet, <em>wer immer das ist</em>: auch die Kommission, ein
  Mitgliedstaat, eine Aufsichtsbehörde oder eine Normungsorganisation.</p>
  <p style="margin:.6rem 0 0; color:var(--muted)">Der Kunde kommt erst eine Stufe später ins Spiel. Seine
  Selbstauskunft („wir sind Verantwortlicher und Auftragsverarbeiter") wird gegen die hier bestimmte
  Norm-Rolle gehalten; erst dieser Abgleich entscheidet über Anwendbarkeit. Der Bogen liefert die eine
  Seite, das Unternehmensprofil die andere.</p>
  <p style="margin:.6rem 0 0; color:var(--muted)">Dass es so gemeint ist, steht in den Daten:
  <strong>46 %</strong> der 1324 getypten Bestimmungen tragen heute <code>member_state</code>,
  <code>supervisory_authority</code> oder <code>data_subject</code> — Rollen, die kein Unternehmen je über
  sich selbst erklärt. Wäre die Kundensicht gemeint, dürften diese Rollen gar nicht im Katalog stehen.</p>
  <p style="margin:.6rem 0 0; padding-top:.6rem; border-top:1px dashed var(--line)">
  <strong>Warum das auch dann zählt, wenn nie ein Kunde gemeint ist:</strong> „Dieser Artikel bindet die
  Kommission" ist eine <em>Antwort</em> — „wir wissen es nicht" ist keine. Nur die erste darf zu
  „betrifft dich nicht" werden; Nichtwissen als Entwarnung auszugeben ist die gefährliche Fehlerrichtung.</p>
</div>

<div class="box">
  <h4>Die Leitfrage</h4>
  <p style="margin:.2rem 0"><strong>Wen verpflichtet dieser Artikel — wer muss danach etwas tun oder lassen?</strong><br>
  <span style="color:var(--muted)">Nicht: wovon handelt er. Ein Artikel über Normungsaufträge verpflichtet die
  Normungsorganisation, auch wenn das Wort „Pflicht" nicht vorkommt.</span></p>
  <p style="margin:.6rem 0 0; color:var(--muted)">Deshalb ist ein Artikel, der <em>nur</em> EU-Organe
  verpflichtet, <strong style="color:var(--b)">B</strong> — Adressat vorhanden, seine Rolle fehlt im Katalog — und nicht
  <strong style="color:var(--c)">C</strong>. <strong style="color:var(--c)">C</strong> ist ausschließlich für
  Sätze, die <em>niemanden</em> verpflichten.</p>
</div>

<div class="box">
  <h4>Die vier Urteile</h4>
  <table class="urteile">
    <tr><td class="kk kk-a">A</td><td>Adressat vorhanden — <strong>und seine Rolle steht im Katalog</strong></td>
        <td style="color:var(--muted)">Die Typisierung hat ihn übersehen. Extraktions-Problem.</td></tr>
    <tr><td class="kk kk-b">B</td><td>Adressat vorhanden — <strong>aber seine Rolle fehlt im Katalog</strong></td>
        <td style="color:var(--muted)"><strong>Der gesuchte Fall.</strong> Bitte benennen, wie die Klasse heißen müsste.</td></tr>
    <tr><td class="kk kk-c">C</td><td><strong>Kein</strong> Normadressat</td>
        <td style="color:var(--muted)">Verfahren, Definition, Schlussbestimmung. Korrekt leer.</td></tr>
    <tr><td class="kk kk-d">D</td><td>unklar / mehrdeutig</td>
        <td style="color:var(--muted)">Eigene Klasse, nicht „Nein".</td></tr>
  </table>
  <p style="margin:.9rem 0 0; padding-top:.8rem; border-top:1px dashed var(--line)">
    <strong>Dazu, unabhängig vom Urteil: „verpflichtet mehr als einen Akteur".</strong>
    Das ist <em>kein fünftes Urteil</em>, sondern eine zweite Frage — sie kann bei jedem Buchstaben zutreffen.
    Die Typisierung darf heute nur <strong>eine</strong> Rolle je Bestimmung eintragen. Ein Artikel, der
    Mitgliedstaaten <em>und</em> Anbieter verpflichtet, hat beide Rollen im Katalog und landet damit auf
    <strong style="color:var(--a)">A</strong> — „übersehen". Übersehen wurde aber nichts; es war
    kein Platz. Ohne dieses Kästchen verschwindet ein Schema-Problem unbemerkt als Extraktions-Problem.
    Bei mehreren Adressaten bitte <strong>alle</strong> ins Feld darunter, durch Komma getrennt.</p>
</div>

<div class="box">
  <h4>Die Farben im Gesetzestext</h4>
  <p style="margin:.2rem 0 .5rem; color:var(--muted); font-size:.92rem">
    Rein mechanisch markiert — eine <strong>Wortliste, kein Modell</strong>. Die Farbe sagt nicht, wer der
    Adressat <em>ist</em>; sie zeigt, welche Akteure der Artikel <em>nennt</em> und ob der Katalog sie führt.
    Was das Modell vermutet hat, steht bewusst nirgends: es würde das Urteil ankern.</p>
  <div class="legende">
    <span><mark class="akteur-ok">Mitgliedstaaten</mark> &nbsp;im Katalog → spricht für <strong style="color:var(--a)">A</strong></span>
    <span><mark class="akteur-fehlt">Normungsorganisation</mark> &nbsp;fehlt dort → spricht für <strong style="color:var(--b)">B</strong></span>
  </div>
  <p style="margin:.7rem 0 0; color:var(--muted); font-size:.85rem">
    Zeiger auf eine Markierung zeigt die Klasse. Keine Markierung heißt nicht „kein Adressat" —
    die Liste kennt 19 bekannte und 18 fehlende Begriffe, nicht alle.</p>
</div>

<div class="box">
  <h4>Der Rollenkatalog heute — 19 Einträge</h4>
  <p style="margin:.2rem 0 .6rem">Eine <strong>geschlossene Liste</strong>, wie ein Actor/Role-Katalog in
  TOGAF Phase B. Beim Typisieren darf jede Bestimmung nur einen dieser 19 Werte bekommen — oder gar keinen.
  Erfinden ist verboten, und genau deshalb prüfen wir hier, ob die Liste zu kurz ist.
  <em>Diese Liste ist gemeint, wenn im Bogen vom „Katalog" die Rede ist</em> — nicht das Sachgebiet des Artikels.</p>
  <p style="margin:.2rem 0; font-family:ui-monospace,monospace; font-size:.82rem; line-height:1.8; color:var(--muted)">
  member_state · supervisory_authority · financial_entity · provider · manufacturer · controller ·
  conformity_assessment_body · trust_service_provider · obligated_enterprise · data_holder ·
  ict_third_party_provider · essential_important_entity · processor · data_subject · ecs_provider ·
  importer · distributor · authorized_representative · deployer</p>
</div>

<h2>Stichprobe — ${sample.length} Fälle</h2>
${sample.map((d, i) => htmlBlock(d, i + 1, false, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))).join('')}

<h2>Gegenproben — ${control.length} Fälle</h2>
<p class="sub">Aus den ${rahmen} Rahmenbestimmungen gezogen. Sie <em>sollten</em> <strong style="color:var(--c)">C</strong>
ergeben — tun sie es nicht, trennt die Titel-Heuristik nicht, was sie zu trennen vorgibt, und die Zahl
„${verdacht} Verdachtsfälle" ist selbst fragwürdig. Ihre Antwort ist trotzdem offen.</p>
${control.map((d, i) => htmlBlock(d, sample.length + i + 1, true, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))).join('')}
${
  nachruecker.length === 0
    ? ''
    : `
<h2>Nachrücker — ${nachruecker.length} Fälle</h2>
<p class="sub">Ersatz für die oben stillgelegten Fälle. Sie stehen hier hinten und nicht an der Lücke,
weil die Urteile an der <em>Position</em> hängen — ein Einschub in der Mitte würde jedes danach gefällte
Urteil still an einen anderen Artikel hängen.</p>
${nachruecker.map((d, i) => htmlBlock(d, sample.length + control.length + i + 1, false, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))).join('')}`
}

<h2>Schwelle</h2>
<div class="box">
  <p style="margin:.2rem 0">Mindestens <strong>ein</strong> fehlender Klassenkandidat mit <strong>≥ 5</strong>
  Bestimmungen belegt → Richtung „Katalog erweitern". Bleibt <strong style="color:var(--b)">B</strong> darunter,
  ist ein explizites <code>noAddressee</code> die ehrliche Antwort und der Rest eine Anzeigefrage.</p>
  <p style="margin:.6rem 0 0; color:var(--muted)">Hochrechnung: Anteil B × ${verdacht} ≈ betroffene Bestimmungen im Korpus.</p>
</div>

</div>
<div class="bar">
  <span class="stand"><strong id="done">0</strong> / ${bewertbar} beurteilt</span>
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
    var total = ${sample.length + control.length + nachruecker.length}, done = 0, mehr = 0;
    var t = { A: 0, B: 0, C: 0, D: 0 };
    for (var i = 1; i <= total; i++) {
      var v = store['f' + i];
      if (v) { done++; t[v] = (t[v] || 0) + 1; }
      if (store['f' + i + '-mehrfach']) mehr++;
    }
    document.getElementById('done').textContent = done;
    document.getElementById('tally').textContent =
      'A ' + t.A + ' · B ' + t.B + ' · C ' + t.C + ' · D ' + t.D + ' · mehrfach ' + mehr;
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

  // Zweite Achse (THE-675). Eigener Schlüssel je Fall — ein bereits
  // ausgefüllter Bogen behält seine Urteile, weil der Speicher flach nach
  // data-key abgelegt ist und hier nur neue Schlüssel dazukommen.
  document.querySelectorAll('input.mehr').forEach(function (el) {
    el.checked = Boolean(store[el.dataset.key]);
    el.addEventListener('change', function () {
      if (el.checked) store[el.dataset.key] = '1'; else delete store[el.dataset.key];
      save();
    });
  });

  document.getElementById('copy').addEventListener('click', function () {
    var rows = ['| # | Quelle | Urteil | mehrfach | Adressat(en) | Notiz |', '|---|---|---|---|---|---|'];
    document.querySelectorAll('article.fall').forEach(function (a) {
      var id = a.id;
      var nr = a.querySelector('.nr').textContent;
      var q = a.querySelector('.quelle').textContent;
      rows.push('| ' + nr + ' | ' + q + ' | ' + (store[id] || '—') + ' | ' +
        (store[id + '-mehrfach'] ? 'ja' : '') + ' | ' +
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
    document.querySelectorAll('input.mehr').forEach(function (e) { e.checked = false; });
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

  // Eingefrorene Stichprobe (13.08.). WARUM: Die Ziehung ist zwar
  // deterministisch, aber sie hängt am KORPUS-ZUSTAND — sie zieht aus den
  // Bestimmungen ohne partyRole. Das tp-4-Re-Typing (THE-668) verschob diese
  // Menge von 389 auf 422, und ein Neulauf tauschte prompt 21 von 35 Fällen
  // aus. Die Urteile im HTML hängen aber an der POSITION (f1..f35): ein
  // getauschter Fall hängt ein bereits gefälltes Urteil an einen anderen
  // Artikel — still. Deshalb liegen die Schlüssel in einer Pin-Datei, und die
  // Auflösung geht gegen den GESAMTEN Korpus, nicht gegen die Verdachtsmenge
  // (ein gepinnter Fall darf inzwischen eine Rolle bekommen haben).
  const pinPath = resolve(__dirname, '../../../../docs/evals/the654-sample-pin.json');
  const byKey = new Map(all.map((d) => [d.regulationKey, d]));
  const pick = (keys: string[], label: string): Doc[] =>
    keys.map((k) => {
      const doc = byKey.get(k);
      if (!doc) throw new Error(`Gepinnter ${label}-Fall ${k} ist nicht mehr im Korpus — Pin und Korpus driften.`);
      return doc;
    });

  let sample: Doc[];
  let control: Doc[];
  let nachruecker: Doc[] = [];
  let defekt: Record<string, string> = {};
  if (existsSync(pinPath)) {
    const pin = JSON.parse(readFileSync(pinPath, 'utf8')) as {
      sample: string[];
      control: string[];
      nachruecker?: string[];
      defekt?: Record<string, string>;
    };
    sample = pick(pin.sample, 'Stichproben');
    control = pick(pin.control, 'Gegenproben');
    nachruecker = pick(pin.nachruecker ?? [], 'Nachrücker');
    defekt = pin.defekt ?? {};
    console.log(`  Stichprobe        : EINGEFROREN aus ${pinPath.split('/').pop()}`);
  } else {
    sample = stratify(verdacht, SAMPLE_SIZE);
    control = stratify(rahmen, CONTROL_SIZE);
  }
  if (sample.length < SAMPLE_SIZE) {
    throw new Error(`Nur ${sample.length} Verdachtsfälle gezogen, ${SAMPLE_SIZE} verlangt.`);
  }
  const laws = new Set(sample.map((d) => d.source.replace(/-(de|en)$/, '')));
  if (laws.size < 4) throw new Error(`Stichprobe deckt nur ${laws.size} Gesetze ab, mindestens 4 verlangt.`);

  /*
   * TOR gegen die Fehlerklasse „Datensatz trägt den Dokument-Schwanz".
   *
   * Gefunden am 13.08. beim Ausfüllen: `cra-de:art-14` enthielt statt Artikel 14
   * die Schlussformel samt Unterschriften und Fußnoten — der echte Artikel
   * („Meldepflichten der Hersteller") fehlt in der deutschen Fassung ganz.
   * Ein Urteil darüber wäre ein Urteil über einen Nicht-Artikel gewesen.
   *
   * Die Prüfung ist MECHANISCH (Wortliste, kein Modell) und läuft über JEDEN
   * Fall im Bogen. Ein neuer Treffer, der nicht im Pin als defekt vermerkt ist,
   * bricht den Lauf — lieber kein Bogen als ein Bogen mit stiller Attrappe.
   */
  const SCHLUSSFORMEL =
    /in allen ihren Teilen verbindlich|binding in its entirety|^Geschehen zu |^Done at |Im Namen des Europäischen Parlaments|On behalf of the European Parliament/i;
  const unentdeckt = [...sample, ...control, ...nachruecker].filter(
    (d) =>
      !defekt[d.regulationKey] &&
      (SCHLUSSFORMEL.test(String(d.title ?? '').trim()) ||
        SCHLUSSFORMEL.test(String(d.fullText ?? '').trim().slice(0, 120)))
  );
  if (unentdeckt.length > 0) {
    throw new Error(
      `Dokument-Schwanz statt Artikeltext in: ${unentdeckt.map((d) => d.regulationKey).join(', ')} — ` +
        `entweder im Korpus reparieren oder im Pin unter "defekt" mit Begründung eintragen.`
    );
  }
  const bewertbar = sample.length + control.length + nachruecker.length - Object.keys(defekt).length;

  /*
   * THE-682: Zweck-Kontext laden. Mechanischer Join: Erwägungsgründe derselben
   * Sprachfassung, deren citedArticles den Artikel-Anker des Falls WÖRTLICH
   * nennen. Kein thematisches Raten (AC-2) — der Bogen bleibt blind.
   * Fehlt die Collection ganz, entfällt das Feature ohne Bruch (AC-5).
   */
  const alleFaelle = [...sample, ...control, ...nachruecker];
  const zweckJeFall = new Map<string, Zweck>();
  const recitalsGesamt = await conn.collection('recitals').countDocuments({}).catch(() => 0);
  if (recitalsGesamt > 0) {
    const sources = [...new Set(alleFaelle.map((d) => d.source))];
    const recs = (await conn
      .collection('recitals')
      .find(
        { source: { $in: sources } },
        { projection: { source: 1, recitalNumber: 1, fullText: 1, citedArticles: 1 } }
      )
      .toArray()) as unknown as Array<{
      source: string;
      recitalNumber: number;
      fullText: string;
      citedArticles: string[];
    }>;
    const quellenMitBestand = new Set(recs.map((r) => r.source));
    const proAnker = new Map<string, Array<{ nummer: number; text: string }>>();
    for (const r of recs) {
      for (const art of r.citedArticles ?? []) {
        const k = `${r.source}|${art}`;
        proAnker.set(k, [...(proAnker.get(k) ?? []), { nummer: r.recitalNumber, text: r.fullText }]);
      }
    }
    for (const d of alleFaelle) {
      const artAnker = d.regulationKey.split(':')[1];
      const treffer = (proAnker.get(`${d.source}|${artAnker}`) ?? []).sort((a, b) => a.nummer - b.nummer);
      zweckJeFall.set(d.regulationKey, {
        quelleVorhanden: quellenMitBestand.has(d.source),
        treffer,
      });
    }
  }

  const md = [
    '# THE-654 — Adjudikation: hat diese Bestimmung einen Adressaten?',
    '',
    `**Erzeugt am 2026-08-10** aus ${all.length} Korpus-Bestimmungen · ${ohneRolle.length} ohne Adressatenklasse`,
    `· davon ${verdacht.length} mit Sachtitel (Verdacht) und ${rahmen.length} Rahmenbestimmungen.`,
    `Stichprobe: **${sample.length}** über **${laws.size}** Gesetze, plus **${control.length}** Gegenproben.`,
    '',
    '> Erzeugt von `packages/server/src/scripts/the654-addressee-sample.ts` — derselbe Lauf ergibt denselben Bogen.',
    '',
    '## Aus welcher Blickrichtung?',
    '',
    '**Aus der Sicht der Norm — nicht aus der Sicht unseres Kunden.** Gefragt ist, wen der Satz verpflichtet,',
    '*wer immer das ist*: auch die Kommission, ein Mitgliedstaat, eine Aufsichtsbehörde oder eine',
    'Normungsorganisation.',
    '',
    'Der Kunde kommt erst eine Stufe später ins Spiel. Seine Selbstauskunft („wir sind Verantwortlicher und',
    'Auftragsverarbeiter") wird gegen die hier bestimmte Norm-Rolle gehalten; erst dieser Abgleich entscheidet',
    'über Anwendbarkeit. Der Bogen liefert die eine Seite, das Unternehmensprofil die andere.',
    '',
    'Dass es so gemeint ist, steht in den Daten: **46 %** der 1324 getypten Bestimmungen tragen heute',
    '`member_state`, `supervisory_authority` oder `data_subject` — Rollen, die kein Unternehmen je über sich',
    'selbst erklärt. Wäre die Kundensicht gemeint, dürften diese Rollen gar nicht im Katalog stehen.',
    '',
    '**Warum das auch dann zählt, wenn nie ein Kunde gemeint ist:** „Dieser Artikel bindet die Kommission" ist',
    'eine *Antwort* — „wir wissen es nicht" ist keine. Nur die erste darf zu „betrifft dich nicht" werden;',
    'Nichtwissen als Entwarnung auszugeben ist die gefährliche Fehlerrichtung.',
    '',
    '## Die vier Urteile',
    '',
    '| | Bedeutung | Was daraus folgt |',
    '|---|---|---|',
    '| **A** | Adressat vorhanden — **und seine Rolle steht im Katalog unten** | Die Typisierung hat ihn übersehen. Extraktions-Problem, kein Katalog-Problem. |',
    '| **B** | Adressat vorhanden — **aber seine Rolle fehlt im Katalog** | Der gesuchte Fall. Bitte im Feld darunter benennen, wie er heißen müsste. |',
    '| **C** | **Kein** Normadressat — die Bestimmung richtet sich an niemanden (Verfahren, Definition, Schlussbestimmung) | Korrekt leer. |',
    '| **D** | unklar / mehrdeutig | Zählt als eigene Klasse, nicht als Nein. |',
    '',
    '**Dazu, unabhängig vom Urteil: „mehr als ein Adressat?"** Das ist *kein fünftes Urteil*, sondern eine',
    'zweite Frage — sie kann bei jedem Buchstaben zutreffen. Die Typisierung darf heute nur **eine** Rolle je',
    'Bestimmung eintragen. Ein Artikel, der Mitgliedstaaten **und** Anbieter verpflichtet, hat beide Rollen im Katalog',
    'und landet damit auf **A** — „übersehen". Übersehen wurde aber nichts; es war kein Platz. Ohne diese Zeile',
    'verschwindet ein Schema-Problem unbemerkt als Extraktions-Problem. Bei mehreren bitte **alle** Adressaten',
    'nennen, durch Komma getrennt.',
    '',
    '**Die Leitfrage:** *Wen verpflichtet dieser Artikel — wer muss danach etwas tun oder lassen?*',
    'Nicht: wovon handelt er. Ein Artikel über Normungsaufträge verpflichtet die Normungsorganisation,',
    'auch wenn das Wort „Pflicht" nicht vorkommt.',
    '',
    'Deshalb ist ein Artikel, der *nur* EU-Organe verpflichtet, **B** — Adressat vorhanden, seine Rolle fehlt im Katalog —',
    'und nicht **C**. **C** ist ausschließlich für Sätze, die *niemanden* verpflichten.',
    '',
    '## Der Rollenkatalog heute (19 Einträge)',
    '',
    'Eine **geschlossene Liste**, wie ein Actor/Role-Katalog in TOGAF Phase B. Beim Typisieren darf jede',
    'Bestimmung nur einen dieser 19 Werte bekommen — oder gar keinen. Erfinden ist verboten, und genau',
    'deshalb prüfen wir hier, ob die Liste zu kurz ist. *Diese Liste ist gemeint, wenn im Bogen vom „Katalog"',
    'die Rede ist* — nicht das Sachgebiet des Artikels.',
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
    ...sample.map((d, i) => block(d, i + 1, false, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))),
    '## Gegenproben',
    '',
    ...control.map((d, i) => block(d, sample.length + i + 1, true, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))),
    ...(nachruecker.length === 0
      ? []
      : [
          '## Nachrücker',
          '',
          'Ersatz für die oben stillgelegten Fälle. Sie stehen hinten und nicht an der Lücke, weil die Urteile',
          'an der *Position* hängen — ein Einschub in der Mitte würde jedes danach gefällte Urteil still an',
          'einen anderen Artikel hängen.',
          '',
          ...nachruecker.map((d, i) =>
            block(d, sample.length + control.length + i + 1, false, defekt[d.regulationKey], zweckJeFall.get(d.regulationKey))
          ),
        ]),
    '## Auswertung (nach der Adjudikation ausfüllen)',
    '',
    '| Urteil | Anzahl | |',
    '|---|---|---|',
    '| A — Rolle im Katalog, übersehen | | Extraktions-Qualität, gehört zu THE-421/432 |',
    '| B — Rolle fehlt im Katalog | | **die gesuchte Zahl** |',
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
    renderHtml({ all: all.length, ohne: ohneRolle.length, verdacht: verdacht.length, rahmen: rahmen.length, sample, control, nachruecker, defekt, bewertbar, laws, zweckJeFall }),
  );
  console.log(`\n  Korpus            : ${all.length} Bestimmungen`);
  console.log(`  ohne Adressat     : ${ohneRolle.length}`);
  console.log(`  davon Verdacht    : ${verdacht.length} (nach Sprach-Dedupe)`);
  console.log(`  davon Rahmen      : ${rahmen.length}`);
  console.log(`  Stichprobe        : ${sample.length} über ${laws.size} Gesetze — ${[...laws].sort().join(', ')}`);
  console.log(`  Gegenproben       : ${control.length}`);
  if (nachruecker.length > 0) console.log(`  Nachrücker        : ${nachruecker.length}`);
  if (Object.keys(defekt).length > 0)
    console.log(`  STILLGELEGT       : ${Object.keys(defekt).join(', ')} — nicht bewertbar`);
  console.log(`  bewertbare Fälle  : ${bewertbar}`);
  const mitZweck = [...zweckJeFall.values()].filter((z) => z.treffer.length > 0).length;
  console.log(
    `  Zweck-Kontext     : ${recitalsGesamt > 0 ? `${mitZweck} von ${alleFaelle.length} Fällen mit zitierendem Erwägungsgrund` : 'Collection recitals leer — Feature entfällt (AC-5)'}`
  );
  const markiert = sample.filter((d) => markiere(excerpt(d.fullText)).fehlend.size > 0).length;
  console.log(`  davon mit Akteur nicht im Rollenkatalog: ${markiert} von ${sample.length}`);
  console.log(`\n  → ${out}`);
  console.log(`  → ${outHtml}\n`);
  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
