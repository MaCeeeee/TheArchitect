/**
 * Verweis-Muster + Verweis-Miner für Cross-Norm-Referenzen — EINE Wahrheit für
 * Eval-Harness (Server, relationsCandidates.ts) und Batch (Crawler,
 * relationCandidates.ts). Hierher verschoben aus
 * packages/server/src/evals/relationsCandidates.ts (THE-433, Slice 1, Task 2)
 * nach dem Muster von shared/src/typing/prompt.ts: die Logik, die entscheidet,
 * WELCHE Paare überhaupt Kandidaten sind, muss in Eval und Batch byte-identisch
 * sein — zwei Kopien wären zwei driftende Wahrheiten. Der Server
 * re-exportiert von hier; die bestehenden Server-Tests laufen unverändert
 * gegen die Re-Exporte (der Beweis der Gleichheit).
 *
 * ── Ursprüngliche Begründung (THE-433, wandert mit) ──────────────────
 *
 * WARUM diese Kandidatenquelle überhaupt existiert (THE-433):
 * Ein Zwei-Rater-Lauf über ein rein similarity-gezogenes Set ergab 94%
 * Rohübereinstimmung bei Kappa 0,212 — 111 von 120 Paaren waren „keine
 * Beziehung". Der Fehler lag NICHT bei den Ratern, sondern in der Auswahl:
 * Similarity findet Themenzwillinge, und ein Themenzwilling ist nach
 * RUBRIC.md C4 ausdrücklich KEINE Beziehung (DSGVO Art. 32 und NIS2 Art. 21
 * fordern beide TOMs, sagen aber nichts übereinander). Similarity-Suche
 * produziert damit SYSTEMATISCH Negative — ein Set fast ohne Positive kann
 * kein Kappa tragen.
 *
 * Die Rubrik selbst formuliert den richtigen Test (C4): „Verweist eine der
 * beiden Provisions auf die andere Norm?" Genau das prüft dieses Modul.
 * Similarity bleibt erhalten — degradiert auf das, wofür sie taugt: harte
 * Negative.
 *
 * ⚠️ ERWEITERN: Ein neues Gesetz im Korpus heißt, hier seine Referenz-Muster
 * einzutragen — die Muster, mit denen ANDERE Texte auf es verweisen (seine
 * Verordnungs-/Richtliniennummer, sein geläufiger Name auf DE und EN, seine
 * Abkürzung). Ohne Eintrag ist das Gesetz für die referenz-getriebene Auswahl
 * unsichtbar und fällt still auf reine Similarity zurück — deshalb meldet der
 * CLI-Aufrufer fehlende Einträge laut (siehe hasReferencePatterns).
 *
 * Bewusst NICHT hier: thematische Stichworte („Sicherheitsmaßnahmen",
 * „Cybersicherheit"). Die würden genau die Themenzwillinge zurückholen, deren
 * Ausschluss der Sinn dieses Moduls ist.
 *
 * Linear: THE-421 (Task 12a) · THE-433
 */

/** Muster pro LAW-Familie — Sprachvarianten (dsgvo/dsgvo-en) teilen sie sich. */
export const LAW_FAMILY_PATTERNS: Record<string, RegExp[]> = {
  gdpr: [
    /\((?:EU|EG)\)\s*(?:(?:Nr|No)\.?\s*)?2016\/679/i,
    /Datenschutz-?Grundverordnung/i,
    /\bDS-?GVO\b/i,
    /General Data Protection Regulation/i,
    /\bGDPR\b/,
  ],
  nis2: [/\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2022\/2555/i, /NIS-?\s?2(?:-|\s)?(?:Richtlinie|Directive)/i, /\bNIS-?\s?2\b/i],
  dora: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2022\/2554/i,
    /Digital Operational Resilience Act/i,
    /Digitale Operationale Resilienz/i,
    /\bDORA\b/,
  ],
  aiAct: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2024\/1689/i,
    /KI-?Verordnung/i,
    /Artificial Intelligence Act/i,
    /\bAI Act\b/i,
    /\bKI-?VO\b/i,
  ],
  cra: [/\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2024\/2847/i, /Cyber-?\s?Resilience Act/i, /Cyberresilienz-?Verordnung/i, /\bCRA\b/],
  lksg: [/Lieferkettensorgfaltspflichtengesetz/i, /\bLkSG\b/, /Supply Chain Due Diligence Act/i],
  // THE-517 (Korpus-Ausbau 2026-07-25): Muster für die restlichen typisierten
  // Gesetze, damit der Miner Verweise AUF sie in fremden Texten erkennt.
  dataAct: [/\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2023\/2854/i, /\bData Act\b/i, /\bDatengesetz\b/i],
  psd2: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2015\/2366/i,
    /Payment Services Directive/i,
    /Zahlungsdiensterichtlinie/i,
    /\bPSD-?\s?2\b/i,
  ],
  mdr: [/\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2017\/745/i, /Medical Devices? Regulation/i, /Medizinprodukte-?Verordnung/i, /\bMDR\b/],
  eprivacy: [
    /(?:Richtlinie|Directive)\s*2002\/58(?:\/E[GC])?/i,
    /\be-?Privacy\b/i,
    /Datenschutzrichtlinie für elektronische Kommunikation/i,
  ],
  eidas: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?910\/2014/i,
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2024\/1183/i,
    /\beIDAS\b/i,
    /elektronische Identifizierung.*Vertrauensdienste/i,
  ],
  unece: [/UN(?:ECE)?[- ]?(?:Regelung|Regulation)\s*(?:No\.?|Nr\.?)?\s*155/i, /\bUN[- ]?R155\b/i, /\bR155\b/],
  // THE-519: Anleihe-Ziel-Gesetze (werden von Korpus-Normen als Definitionsquelle zitiert).
  standardisation: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?1025\/2012/i,
    /European Standardisation Regulation/i,
    /Normungsverordnung/i,
  ],
  // THE-614: ESG-Rating-VO. Bewusst nur Amtsnummer und Eigenname — „ESG-Rating"
  // allein wäre ein Thema, kein Verweis, und holte genau die Themenzwillinge
  // zurück, deren Ausschluss der Sinn dieses Moduls ist.
  esgRating: [
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2024\/3005/i,
    /ESG-?Rating-?Verordnung/i,
    /ESG Ratings? Regulation/i,
    /Transparenz und Integrität von ESG-?Rating/i,
  ],
  emoney: [
    /(?:Richtlinie|Directive)\s*2009\/110(?:\/E[GC])?/i,
    /\(EU\)\s*(?:(?:Nr|No)\.?\s*)?2009\/110/i,
    /Electronic Money Directive/i,
    /E-?Geld-?Richtlinie/i,
  ],
};

/** Korpus-Quelle → Law-Familie. Beide Sprachvarianten zeigen auf dieselbe Musterliste. */
export const SOURCE_TO_FAMILY: Record<string, keyof typeof LAW_FAMILY_PATTERNS> = {
  dsgvo: 'gdpr',
  'dsgvo-en': 'gdpr',
  nis2: 'nis2',
  'nis2-de': 'nis2',
  dora: 'dora',
  'dora-de': 'dora',
  'ai-act-de': 'aiAct',
  'ai-act-en': 'aiAct',
  'cra-de': 'cra',
  'cra-en': 'cra',
  cra: 'cra',
  lksg: 'lksg',
  // THE-517: restliche Korpus-Quellen (Quell-IDs gegen die Goldens verifiziert;
  // einige Gesetze existieren zusätzlich als suffixlose Roh-Variante).
  'data-act-de': 'dataAct',
  'data-act-en': 'dataAct',
  psd2: 'psd2',
  'psd2-de': 'psd2',
  'psd2-en': 'psd2',
  mdr: 'mdr',
  'mdr-de': 'mdr',
  'mdr-en': 'mdr',
  eprivacy: 'eprivacy',
  'eprivacy-de': 'eprivacy',
  'eprivacy-en': 'eprivacy',
  'eidas-de': 'eidas',
  'eidas-en': 'eidas',
  'unece-r155': 'unece',
  // THE-519: Anleihe-Ziel-Gesetze.
  'standardisation-de': 'standardisation',
  'standardisation-en': 'standardisation',
  'emoney-de': 'emoney',
  'emoney-en': 'emoney',
  // THE-614: ESG-Rating-VO (EU) 2024/3005.
  'esg-rating-de': 'esgRating',
  'esg-rating-en': 'esgRating',
};

export interface LawReferenceMatch {
  /** Der konkret gefundene Textbeleg (gekürzt) — Nachvollziehbarkeit für Rater. */
  matched: string;
  /** Artikelnummern, die unmittelbar VOR der Zitierung stehen ("Article 6, point 1, of Directive …"). */
  articleHints: string[];
}

/** True, wenn für diese Korpus-Quelle Referenz-Muster hinterlegt sind. */
export function hasReferencePatterns(source: string): boolean {
  return source in SOURCE_TO_FAMILY;
}

// Fenster vor der Zitierung, in dem eine Artikelnummer als Pinpoint gilt.
// Bewusst kurz: „Article 20 to the competent authorities … in accordance with
// Directive (EU) 2022/2555" nennt Art. 20 des ZITIERENDEN Gesetzes, nicht des
// zitierten. Ein enges Fenster trifft „Article 6, point 1, of Directive (EU)
// 2022/2555" und lässt den weit entfernten Fehlbezug liegen. Heuristik, kein
// Parser.
//
// Der Pinpoint ist seit THE-433 (Nachschärfung) kein bloßer Sortier-Hinweis
// mehr, sondern entscheidet, MIT WELCHER Gegen-Provision ein Paar überhaupt
// gebildet wird — siehe die Begründung über `selectCandidatesWithPinpoints`
// (Server, relationsCandidates.ts). Ein Label ist er weiterhin NIE: welcher
// Beziehungstyp vorliegt, entscheiden die Rater.
const PINPOINT_WINDOW = 120;

// Formulierungen, die eine davor stehende Artikelnummer ausdrücklich dem
// ZITIERENDEN Gesetz zuschlagen. Steht so etwas zwischen dem Artikel-Hinweis
// und der Zitierung, gehört die Nummer nicht zur zitierten Norm.
//
// Belegt am echten Korpus: CRA Art. 12 Absatz 3 schreibt „… den
// Konformitätsbewertungsverfahren gemäß Artikel 32 Absatz 3 DER VORLIEGENDEN
// VERORDNUNG unterliegen, und auch nach Artikel 6 der Verordnung (EU)
// 2024/1689 …". Ohne diesen Filter zieht das Fenster „32" mit — und CRA Art. 12
// wird fälschlich mit AI-Act Art. 32 verknüpft, einer Vorschrift, die im Text
// nie gemeint war. Genau die Sorte willkürliches Paar, auf der die Rater
// auseinanderlaufen.
//
// „der genannten Verordnung" ist bewusst NICHT dabei: das verweist auf die
// zuvor zitierte FREMDE Norm, ist also ein echter Pinpoint.
const CITING_LAW_MARKERS =
  /(?:vorliegenden|dieser|diesem|jener)\s+(?:Verordnung|Richtlinie|Gesetzes?)|this\s+(?:Regulation|Directive|Act)/i;

// ── Anaphorische Pinpoints NACH der Zitierung (THE-433, AC-4-Härtetest) ──
//
// Nicht jeder Artikel-Pinpoint steht VOR der Zitierung. Der adjudizierte
// Präzedenzfall DORA Art. 1 → NIS2 Art. 4 lautet: „… transposing Article 3 of
// Directive (EU) 2022/2555, this Regulation shall be considered a
// sector-specific Union legal act for the purposes of ARTICLE 4 OF THAT
// DIRECTIVE." — der entscheidungstragende Pinpoint (Art. 4) folgt der
// Zitierung als Anapher. Ohne diesen Zweig wäre genau die Kante, an der AC-4
// hängt, für den Batch unsichtbar (kein Kandidat → keine Klassifikation).
//
// BEWUSST KONSERVATIV, Fehltreffer-Vermeidung vor Vollständigkeit:
//  1. Nur Artikel mit EXPLIZITER Anapher zählen („of that Directive/
//     Regulation", „der/des genannten Richtlinie/Verordnung") — ein nackter
//     Artikel nach der Zitierung gehört fast immer zum ZITIERENDEN Gesetz.
//     „dieser Richtlinie/Verordnung" ist KEINE solche Anapher — das meint das
//     zitierende Dokument selbst (siehe CITING_LAW_MARKERS).
//  2. Das Fenster endet an der NÄCHSTEN Amtsnummern-Zitierung: eine Anapher
//     löst sich immer zur zuletzt genannten Norm auf — was nach einer neuen
//     Zitierung steht, gehört zu jener, nicht zu dieser.
const ANAPHORIC_WINDOW = 200;
const ANAPHORIC_PINPOINT =
  /\b(?:Artikel[ns]?|Article|Art\.)\s*(\d+[a-z]?)\s+(?:of that (?:Directive|Regulation)\b|(?:der|des) genannten (?:Richtlinie|Verordnung)\b)/gi;
// Nächste Amtsnummern-Zitierung (irgendeines Gesetzes) — schneidet das Fenster ab.
const NEXT_CITATION = /\((?:EU|EG|EC)\)\s*(?:(?:Nr|No)\.?\s*)?\d{3,4}\/\d+|\b\d{4}\/\d+\/(?:EU|EG|EC)\b/;

// ── Satz-Grenzen-Regel für Pinpoints (THE-519) ──────────────────────────
//
// Die Artikel-Hints EINES Matches gehören nur zum SATZ des Matches. Das
// Fenster (PINPOINT_WINDOW rückwärts, ANAPHORIC_WINDOW vorwärts) bleibt, wird
// aber an der Satzgrenze GEKAPPT: min(Fenster-Ende, Satz-Ende). Ohne das zieht
// das Fenster über einen Satzabschluss hinweg eine Artikelnummer aus dem
// Nachbarsatz heran und behauptet ein Paar, das der Verweis-Satz nie trägt —
// genau der Mechanismus des Golden-Artefakts dsgvo-4↔nis2-35 (der zitierende
// Satz nannte den Ziel-Artikel gar nicht; die Nummer stammte aus dem
// Nebensatz nebenan).
//
// Satzende = „.“ oder „;“ + Whitespace + folgender Großbuchstabe / Ziffer /
// öffnende Klammer (numerierte Absätze „(2)“). ABER: eine juristische
// Abkürzung („Art.“, „Abs.“, „Nr.“ …) oder ein Einzelbuchstabe-Kürzel („z.“,
// „u.“) ist KEIN Satzende — sonst würde „Art. 4“ als Satzabschluss missdeutet
// und der eigentliche Pinpoint (die 4) fiele weg. Deshalb der negative
// Lookbehind. Der DORA-Präzedenzfall („… for the purposes of Article 4 of
// that Directive.“) bleibt grün: seine Anapher steht IM SELBEN Satz vor dem
// Satzende, also innerhalb der Kappung (doraNis2Hardening.test.ts).
const SENTENCE_BOUNDARY_SOURCE = String.raw`(?<!\b(?:[A-Za-zÄÖÜäöü]|Art|Artikel|Abs|Nr|Nrn|No|lit|Buchst|Ziff|Ziffer|Nummer|para|pt|Sec|Reg|Dir|vgl|bzw|sog|gem|ggf|ff|resp|cf|EU|EG|EC))[.;]\s+(?=[A-ZÄÖÜ0-9(])`;

/**
 * Zerlegt einen Volltext an der obigen Satz-Grenzen-Definition in Sätze
 * (getrimmt, leere Segmente verworfen). Hierher gehoben aus
 * packages/server/src/scripts/build-interprets-audit.ts (THE-529, Task 1):
 * das Server-Skript spiegelte SENTENCE_BOUNDARY_SOURCE byte-gleich, weil die
 * Konstante nicht exportiert war — jetzt gibt es EINE Wahrheit, die Eval
 * (Server) und Batch (Crawler) identisch nutzen. Verhalten byte-identisch zum
 * Server-Original (Golden-Identitätstests: interpretsSharedLift.test.ts).
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const re = new RegExp(SENTENCE_BOUNDARY_SOURCE, 'g');
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    out.push(text.slice(last, end));
    last = end;
    if (m.index === re.lastIndex) re.lastIndex++; // Null-Length-Schutz
  }
  out.push(text.slice(last));
  return out.map((s) => s.trim()).filter(Boolean);
}

// ── Ziel-Gesetz-Identifikatoren aus der Musterregistry (THE-529, Task 1) ──
//
// `parseBorrowTemplate`/`auditInterpretsCandidate` brauchen die literalen
// Verordnungsnummern des Ziel-Gesetzes (z. B. „2016/679"), die im Verweis-Satz
// auftauchen. Die stehen bereits — als Regex — in `LAW_FAMILY_PATTERNS`; hier
// werden die reinen Nummern herausgezogen, damit keine zweite, driftende
// Nummern-Wahrheit entsteht. Hierher gehoben aus
// packages/server/src/scripts/build-interprets-audit.ts, weil der Crawler-Batch
// keinen Server-Code importieren kann.
const IDENT_IN_PATTERN = /(\d{3,4})\\\/(\d+)(?:\\\/E\[GC\])?/g;
const identCache = new Map<string, string[]>();

/** Literale Gesetzes-Nummern-Identifikatoren für eine Korpus-Quelle (z. B. 'dsgvo' → ['2016/679']). */
export function identsForSource(source: string): string[] {
  const family = SOURCE_TO_FAMILY[source];
  if (!family) return [];
  const cached = identCache.get(family);
  if (cached) return cached;
  const out = new Set<string>();
  for (const pattern of LAW_FAMILY_PATTERNS[family]) {
    IDENT_IN_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IDENT_IN_PATTERN.exec(pattern.source)) !== null) {
      out.add(`${m[1]}/${m[2]}`);
    }
  }
  const idents = [...out];
  identCache.set(family, idents);
  return idents;
}

/**
 * Beschneidet den Text VOR dem Match auf den Satz des Matches: alles bis zum
 * LETZTEN Satzende im Fenster wird verworfen (gehört zum Vorsatz). Bleibt kein
 * Satzende im Fenster, ist das ganze Fenster satz-lokal und bleibt unverändert.
 */
function clampBeforeToSentence(before: string): string {
  const re = new RegExp(SENTENCE_BOUNDARY_SOURCE, 'g');
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(before)) !== null) {
    lastEnd = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // Null-Length-Schutz
  }
  return lastEnd >= 0 ? before.slice(lastEnd) : before;
}

/**
 * Beschneidet den Text NACH dem Match auf den Satz des Matches: alles ab dem
 * ERSTEN Satzende wird verworfen (gehört zum Folgesatz).
 */
function clampAfterToSentence(after: string): string {
  const first = new RegExp(SENTENCE_BOUNDARY_SOURCE).exec(after);
  return first ? after.slice(0, first.index) : after;
}

/**
 * Findet alle Stellen, an denen `text` auf das Gesetz hinter `targetSource`
 * verweist. Leeres Ergebnis für Quellen ohne registrierte Muster — Aufrufer
 * prüfen das mit `hasReferencePatterns`, statt es hier still zu verschlucken.
 */
export function referencesLaw(text: string, targetSource: string): LawReferenceMatch[] {
  const family = SOURCE_TO_FAMILY[targetSource];
  if (!family) return [];
  if (!text) return [];

  const out: LawReferenceMatch[] = [];
  for (const pattern of LAW_FAMILY_PATTERNS[family]) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Fenster rückwärts, an der Satzgrenze gekappt: Hints nur aus dem Satz
      // des Matches (THE-519).
      const before = clampBeforeToSentence(text.slice(Math.max(0, m.index - PINPOINT_WINDOW), m.index));
      const articleHints: string[] = [];
      const artRe = /\b(?:Artikel[ns]?|Article|Art\.)\s*(\d+[a-z]?)/gi;
      let a: RegExpExecArray | null;
      while ((a = artRe.exec(before)) !== null) {
        // Zwischen Artikel-Hinweis und Zitierung nachsehen: „… Artikel 32 der
        // VORLIEGENDEN Verordnung … Verordnung (EU) 2024/1689" nennt Art. 32
        // des zitierenden, nicht des zitierten Gesetzes.
        if (CITING_LAW_MARKERS.test(before.slice(a.index + a[0].length))) continue;
        // Sofort normalisieren: der Hinweis wird gleich gegen ein
        // `paragraphNumber` aus dem Korpus verglichen, und zwei
        // Schreibweisen, die nie zueinander finden, wären eine still
        // verpuffende Auswahl-Regel.
        const n = normalizeArticleNumber(a[1]);
        if (n) articleHints.push(n);
      }
      // Anaphorische Pinpoints NACH der Zitierung („Article 4 of that
      // Directive") — Fenster endet an der nächsten Amtsnummern-Zitierung,
      // weil sich eine Anapher immer zur zuletzt genannten Norm auflöst.
      let after = text.slice(m.index + m[0].length, m.index + m[0].length + ANAPHORIC_WINDOW);
      const nextCitation = NEXT_CITATION.exec(after);
      if (nextCitation) after = after.slice(0, nextCitation.index);
      // … und zusätzlich an der Satzgrenze gekappt: eine Anapher, die erst im
      // Folgesatz steht, gehört nicht mehr zu diesem Verweis (THE-519). Der
      // DORA-Fall („Article 4 of that Directive“) steht im selben Satz und
      // bleibt damit erhalten.
      after = clampAfterToSentence(after);
      const anaRe = new RegExp(ANAPHORIC_PINPOINT.source, ANAPHORIC_PINPOINT.flags);
      let ana: RegExpExecArray | null;
      while ((ana = anaRe.exec(after)) !== null) {
        const n = normalizeArticleNumber(ana[1]);
        if (n && !articleHints.includes(n)) articleHints.push(n);
      }
      out.push({ matched: m[0], articleHints });
      if (m.index === re.lastIndex) re.lastIndex++; // Schutz vor Null-Length-Endlosschleife
    }
  }
  return out;
}

/**
 * Bringt beide Seiten des Pinpoint-Vergleichs auf dieselbe Schreibweise: links
 * ein aus Fließtext gefischter Hinweis („Artikel 15", „Article 15"), rechts ein
 * Korpus-Feld `paragraphNumber` („Art. 15", bei LkSG „§ 3"). Ohne diese
 * Normalisierung würde die Pinpoint-Regel still nie greifen.
 *
 * BEWUSST KONSERVATIV: ein Fehltreffer erzeugt ein falsches Positiv im
 * Prüfsatz und damit genau den Schaden, den diese Änderung behebt — ein
 * verpasster Treffer kostet nur einen Kandidaten. Deshalb nur führende
 * Nummer (+ optionaler Buchstaben-Suffix, weil Art. 15 und Art. 15a
 * verschiedene Vorschriften sind) nach einem bekannten Präfix; alles andere
 * („Anhang III", „Annex I") ergibt `undefined` statt einer geratenen Zahl.
 */
export function normalizeArticleNumber(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Trennzeichen bewusst breit (Leerzeichen, Punkt, Bindestrich): dasselbe
  // Feld begegnet uns als „Art. 15" (Korpus-paragraphNumber), als „art-15"
  // (slugifizierter regulationKey) und als „Artikel 15" (Fließtext-Hinweis).
  const stripped = raw
    .trim()
    .replace(/^(?:Artikel|Article|Art|Section|Sec|§)\.?[\s\-–_]*/i, '')
    .trim();
  const m = /^(\d+)\s*([a-z])?\b/i.exec(stripped);
  if (!m) return undefined;
  // Führende Nullen weg: „Art. 06" und „Article 6" sind dieselbe Vorschrift.
  const num = String(parseInt(m[1], 10));
  return m[2] ? `${num}${m[2].toLowerCase()}` : num;
}
