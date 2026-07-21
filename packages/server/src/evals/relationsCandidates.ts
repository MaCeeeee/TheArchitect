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
 * Linear: THE-421 (Task 12a)
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
  bucket?: 'similar' | 'negative' | 'anchor' | 'reference';
  /** Nur bei bucket 'reference' gesetzt: WARUM das Paar gezogen wurde (siehe ReferenceEvidence). */
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
// Parser — der Pinpoint ist reine RANGFOLGE-Präferenz, nie ein Label.
const PINPOINT_WINDOW = 120;

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
      while ((a = artRe.exec(before)) !== null) articleHints.push(a[1]);
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
  /** Die Zitierung benennt genau die Gegen-Provision (Artikelnummer passt) — stärkstes Signal. */
  pinpoint: boolean;
}

/** Extrahiert die reine Artikelnummer aus einem paragraphNumber wie "Art. 32" / "Artikel 32". */
function articleNumberOf(paragraphNumber: string): string | undefined {
  const m = /(\d+[a-z]?)/i.exec(paragraphNumber ?? '');
  return m ? m[1] : undefined;
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

  const bArticle = articleNumberOf(pair.b.paragraphNumber);
  const aArticle = articleNumberOf(pair.a.paragraphNumber);
  const pinpoint =
    (bArticle !== undefined && aHits.some((h) => h.articleHints.includes(bArticle))) ||
    (aArticle !== undefined && bHits.some((h) => h.articleHints.includes(aArticle)));

  return {
    side: aReferencesB && bReferencesA ? 'both' : aReferencesB ? 'a' : 'b',
    aReferencesB,
    bReferencesA,
    aMatches: aHits.map((h) => h.matched),
    bMatches: bHits.map((h) => h.matched),
    pinpoint,
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
  reference: number;
  similar: number;
  negative: number;
  /** Wie viele referenz-verknüpfte Paare es insgesamt GAB (vor dem Budget-Schnitt). */
  referenceAvailable: number;
  /** Davon mit passender Artikel-Zitierung — die stärksten Positiv-Kandidaten. */
  referencePinpoint: number;
}

/**
 * Referenz-getriebene Auswahl (THE-433) — Nachfolger von `selectCandidates`
 * für Sets, die ein Kappa tragen sollen.
 *
 * Reihenfolge der Quellen, und warum:
 *  1. anchors    — wie bisher, immer drin, fehlende schlagen laut fehl.
 *  2. reference  — alle Paare, in denen eine Seite die andere Norm im TEXT
 *     adressiert. Hier liegen echte Beziehungen; das ist die Positiv-Quelle.
 *     Reichen sie über das Budget hinaus, wird sortiert: Pinpoint zuerst
 *     (die Zitierung nennt genau die Gegen-Provision), dann Similarity als
 *     Tiebreaker — unter bereits referenz-verknüpften Paaren ist Ähnlichkeit
 *     ein brauchbarer Hinweis darauf, WELCHE Provision gemeint war.
 *  3. negative   — vom UNÄHNLICHEN Ende, wie bisher. `negativeShare` wirkt als
 *     Mindestanteil: Precision bleibt messbar.
 *  4. similar    — nur noch Auffüllung, falls Referenzen UND Negative das Ziel
 *     nicht füllen. Similarity ist nach C4 kein Positiv-Indikator mehr.
 *
 * Die Zusammensetzung wird zurückgegeben statt nur intern verrechnet: ein Set,
 * dessen Positiv-Anteil sich still ändert, ist genau die Falle, aus der dieses
 * Modul kommt.
 */
export function selectCandidatesWithReferences(
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
      `selectCandidatesWithReferences: anchor pair(s) not found among ranked candidates: ${missing.join(', ')}`,
    );
  }

  const pool = ranked.filter((p) => !selected.has(keyOf(p)));

  // Referenz-Kandidaten annotieren. `ranked` ist bereits score-absteigend
  // sortiert, der Sort unten ist daher stabil genug; der Pair-Key als letzter
  // Tiebreaker hält ihn auch bei Score-Gleichstand deterministisch.
  const referenceLinked: RankedPair[] = [];
  for (const p of pool) {
    const evidence = detectPairReference(p);
    if (evidence) referenceLinked.push({ ...p, bucket: 'reference', reference: evidence });
  }
  referenceLinked.sort((p, q) => {
    const pp = p.reference?.pinpoint ? 1 : 0;
    const qp = q.reference?.pinpoint ? 1 : 0;
    if (pp !== qp) return qp - pp;
    if (q.score !== p.score) return q.score - p.score;
    return keyOf(p).localeCompare(keyOf(q));
  });

  const remaining = Math.max(0, targetSize - selected.size);
  const totalToPick = Math.min(remaining, pool.length);
  const negativeQuota = Math.min(Math.round(totalToPick * negativeShare), totalToPick);
  const referenceBudget = totalToPick - negativeQuota;

  const referenceTaken = referenceLinked.slice(0, referenceBudget);
  for (const p of referenceTaken) selected.set(keyOf(p), p);

  // Was die Referenzen vom Budget übrig lassen, geht an die Negative — nicht
  // an „similar". Similarity-Positive sind genau das, was das Set kaputt
  // gemacht hat; unähnliche Paare sind wenigstens ehrliche Negative.
  const refKeys = new Set(referenceTaken.map(keyOf));
  const negativePool = pool.filter((p) => !refKeys.has(keyOf(p)));
  const negativeCount = Math.min(totalToPick - referenceTaken.length, negativePool.length);
  for (const p of negativePool.slice(negativePool.length - negativeCount)) {
    selected.set(keyOf(p), { ...p, bucket: 'negative' });
  }

  const stats: SelectionComposition = {
    anchor: [...selected.values()].filter((p) => p.bucket === 'anchor').length,
    reference: referenceTaken.length,
    similar: 0,
    negative: negativeCount,
    referenceAvailable: referenceLinked.length,
    referencePinpoint: referenceLinked.filter((p) => p.reference?.pinpoint).length,
  };

  return { pairs: shuffleDeterministic([...selected.values()], seed), stats };
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
