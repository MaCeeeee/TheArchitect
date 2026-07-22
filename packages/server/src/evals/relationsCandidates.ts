/**
 * Relations-Kandidaten — reine Ranking- + Selektions-Logik für das Relations-
 * Golden-Set (THE-421, Task 12a). ~1532 Paragraphen im Korpus, ein Gesetzespaar
 * wie DORA×NIS2 liegt bei ~300×300 = 90.000 Kombinationen — das lässt sich
 * weder vollständig noch zufällig labeln (Zufalls-Sample ≈ 100% Negative, misst
 * nichts). Also müssen Kandidaten VORAB selektiert werden, und weil die Qualität
 * des gesamten nachgelagerten Labeling-Sets davon abhängt, ist diese Auswahl-
 * Logik hier bewusst als reine, isoliert getestete Funktion isoliert — kein
 * I/O, kein Netz, kein LLM. Fetching + Draft-Assembly ist Task 12b.
 *
 * Drei Kandidatenquellen (siehe Task-Spec):
 *  1. similar  — hohe Cosine-Similarity zwischen den Paragraph-Embeddings, wo
 *     echte Cross-Norm-Relationen plausibel liegen.
 *  2. negative — das UNÄHNLICHE Ende. Ohne bewusste Negative ist Precision
 *     nicht messbar: ein Labeler, der nur plausible Paare sieht, kann nie
 *     zeigen, dass die Methode Unplausibles zurückweist (Analogon zu den
 *     "Hard Negatives" im Mapping-Rubric).
 *  3. anchor   — bekannte, IMMER einzuschließende Paare (z. B. DORAs
 *     Eröffnungsartikel referenzieren NIS2 explizit; DSGVO Art. 32 und
 *     NIS2 Art. 21 fordern beide Sicherheitsmaßnahmen) — unabhängig davon, wo
 *     Similarity sie einordnen würde.
 *
 * Design-Entscheidungen:
 *  - Ein Anchor, dessen Paar in `ranked` nicht existiert, wird NICHT still
 *    verworfen — `selectCandidates` wirft. Ein Anchor ist genau der Fall, den
 *    jemand bewusst angefordert hat; ein stilles Weglassen wäre eine Falle,
 *    die erst auffällt, wenn im Label-Set eine erwartete Zeile fehlt.
 *  - Anchors dürfen in beliebiger Reihenfolge angegeben werden ([keyX,keyY]
 *    ODER [keyY,keyX]) — das interne a/b ist nach regulationKey sortiert
 *    (relationsGolden.ts-Konvention: a.regulationKey < b.regulationKey). Ein
 *    Anchor-Lookup, der nur die exakte (a,b)-Reihenfolge akzeptiert, würde
 *    einen in "natürlicher" Reihenfolge angegebenen Anchor am internen Sort
 *    scheitern lassen — dieselbe Silent-Drop-Falle, nur über die Argument-
 *    Reihenfolge statt über ein wirklich fehlendes Paar ausgelöst.
 *  - Similar/Negative werden GREEDY von den beiden Enden der Rangliste
 *    gezogen (maximale Trennschärfe: die extremsten Positiv-/Negativ-
 *    Kandidaten) — das bleibt der `seed` bewusst unangetastet, sonst würde
 *    eine zufällige Auswahl schwächere Kandidaten ziehen als das Optimum, das
 *    bereits vorliegt. `seed`/`mulberry32` steuern stattdessen deterministisch
 *    die PRÄSENTATIONS-Reihenfolge der finalen Auswahl — ohne das sähe ein
 *    menschlicher Labeler immer "erst alle Anchors, dann alle Similar, dann
 *    alle Negative", was Reihenfolge-Bias in die Annotation einführen würde.
 *  - Ties in der Similarity dürfen `rankCandidatePairs` nicht non-
 *    deterministisch machen — Tie-Break auf dem stabilen Pair-Key.
 *
 * NACHTRAG (THE-433): Quelle 1 („similar") trägt kein Kappa — Similarity findet
 * Themenzwillinge, und die sind nach RUBRIC.md ausdrücklich KEINE Beziehung.
 * Die Positiv-Quelle ist seither die artikelscharfe Zitierung („pinpoint",
 * siehe `selectCandidatesWithPinpoints`); Similarity bleibt für die Negativen.
 * `selectCandidates` steht unverändert daneben und dokumentiert den alten,
 * rein similarity-getriebenen Weg.
 *
 * Linear: THE-421 (Task 12a) · THE-433
 */
import { mulberry32 } from './metrics';

export interface CandidateParagraph {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: 'de' | 'en';
  embedding: number[];
}

export interface RankedPair {
  a: CandidateParagraph;
  b: CandidateParagraph; // sorted: a.regulationKey < b.regulationKey
  score: number; // cosine similarity
  bucket?: 'similar' | 'negative' | 'anchor' | 'pinpoint';
  /** Nur bei bucket 'pinpoint' gesetzt: WARUM das Paar gezogen wurde (siehe ReferenceEvidence). */
  reference?: ReferenceEvidence;
}

export interface SelectOptions {
  targetSize: number;
  negativeShare?: number; // default 0.3
  anchors?: Array<[string, string]>; // regulationKey pairs, always included
  seed?: number; // default 42
}

// ─── Cosine similarity ───────────────────────────────────────────────
//
// A local, dependency-free implementation on purpose: the two existing
// occurrences in the codebase (runDiscoveryEval.ts, elementSimilarity.service.ts)
// both live in modules with I/O side effects at import time (`dotenv/config`,
// the Anthropic SDK, QdrantClient) — importing either into this pure module
// would drag those side effects into every caller, including tests. The
// formula itself mirrors the existing convention (plain dot-product /
// (‖a‖·‖b‖), 0 for a zero-vector) so scores stay comparable across the
// codebase.

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function pairKey(regA: string, regB: string): string {
  return regA < regB ? `${regA}|${regB}` : `${regB}|${regA}`;
}

// ─── Ranking ─────────────────────────────────────────────────────────

/**
 * Ranks every cross-law pair (lawA × lawB) by cosine similarity, descending.
 * Pairs are stored sorted by `regulationKey` (a < b), matching the
 * relationsGolden.ts case convention. Same-source combinations (a data
 * mistake, since lawA/lawB are meant to be two different laws) and
 * self-pairs are skipped defensively.
 */
export function rankCandidatePairs(lawA: CandidateParagraph[], lawB: CandidateParagraph[]): RankedPair[] {
  const seen = new Set<string>();
  const pairs: RankedPair[] = [];

  for (const x of lawA) {
    for (const y of lawB) {
      if (x.source === y.source) continue;
      if (x.regulationKey === y.regulationKey) continue;
      const key = pairKey(x.regulationKey, y.regulationKey);
      if (seen.has(key)) continue;
      seen.add(key);

      const [a, b] = x.regulationKey < y.regulationKey ? [x, y] : [y, x];
      pairs.push({ a, b, score: cosineSimilarity(x.embedding, y.embedding) });
    }
  }

  pairs.sort((p, q) => {
    if (q.score !== p.score) return q.score - p.score;
    // Stable tie-break: ties must not make ordering depend on input/insertion order.
    return pairKey(p.a.regulationKey, p.b.regulationKey).localeCompare(pairKey(q.a.regulationKey, q.b.regulationKey));
  });

  return pairs;
}

// ─── Referenz-Erkennung ──────────────────────────────────────────────
//
// WARUM diese zweite Kandidatenquelle überhaupt existiert (THE-433):
// Ein Zwei-Rater-Lauf über ein rein similarity-gezogenes Set ergab 94%
// Rohübereinstimmung bei Kappa 0,212 — 111 von 120 Paaren waren „keine
// Beziehung". Der Fehler lag NICHT bei den Ratern, sondern in der Auswahl:
// Similarity findet Themenzwillinge, und ein Themenzwilling ist nach
// RUBRIC.md C4 ausdrücklich KEINE Beziehung (DSGVO Art. 32 und NIS2 Art. 21
// fordern beide TOMs, sagen aber nichts übereinander). Similarity-Suche
// produziert damit SYSTEMATISCH Negative — ein Set fast ohne Positive kann
// kein Kappa tragen.
//
// Die Rubrik selbst formuliert den richtigen Test (C4): „Verweist eine der
// beiden Provisions auf die andere Norm?" Genau das prüft dieser Abschnitt.
// Similarity bleibt erhalten — degradiert auf das, wofür sie taugt: harte
// Negative.
//
// ⚠️ ERWEITERN: Ein neues Gesetz im Korpus heißt, hier seine Referenz-Muster
// einzutragen — die Muster, mit denen ANDERE Texte auf es verweisen (seine
// Verordnungs-/Richtliniennummer, sein geläufiger Name auf DE und EN, seine
// Abkürzung). Ohne Eintrag ist das Gesetz für die referenz-getriebene Auswahl
// unsichtbar und fällt still auf reine Similarity zurück — deshalb meldet der
// CLI-Aufrufer fehlende Einträge laut (siehe hasReferencePatterns).
//
// Bewusst NICHT hier: thematische Stichworte („Sicherheitsmaßnahmen",
// „Cybersicherheit"). Die würden genau die Themenzwillinge zurückholen, deren
// Ausschluss der Sinn dieses Moduls ist.

/** Muster pro LAW-Familie — Sprachvarianten (dsgvo/dsgvo-en) teilen sie sich. */
const LAW_FAMILY_PATTERNS: Record<string, RegExp[]> = {
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
};

/** Korpus-Quelle → Law-Familie. Beide Sprachvarianten zeigen auf dieselbe Musterliste. */
const SOURCE_TO_FAMILY: Record<string, keyof typeof LAW_FAMILY_PATTERNS> = {
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
  lksg: 'lksg',
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
// gebildet wird — siehe die Begründung über `selectCandidatesWithPinpoints`.
// Ein Label ist er weiterhin NIE: welcher Beziehungstyp vorliegt, entscheiden
// die Rater.
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

export interface ReferenceEvidence {
  /** Welche Seite die jeweils andere Norm adressiert — Rohsignal für das spätere Richtungs-Label. */
  side: 'a' | 'b' | 'both';
  aReferencesB: boolean;
  bReferencesA: boolean;
  aMatches: string[];
  bMatches: string[];
  /**
   * Die Zitierung benennt genau die Gegen-Provision (Artikelnummer passt).
   * Seit THE-433 (Nachschärfung) das ENTSCHEIDENDE Kriterium: nur solche Paare
   * sind Positiv-Kandidaten. `false` heißt „nennt zwar das Gesetz, aber nicht
   * diese Provision" — nach RUBRIC.md RULE 1 keine Beziehung.
   */
  pinpoint: boolean;
  /** Welche Artikelnummer(n) die Zitierung benannt hat, die zur Gegenseite passen — Beleg für den Rater. */
  pinpointArticles: string[];
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

/**
 * Prüft ein Paar auf gegenseitige Bezugnahme. Gibt `undefined` zurück, wenn
 * KEINE Seite die andere Norm adressiert — das ist der Themenzwillings-Fall
 * aus RUBRIC.md C4 und gehört ausdrücklich nicht in die Positiv-Quelle,
 * egal wie hoch die Similarity ist.
 *
 * Die Evidenz ist METADATUM (warum wurde das Paar gezogen), NIE ein Label:
 * ob die Bezugnahme eine Verdrängung, eine Konkretisierung oder gar nichts
 * davon ist, entscheiden die Rater.
 */
export function detectPairReference(pair: RankedPair): ReferenceEvidence | undefined {
  const aHits = referencesLaw(pair.a.fullText, pair.b.source);
  const bHits = referencesLaw(pair.b.fullText, pair.a.source);
  if (aHits.length === 0 && bHits.length === 0) return undefined;

  const aReferencesB = aHits.length > 0;
  const bReferencesA = bHits.length > 0;

  // Der Pinpoint prüft NICHT „nennt A das Gesetz B", sondern „nennt A GENAU
  // DIESE Vorschrift von B". Das ist der Unterschied zwischen einer 1:1- und
  // einer 1:N-Verknüpfung (siehe selectCandidatesWithPinpoints).
  const bArticle = normalizeArticleNumber(pair.b.paragraphNumber);
  const aArticle = normalizeArticleNumber(pair.a.paragraphNumber);
  const pinpointArticles: string[] = [];
  if (bArticle !== undefined && aHits.some((h) => h.articleHints.includes(bArticle))) {
    pinpointArticles.push(bArticle);
  }
  if (aArticle !== undefined && bHits.some((h) => h.articleHints.includes(aArticle))) {
    pinpointArticles.push(aArticle);
  }

  return {
    side: aReferencesB && bReferencesA ? 'both' : aReferencesB ? 'a' : 'b',
    aReferencesB,
    bReferencesA,
    aMatches: aHits.map((h) => h.matched),
    bMatches: bHits.map((h) => h.matched),
    pinpoint: pinpointArticles.length > 0,
    pinpointArticles,
  };
}

// ─── Selection ───────────────────────────────────────────────────────

/**
 * Selects up to `targetSize` pairs from a ranked list: configured anchors
 * first (always included, bucket 'anchor'), then the top slice by score
 * (bucket 'similar') and the bottom slice (bucket 'negative') filling the
 * remaining budget in `negativeShare`/`1 - negativeShare` proportion.
 *
 * Throws if a configured anchor's pair is not present in `ranked` — see the
 * module doc for why a silent skip is the wrong default here.
 */
export function selectCandidates(ranked: RankedPair[], opts: SelectOptions): RankedPair[] {
  const { targetSize, negativeShare = 0.3, anchors = [], seed = 42 } = opts;

  const byKey = new Map<string, RankedPair>();
  for (const p of ranked) byKey.set(pairKey(p.a.regulationKey, p.b.regulationKey), p);

  const selected = new Map<string, RankedPair>();
  const missing: string[] = [];
  for (const [x, y] of anchors) {
    const key = pairKey(x, y);
    const found = byKey.get(key);
    if (!found) {
      missing.push(`${x} <-> ${y}`);
      continue;
    }
    selected.set(key, { ...found, bucket: 'anchor' });
  }
  if (missing.length > 0) {
    throw new Error(`selectCandidates: anchor pair(s) not found among ranked candidates: ${missing.join(', ')}`);
  }

  // Pool for similar/negative picks excludes anchors already claimed above,
  // so a pair can never be selected twice (once as 'anchor', once as
  // 'similar'/'negative'). `ranked` stays sorted descending by score.
  const pool = ranked.filter((p) => !selected.has(pairKey(p.a.regulationKey, p.b.regulationKey)));

  const remaining = Math.max(0, targetSize - selected.size);
  const totalToPick = Math.min(remaining, pool.length);
  const negativeCount = Math.min(Math.round(totalToPick * negativeShare), totalToPick);
  const similarCount = totalToPick - negativeCount;

  // similarCount + negativeCount <= pool.length by construction, so these two
  // slices — taken from opposite ends of the score-sorted pool — never overlap.
  for (const p of pool.slice(0, similarCount)) {
    selected.set(pairKey(p.a.regulationKey, p.b.regulationKey), { ...p, bucket: 'similar' });
  }
  for (const p of pool.slice(pool.length - negativeCount)) {
    selected.set(pairKey(p.a.regulationKey, p.b.regulationKey), { ...p, bucket: 'negative' });
  }

  return shuffleDeterministic([...selected.values()], seed);
}

export interface SelectionComposition {
  anchor: number;
  /** Ausgewählte Pinpoint-Positive — die einzige Positiv-Quelle. */
  pinpoint: number;
  negative: number;
  /** Wie viele Pinpoint-Paare es insgesamt GAB (vor dem Budget-Schnitt). */
  pinpointAvailable: number;
  /** Wie viele Plätze für Positive zur Verfügung standen. `available < budget` = echter Positiv-Mangel. */
  pinpointBudget: number;
  /**
   * Paare, in denen eine Seite nur das andere GESETZ nennt, nicht diese
   * Vorschrift. Ausdrücklich KEINE Positive (RULE 1) — hier nur ausgewiesen,
   * damit sichtbar bleibt, wie viel Material die alte Law-Level-Regel
   * fälschlich als Positive geführt hätte.
   */
  lawLevelMentions: number;
  /** targetSize minus tatsächlich gelieferte Paare. > 0 = Ziel war aus dem Pool nicht erreichbar. */
  shortfall: number;
}

/**
 * Pinpoint-getriebene Auswahl (THE-433, Nachschärfung) — Nachfolger von
 * `selectCandidates` und der ersten, law-level arbeitenden Referenz-Auswahl.
 *
 * WARUM DIE NACHSCHÄRFUNG: Die erste Fassung verknüpfte auf GESETZES-Ebene.
 * Zitierte Vorschrift A das Gesetz B, galt A als verknüpft mit JEDER Vorschrift
 * von B — eine 1:N-Explosion. Gemessen am echten Korpus: CRA Art. 12 benennt
 * AI-Act Art. 6 und Art. 15, landete im Set aber mit ZEHN AI-Act-Artikeln
 * (6, 15, 16, 20, 23, 32, 42, 43, 47, 57). Auf dem richtigen Paar waren sich
 * beide Rater einig; die Uneinigkeit saß vollständig auf den willkürlichen
 * Paaren — ein Rater sagte korrekt „keine Beziehung", der andere griff zum
 * vagesten verfügbaren Typ. CONCRETIZES landete dadurch bei Kappa −0,035
 * (n=11), also auf Zufallsniveau, als Auffangtyp für Paare, die gar keine
 * Positive hätten sein dürfen. Gesamt-Kappa 0,582 gegen ein 0,6-Tor.
 *
 * Reihenfolge der Quellen, und warum:
 *  1. anchors  — wie bisher, immer drin, fehlende schlagen laut fehl.
 *  2. pinpoint — nur Paare, in denen die Zitierung GENAU die Gegen-Vorschrift
 *     benennt. Das ist die einzige Positiv-Quelle. Eine bloße Gesetzes-
 *     Erwähnung ist nach RUBRIC.md RULE 1 keine Beziehung („verweist eine
 *     Vorschrift auf die ANDERE NORM?"), also auch kein Positiv-Kandidat.
 *  3. negative — vom UNÄHNLICHEN Ende, wie bisher. Precision bleibt messbar.
 *
 * KEIN 4. Auffüllen mit „similar" oder mit Law-Level-Erwähnungen. Der Positiv-
 * Pool ist auf diesem Korpus klein (Größenordnung 23 artikelscharfe
 * Querverweise insgesamt), und das ist die ehrliche Zahl. Ein aufgefüllter Pool
 * ist genau die Falle, aus der dieses Modul kommt: er sieht groß aus und trägt
 * trotzdem kein Kappa. Deshalb meldet `stats` `pinpointAvailable` gegen
 * `pinpointBudget` und einen `shortfall`, statt die Lücke zu kaschieren.
 */
export function selectCandidatesWithPinpoints(
  ranked: RankedPair[],
  opts: SelectOptions,
): { pairs: RankedPair[]; stats: SelectionComposition } {
  const { targetSize, negativeShare = 0.3, anchors = [], seed = 42 } = opts;

  const keyOf = (p: RankedPair) => pairKey(p.a.regulationKey, p.b.regulationKey);
  const byKey = new Map<string, RankedPair>();
  for (const p of ranked) byKey.set(keyOf(p), p);

  const selected = new Map<string, RankedPair>();
  const missing: string[] = [];
  for (const [x, y] of anchors) {
    const key = pairKey(x, y);
    const found = byKey.get(key);
    if (!found) {
      missing.push(`${x} <-> ${y}`);
      continue;
    }
    selected.set(key, { ...found, bucket: 'anchor' });
  }
  if (missing.length > 0) {
    throw new Error(
      `selectCandidatesWithPinpoints: anchor pair(s) not found among ranked candidates: ${missing.join(', ')}`,
    );
  }

  const pool = ranked.filter((p) => !selected.has(keyOf(p)));

  // Pool in drei Klassen trennen. `ranked` ist bereits score-absteigend
  // sortiert, der Sort unten ist daher stabil genug; der Pair-Key als letzter
  // Tiebreaker hält ihn auch bei Score-Gleichstand deterministisch.
  const pinpointLinked: RankedPair[] = [];
  let lawLevelMentions = 0;
  for (const p of pool) {
    const evidence = detectPairReference(p);
    if (!evidence) continue; // gar keine Bezugnahme → gewöhnliches Material
    if (evidence.pinpoint) {
      pinpointLinked.push({ ...p, bucket: 'pinpoint', reference: evidence });
    } else {
      // Nennt das Gesetz, aber nicht diese Vorschrift: KEIN Positiv-Kandidat.
      // Das Paar bleibt im Pool und darf als gewöhnliches Negativ gezogen
      // werden — es wird nur nirgends als Positiv geführt.
      lawLevelMentions++;
    }
  }
  pinpointLinked.sort((p, q) => {
    if (q.score !== p.score) return q.score - p.score;
    return keyOf(p).localeCompare(keyOf(q));
  });

  const remaining = Math.max(0, targetSize - selected.size);
  const totalToPick = Math.min(remaining, pool.length);
  const negativeQuota = Math.min(Math.round(totalToPick * negativeShare), totalToPick);
  const pinpointBudget = totalToPick - negativeQuota;

  const pinpointTaken = pinpointLinked.slice(0, pinpointBudget);
  for (const p of pinpointTaken) selected.set(keyOf(p), p);

  // Was die Positive vom Budget übrig lassen, geht an die Negative — nicht an
  // „similar" und ausdrücklich nicht an Law-Level-Erwähnungen, die als Positive
  // umetikettiert würden. Unähnliche Paare sind wenigstens ehrliche Negative.
  // Dass der Positiv-Anteil dadurch klein bleibt, ist die Aussage, nicht der
  // Fehler: `stats` weist es aus.
  const takenKeys = new Set(pinpointTaken.map(keyOf));
  const negativePool = pool.filter((p) => !takenKeys.has(keyOf(p)));
  const negativeCount = Math.min(totalToPick - pinpointTaken.length, negativePool.length);
  for (const p of negativePool.slice(negativePool.length - negativeCount)) {
    selected.set(keyOf(p), { ...p, bucket: 'negative' });
  }

  const pairs = shuffleDeterministic([...selected.values()], seed);
  const stats: SelectionComposition = {
    anchor: pairs.filter((p) => p.bucket === 'anchor').length,
    pinpoint: pinpointTaken.length,
    negative: negativeCount,
    pinpointAvailable: pinpointLinked.length,
    pinpointBudget,
    lawLevelMentions,
    shortfall: Math.max(0, targetSize - pairs.length),
  };

  return { pairs, stats };
}

/** Fisher–Yates shuffle driven by mulberry32 — deterministic per seed, differs across seeds. */
function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
