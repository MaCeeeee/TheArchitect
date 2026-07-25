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
    /\((?:EU|EG)\)\s*(?:Nr\.?\s*)?2016\/679/i,
    /Datenschutz-?Grundverordnung/i,
    /\bDS-?GVO\b/i,
    /General Data Protection Regulation/i,
    /\bGDPR\b/,
  ],
  nis2: [/\(EU\)\s*(?:Nr\.?\s*)?2022\/2555/i, /NIS-?\s?2(?:-|\s)?(?:Richtlinie|Directive)/i, /\bNIS-?\s?2\b/i],
  dora: [
    /\(EU\)\s*(?:Nr\.?\s*)?2022\/2554/i,
    /Digital Operational Resilience Act/i,
    /Digitale Operationale Resilienz/i,
    /\bDORA\b/,
  ],
  aiAct: [
    /\(EU\)\s*(?:Nr\.?\s*)?2024\/1689/i,
    /KI-?Verordnung/i,
    /Artificial Intelligence Act/i,
    /\bAI Act\b/i,
    /\bKI-?VO\b/i,
  ],
  cra: [/\(EU\)\s*(?:Nr\.?\s*)?2024\/2847/i, /Cyber-?\s?Resilience Act/i, /Cyberresilienz-?Verordnung/i, /\bCRA\b/],
  lksg: [/Lieferkettensorgfaltspflichtengesetz/i, /\bLkSG\b/, /Supply Chain Due Diligence Act/i],
  // THE-517 (Korpus-Ausbau 2026-07-25): Muster für die restlichen typisierten
  // Gesetze, damit der Miner Verweise AUF sie in fremden Texten erkennt.
  dataAct: [/\(EU\)\s*(?:Nr\.?\s*)?2023\/2854/i, /\bData Act\b/i, /\bDatengesetz\b/i],
  psd2: [
    /\(EU\)\s*(?:Nr\.?\s*)?2015\/2366/i,
    /Payment Services Directive/i,
    /Zahlungsdiensterichtlinie/i,
    /\bPSD-?\s?2\b/i,
  ],
  mdr: [/\(EU\)\s*(?:Nr\.?\s*)?2017\/745/i, /Medical Devices? Regulation/i, /Medizinprodukte-?Verordnung/i, /\bMDR\b/],
  eprivacy: [
    /(?:Richtlinie|Directive)\s*2002\/58(?:\/E[GC])?/i,
    /\be-?Privacy\b/i,
    /Datenschutzrichtlinie für elektronische Kommunikation/i,
  ],
  eidas: [
    /\(EU\)\s*(?:Nr\.?\s*)?910\/2014/i,
    /\(EU\)\s*(?:Nr\.?\s*)?2024\/1183/i,
    /\beIDAS\b/i,
    /elektronische Identifizierung.*Vertrauensdienste/i,
  ],
  unece: [/UN(?:ECE)?[- ]?(?:Regelung|Regulation)\s*(?:No\.?|Nr\.?)?\s*155/i, /\bUN[- ]?R155\b/i, /\bR155\b/],
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
      const before = text.slice(Math.max(0, m.index - PINPOINT_WINDOW), m.index);
      const articleHints: string[] = [];
      const artRe = /\b(?:Artikel|Article|Art\.)\s*(\d+[a-z]?)/gi;
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
