/**
 * build-interprets-audit — Instrument-Generator (THE-519, Task 4).
 *
 * Sammelt die zu adjudizierende **Audit-Teilmenge** (a ∪ b ∪ c), lässt jeden
 * Fall durch den mechanischen Prüfbaum aus Task 1
 * (`auditInterpretsCandidate`/`parseBorrowTemplate`) laufen, berechnet ein
 * Auto-Verdikt + (falls INTERPRETS) die Richtung, und schreibt zwei Ausgaben:
 *
 *   1. ein HTML-Lesedokument für den Architekten (Eich-Karten der 4
 *      Kalibrier-Fälle, die zwei offenen Regel-Fragen A/B, und je Fall eine
 *      Karte: Paar-Kennung, beide Provisions-Überschriften, der zitierende
 *      Satz mit den 4 Schablonen-Slots farbcodiert, Auto-Verdikt + Richtung +
 *      P-Pfad). Die Sprache ist ausschließlich BEOBACHTEND — das Instrument
 *      urteilt nicht, es zeigt, was im markierten Satz steht.
 *   2. ein JSON-Sidecar, dessen `caseIds`-Liste die **eingefrorene
 *      Audit-Teilmenge** fürs spätere Kohärenz-Gate ist (Task 5).
 *
 * ── Die Audit-Teilmenge = a ∪ b ∪ c ────────────────────────────────────
 *   (a) alle v4-Fälle mit `relation === 'INTERPRETS'` (die zu prüfenden
 *       INTERPRETS-Wahrheiten);
 *   (b) alle v4-`none`-Fälle (`relation === null`), deren zitierender Satz
 *       einen Leih-Operator + Ziel-Gesetz-Treffer trägt (potenzielle False
 *       Negatives — die Schärfung könnte sie als INTERPRETS entlarven);
 *   (c) neue Miner-Kandidaten aus dem `--pool`, die P0 ✓ liefern und noch nicht
 *       in v4 sind. Ohne `--pool` ist (c) leer — das Werkzeug läuft trotzdem
 *       (v4-only-Lauf).
 *
 * ── Ableitung für v4-Fälle (sie tragen KEIN evidence-Feld) ──────────────
 * `citingSide` + `citingSentence` + `pairTargetArticle` werden selbst gewonnen:
 * beide Richtungen des Paars werden geprüft (Seite a als zitierend → Ziel b,
 * Seite b als zitierend → Ziel a). Die zitierende Seite ist die, deren Text
 * einen Satz enthält, der den Paar-Ziel-Artikel des Ziel-Gesetzes nennt
 * (`parseBorrowTemplate(...).targetArticle === pairTargetArticle`). Findet
 * KEINE Seite einen solchen Satz, ist der Fall per Definition `pair-artifact`
 * (der Mechanismus, den die Satz-Grenzen-Regel aus Task 2 abstellt).
 *
 * Warum `parseBorrowTemplate` statt `referencesLaw` für die Satz-Auswahl: die
 * Artikel-Erkennung in `referencesLaw` kennt die deutsche Flexion „Artikels 4"
 * NICHT (ihr artRe ist `Artikel` ohne `[ns]?`), `parseBorrowTemplate` schon.
 * Eine echte „im Sinne des Artikels 4"-Anleihe würde über `referencesLaw` kein
 * articleHint liefern und stillschweigend zu `pair-artifact` verfälscht.
 * `parseBorrowTemplate` ist dieselbe getestete Schablonen-Logik, die auch das
 * Auto-Verdikt berechnet — eine Wahrheit für Auswahl UND Prüfung.
 *
 * ── P2-Quelle ohne Pool ────────────────────────────────────────────────
 * `targetProvisionKind` kommt primär aus dem Pool (Task 0, `provisionKind`).
 * Trägt der Ziel-Fall keinen (v4-only-Lauf), leitet der Generator ihn aus der
 * Ziel-ÜBERSCHRIFT ab: ein Artikel mit dem Titel „Begriffsbestimmungen"/
 * „Definitions" IST ein Definitions-Ort (P2). Das ist transparent im P-Pfad
 * als `P2 ✓ (Überschrift)` ausgewiesen — kein verstecktes Signal. Schlägt auch
 * das fehl, greift der `targetFullText`-Fallback aus `auditInterpretsCandidate`.
 *
 * Reine Sammel-/Render-Logik ist von der Datei-I/O getrennt und einzeln
 * testbar (`collectAuditSubset`, `renderAuditHtml`, `buildSidecar`).
 *
 * Aufruf:
 *   npm run relations:audit-interprets            # v4-only
 *   npm run relations:audit-interprets -- --pool /tmp/relations-pool.json
 *
 * Linear: THE-519 · Muster/Stil: 2026-07-25-the-433-relations-adjudication-packet.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parseBorrowTemplate,
  auditInterpretsCandidate,
  deriveDirection,
  normalizeArticleNumber,
  buildRegulationKey,
  SOURCE_TO_FAMILY,
  LAW_FAMILY_PATTERNS,
  type BorrowSlots,
  type Direction,
  type InterpretsVerdict,
} from '@thearchitect/shared';
import {
  loadRelationsGolden,
  type RelationsGoldenCase,
  type RelationsGoldenPairSide,
} from '../evals/relationsGolden';

// ─── Öffentliche Typen ──────────────────────────────────────────────

/** Ein Paragraph, wie ihn der Generator braucht — v4-Seite ODER Pool-Doc. */
export interface AuditSideInput {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: 'de' | 'en';
  /** Aus dem Pool (Task 0) — Definitions-Typisierung als P2-Quelle. */
  provisionKind?: string;
}

/** Ein Pool-Doc (THE-517-Export + Task-0-Erweiterung `provisionKind`). */
export interface PoolDoc {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
  versionHash?: string;
  provisionKind?: string;
}

export type AuditBucket = 'a-interprets' | 'b-none-operator' | 'c-pool';
/** Auto-Verdikt inkl. des Ableitungs-Ausgangs `pair-artifact` (kein Satz gefunden). */
export type AutoVerdict = InterpretsVerdict;

/** Herkunft des P2-Belegs — transparent im Artefakt ausgewiesen. */
export type P2Source = 'typed' | 'title' | 'fallback' | null;

export interface AuditCaseResult {
  caseId: string;
  bucket: AuditBucket;
  a: AuditSideInput;
  b: AuditSideInput;
  /** v4-Wahrheit als `TYPE:direction`, `null` (none) oder undefined (Pool/neu). */
  v4Label: string | null | undefined;
  autoVerdict: AutoVerdict;
  /** Die zitierende Seite, wenn ein Verweis-Satz gefunden wurde. */
  citingSide?: 'a' | 'b';
  citingSentence?: string;
  pairTargetArticle?: string;
  slots: BorrowSlots;
  direction?: Direction;
  p0: boolean;
  p1: boolean;
  p2: boolean | 'fallback';
  p2Source: P2Source;
  /** Kompakter Prüfpfad-String, z. B. „P0 ✓ · P1 ✓ · P2 ✓ (Überschrift)". */
  pPath: string;
  reasons: string[];
  /** Gesetzt am zweiten Fall eines Sprachzwilling-Paars (zählt für n nur einfach). */
  languageTwinOf?: string;
}

export interface AuditSubset {
  cases: AuditCaseResult[];
  counts: { a: number; b: number; c: number; total: number };
}

// ─── Ziel-Gesetz-Identifikatoren aus der Musterregistry ─────────────
//
// `parseBorrowTemplate`/`auditInterpretsCandidate` brauchen die literalen
// Verordnungsnummern des Ziel-Gesetzes (z. B. „2016/679"), die im Verweis-Satz
// auftauchen. Die stehen bereits — als Regex — in `LAW_FAMILY_PATTERNS`; hier
// werden die reinen Nummern herausgezogen, damit keine zweite, driftende
// Nummern-Wahrheit entsteht (dieselbe Haltung wie im Task-1-Kopf).
const IDENT_IN_PATTERN = /(\d{3,4})\\\/(\d+)(?:\\\/E\[GC\])?/g;
const identCache = new Map<string, string[]>();

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

// ─── Satz-Segmentierung ─────────────────────────────────────────────
//
// Dieselbe Satz-Grenzen-Definition wie der Miner (`lawPatterns.ts`,
// SENTENCE_BOUNDARY_SOURCE): „.“/„;“ + Whitespace + Großbuchstabe/Ziffer/
// öffnende Klammer, aber KEIN Satzende hinter einer juristischen Abkürzung
// oder einem Einzelbuchstaben-Kürzel (negativer Lookbehind). Der Miner
// exportiert die Konstante nicht; sie hier byte-gleich zu spiegeln ist die
// „Satz-Segmentierung wie im Miner üblich" aus der Task-Spec.
const SENTENCE_BOUNDARY = String.raw`(?<!\b(?:[A-Za-zÄÖÜäöü]|Art|Artikel|Abs|Nr|Nrn|No|lit|Buchst|Ziff|Ziffer|Nummer|para|pt|Sec|Reg|Dir|vgl|bzw|sog|gem|ggf|ff|resp|cf|EU|EG|EC))[.;]\s+(?=[A-ZÄÖÜ0-9(])`;

export function splitSentences(text: string): string[] {
  if (!text) return [];
  const re = new RegExp(SENTENCE_BOUNDARY, 'g');
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

// ─── P2-Quelle aus der Überschrift ──────────────────────────────────
const DEFINITION_TITLE = /\b(?:definition|definitions|definitionen|begriffsbestimmung|begriffsbestimmungen|begriffe)\b/i;

/** Ist die Ziel-Provision laut Überschrift ein Definitions-Ort? */
export function isDefinitionTitle(title: string | undefined): boolean {
  return Boolean(title && DEFINITION_TITLE.test(title));
}

// ─── Kern: ein Fall durch den Prüfbaum ──────────────────────────────

const VERDICT_RANK: Record<AutoVerdict, number> = {
  interprets: 3,
  'policy-A': 2,
  'none-usage': 1,
  'pair-artifact': 0,
};

interface DerivationHit {
  citingSide: 'a' | 'b';
  citingSentence: string;
  pairTargetArticle: string;
  slots: BorrowSlots;
  autoVerdict: AutoVerdict;
  direction?: Direction;
  p0: boolean;
  p1: boolean;
  p2: boolean | 'fallback';
  p2Source: P2Source;
  reasons: string[];
}

/**
 * Prüft eine Richtung des Paars: `citing` zitiert `target`. Sucht den Satz in
 * `citing.fullText`, der den Ziel-Paar-Artikel des Ziel-Gesetzes nennt, und
 * lässt ihn durch `auditInterpretsCandidate` laufen. Gibt den BESTEN Treffer
 * (höchstes Verdikt) zurück oder `null`, wenn kein Satz den Paar-Artikel nennt.
 */
function deriveOneDirection(
  citing: AuditSideInput,
  target: AuditSideInput,
  citingSide: 'a' | 'b',
): DerivationHit | null {
  const pairTargetArticle = normalizeArticleNumber(target.paragraphNumber);
  if (!pairTargetArticle) return null;
  const idents = identsForSource(target.source);
  if (idents.length === 0) return null;

  // P2-Quelle bestimmen (typisiert > Überschrift > fullText-Fallback).
  let provisionKind: string | undefined;
  let p2Source: P2Source = null;
  if (target.provisionKind) {
    provisionKind = target.provisionKind;
    p2Source = target.provisionKind === 'definition' ? 'typed' : null;
  } else if (isDefinitionTitle(target.title)) {
    provisionKind = 'definition';
    p2Source = 'title';
  }

  let best: DerivationHit | null = null;
  for (const sentence of splitSentences(citing.fullText)) {
    const probe = parseBorrowTemplate(sentence, idents);
    // Nur Sätze, die den Ziel-Paar-Artikel des Ziel-Gesetzes wirklich nennen.
    if (probe.targetArticle !== pairTargetArticle || !probe.targetLawHit) continue;

    const audit = auditInterpretsCandidate({
      citingSide,
      citingSentence: sentence,
      pairTargetArticle,
      targetLawIdents: idents,
      targetProvisionKind: provisionKind,
      targetFullText: target.fullText,
    });
    // Wenn P2 über den fullText-Fallback kam (nicht über typed/title), das
    // im p2Source-Etikett ehrlich machen.
    const hitP2Source: P2Source = audit.p2 === 'fallback' ? 'fallback' : p2Source;
    const hit: DerivationHit = {
      citingSide,
      citingSentence: sentence,
      pairTargetArticle,
      slots: audit.slots,
      autoVerdict: audit.verdict,
      direction: audit.direction,
      p0: audit.p0,
      p1: audit.p1,
      p2: audit.p2,
      p2Source: hitP2Source,
      reasons: audit.reasons,
    };
    if (!best || VERDICT_RANK[hit.autoVerdict] > VERDICT_RANK[best.autoVerdict]) {
      best = hit;
    }
  }
  return best;
}

/** P-Pfad-String für das Artefakt aus den drei Knoten + P2-Quelle. */
function formatPPath(p0: boolean, p1: boolean, p2: boolean | 'fallback', p2Source: P2Source): string {
  const parts: string[] = [`P0 ${p0 ? '✓' : '✗'}`];
  if (p0) parts.push(`P1 ${p1 ? '✓' : '✗'}`);
  if (p0 && p1) {
    const p2ok = p2 === true || p2 === 'fallback';
    const src =
      p2Source === 'typed'
        ? ' (typisiert)'
        : p2Source === 'title'
          ? ' (Überschrift)'
          : p2Source === 'fallback'
            ? ' (Ziel-Text)'
            : '';
    parts.push(`P2 ${p2ok ? '✓' : '✗'}${p2ok ? src : ''}`);
  }
  return parts.join(' · ');
}

/**
 * Prüft BEIDE Richtungen des Paars und wählt den besten Treffer. Findet keine
 * Richtung einen Verweis-Satz auf den Paar-Artikel → `pair-artifact` (der Fall
 * hat keinen citingSentence — genau der dsgvo-4↔nis2-35-Mechanismus).
 */
export function deriveCaseAudit(
  a: AuditSideInput,
  b: AuditSideInput,
): Omit<AuditCaseResult, 'caseId' | 'bucket' | 'a' | 'b' | 'v4Label' | 'languageTwinOf'> {
  const hitAtoB = deriveOneDirection(a, b, 'a'); // a zitiert, Ziel b
  const hitBtoA = deriveOneDirection(b, a, 'b'); // b zitiert, Ziel a
  const candidates = [hitAtoB, hitBtoA].filter((h): h is DerivationHit => h !== null);

  if (candidates.length === 0) {
    // Kein Verweis-Satz auf den Paar-Artikel auf keiner Seite → Paar-Artefakt.
    return {
      autoVerdict: 'pair-artifact',
      slots: {},
      p0: false,
      p1: false,
      p2: false,
      p2Source: null,
      pPath: 'kein Verweis-Satz auf den Paar-Artikel gefunden',
      reasons: [
        'Auf keiner der beiden Seiten nennt ein Satz den Paar-Ziel-Artikel des jeweils anderen Gesetzes — das Paar ist ein Mining-Artefakt, kein Label.',
      ],
    };
  }

  const best = candidates.reduce((x, y) => (VERDICT_RANK[y.autoVerdict] > VERDICT_RANK[x.autoVerdict] ? y : x));
  return {
    autoVerdict: best.autoVerdict,
    citingSide: best.citingSide,
    citingSentence: best.citingSentence,
    pairTargetArticle: best.pairTargetArticle,
    slots: best.slots,
    direction: best.direction,
    p0: best.p0,
    p1: best.p1,
    p2: best.p2,
    p2Source: best.p2Source,
    pPath: formatPPath(best.p0, best.p1, best.p2, best.p2Source),
    reasons: best.reasons,
  };
}

// ─── Sammel-Logik ───────────────────────────────────────────────────

function sideFromGolden(side: RelationsGoldenPairSide, provisionKind?: string): AuditSideInput {
  return {
    regulationKey: side.regulationKey,
    source: side.source,
    paragraphNumber: side.paragraphNumber,
    title: side.title,
    fullText: side.fullText,
    language: side.language,
    provisionKind,
  };
}

function slugKey(regulationKey: string): string {
  return regulationKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** v4-Label kompakt: `TYPE:direction`, `null` (none) oder undefined (offen). */
function v4LabelOf(c: RelationsGoldenCase): string | null | undefined {
  if (c.relation === null) return null;
  if (c.relation === undefined) return undefined;
  return c.direction ? `${c.relation}:${c.direction}` : c.relation;
}

/**
 * Trägt der Fall auf EINER Seite einen Satz mit Leih-Operator + Ziel-Gesetz-
 * Treffer? Signatur eines potenziellen False Negative (Bucket b).
 */
function hasBorrowOperatorSentence(a: AuditSideInput, b: AuditSideInput): boolean {
  for (const [citing, target] of [
    [a, b],
    [b, a],
  ] as const) {
    const idents = identsForSource(target.source);
    if (idents.length === 0) continue;
    for (const sentence of splitSentences(citing.fullText)) {
      const slots = parseBorrowTemplate(sentence, idents);
      if (slots.operator && slots.targetLawHit) return true;
    }
  }
  return false;
}

/**
 * Zwillings-Schlüssel: beide Seiten auf (Familie, normalisierter Artikel)
 * reduziert und sortiert. Zwei Fälle mit gleichem Schlüssel sind dieselbe
 * Anleihe in verschiedenen Sprachvarianten.
 */
function twinKey(a: AuditSideInput, b: AuditSideInput): string | null {
  const famA = SOURCE_TO_FAMILY[a.source];
  const famB = SOURCE_TO_FAMILY[b.source];
  const artA = normalizeArticleNumber(a.paragraphNumber);
  const artB = normalizeArticleNumber(b.paragraphNumber);
  if (!famA || !famB || !artA || !artB) return null;
  const sides = [`${famA}:${artA}`, `${famB}:${artB}`].sort();
  return sides.join('__');
}

/**
 * Baut ein Pool-Doc in eine Seite um; verwirft Docs ohne registrierte
 * Referenz-Familie (die wären als Ziel unauflösbar). Sprache auf de|en normiert.
 */
function sideFromPool(doc: PoolDoc): AuditSideInput | null {
  if (!SOURCE_TO_FAMILY[doc.source]) return null;
  let regulationKey: string;
  try {
    regulationKey = buildRegulationKey(doc.source, doc.paragraphNumber);
  } catch {
    return null;
  }
  return {
    regulationKey,
    source: doc.source,
    paragraphNumber: doc.paragraphNumber,
    title: doc.title,
    fullText: doc.fullText,
    language: doc.language === 'en' ? 'en' : 'de',
    provisionKind: doc.provisionKind,
  };
}

/**
 * Zählt Pool-Paar-Kandidaten auf: für jedes Doc als zitierend, jeden Satz, jede
 * FREMDE Familie ein Schablonen-Parse; Treffer mit Operator + Ziel-Artikel wird
 * gegen das Ziel-Doc (Familie + Artikel, sprachrein bevorzugt) aufgelöst.
 * Deterministisch (stabile Sortierung, Paar genau einmal). Eigene, flexions-
 * feste Aufzählung statt `enumerateRelationCandidates`, weil deren
 * `referencesLaw` die dt. Flexion „Artikels" nicht kennt (siehe Kopf).
 */
export function enumeratePoolPairs(docs: AuditSideInput[]): Array<{ a: AuditSideInput; b: AuditSideInput }> {
  // Index: Familie → Artikel → Docs (sortiert, sprachrein-Auflösung).
  const byFamilyArticle = new Map<string, Map<string, AuditSideInput[]>>();
  for (const d of [...docs].sort((x, y) => x.regulationKey.localeCompare(y.regulationKey))) {
    const fam = SOURCE_TO_FAMILY[d.source];
    const art = normalizeArticleNumber(d.paragraphNumber);
    if (!fam || !art) continue;
    if (!byFamilyArticle.has(fam)) byFamilyArticle.set(fam, new Map());
    const m = byFamilyArticle.get(fam)!;
    if (!m.has(art)) m.set(art, []);
    m.get(art)!.push(d);
  }

  const families = [...byFamilyArticle.keys()];
  const seen = new Set<string>();
  const pairs: Array<{ a: AuditSideInput; b: AuditSideInput }> = [];

  for (const citing of [...docs].sort((x, y) => x.regulationKey.localeCompare(y.regulationKey))) {
    const citingFamily = SOURCE_TO_FAMILY[citing.source];
    for (const family of families) {
      if (family === citingFamily) continue; // Sprachzwillinge nicht scannen
      const idents = identsForSource([...byFamilyArticle.get(family)!.values()][0][0].source);
      for (const sentence of splitSentences(citing.fullText)) {
        const slots = parseBorrowTemplate(sentence, idents);
        if (!slots.operator || !slots.targetArticle || !slots.targetLawHit) continue;
        const targets = byFamilyArticle.get(family)!.get(slots.targetArticle);
        if (!targets || targets.length === 0) continue;
        const sameLang = targets.filter((t) => t.language === citing.language);
        const target = (sameLang.length > 0 ? sameLang : targets)[0];
        const [x, y] =
          citing.regulationKey < target.regulationKey ? [citing, target] : [target, citing];
        const key = `${x.regulationKey}|${y.regulationKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a: x, b: y });
      }
    }
  }
  return pairs.sort((p, q) => {
    const c = p.a.regulationKey.localeCompare(q.a.regulationKey);
    return c !== 0 ? c : p.b.regulationKey.localeCompare(q.b.regulationKey);
  });
}

/**
 * Sammelt die Audit-Teilmenge a ∪ b ∪ c, leitet je Fall Auto-Verdikt + Slots ab,
 * markiert Sprachzwillinge und gibt die Fälle in STABILER caseId-Sortierung
 * (duplikatfrei) zurück. Rein — keine Datei-I/O (einzeln testbar).
 */
export function collectAuditSubset(
  v4cases: RelationsGoldenCase[],
  poolDocs?: PoolDoc[],
): AuditSubset {
  const byId = new Map<string, AuditCaseResult>();
  const v4Ids = new Set(v4cases.map((c) => c.caseId));
  let countA = 0;
  let countB = 0;
  let countC = 0;

  const addCase = (
    caseId: string,
    bucket: AuditBucket,
    a: AuditSideInput,
    b: AuditSideInput,
    v4Label: string | null | undefined,
  ): void => {
    if (byId.has(caseId)) return; // (a) vor (b) vor (c) — erster Bucket gewinnt
    const derived = deriveCaseAudit(a, b);
    byId.set(caseId, { caseId, bucket, a, b, v4Label, ...derived });
  };

  // ── (a) v4-INTERPRETS ──────────────────────────────────────────────
  for (const c of v4cases) {
    if (c.relation !== 'INTERPRETS') continue;
    addCase(c.caseId, 'a-interprets', sideFromGolden(c.a), sideFromGolden(c.b), v4LabelOf(c));
    if (byId.get(c.caseId)?.bucket === 'a-interprets') countA++;
  }

  // ── (b) v4-none MIT Leih-Operator (potenzielle False Negatives) ─────
  for (const c of v4cases) {
    if (c.relation !== null) continue;
    if (byId.has(c.caseId)) continue;
    const a = sideFromGolden(c.a);
    const b = sideFromGolden(c.b);
    if (!hasBorrowOperatorSentence(a, b)) continue;
    addCase(c.caseId, 'b-none-operator', a, b, v4LabelOf(c));
    if (byId.get(c.caseId)?.bucket === 'b-none-operator') countB++;
  }

  // ── (c) Pool-Kandidaten mit P0 ✓, nicht in v4 ──────────────────────
  if (poolDocs && poolDocs.length > 0) {
    const sides = poolDocs.map(sideFromPool).filter((s): s is AuditSideInput => s !== null);
    for (const { a, b } of enumeratePoolPairs(sides)) {
      const caseId = `${slugKey(a.regulationKey)}__${slugKey(b.regulationKey)}`;
      if (v4Ids.has(caseId) || byId.has(caseId)) continue;
      const derived = deriveCaseAudit(a, b);
      if (!derived.p0) continue; // Bucket c verlangt P0 ✓
      byId.set(caseId, { caseId, bucket: 'c-pool', a, b, v4Label: undefined, ...derived });
      countC++;
    }
  }

  const cases = [...byId.values()].sort((x, y) => x.caseId.localeCompare(y.caseId));

  // ── Sprachzwillinge markieren (kanonisch = kleinste caseId) ─────────
  const twinCanonical = new Map<string, string>();
  for (const c of cases) {
    const key = twinKey(c.a, c.b);
    if (!key) continue;
    if (!twinCanonical.has(key)) {
      twinCanonical.set(key, c.caseId);
    } else {
      c.languageTwinOf = twinCanonical.get(key);
    }
  }

  return { cases, counts: { a: countA, b: countB, c: countC, total: cases.length } };
}

// ─── HTML-Rendering (self-contained, beobachtend) ───────────────────

const VERDICT_LABEL: Record<AutoVerdict, string> = {
  interprets: 'INTERPRETS',
  'policy-A': 'policy-A (offen)',
  'none-usage': 'none (Nutzung)',
  'pair-artifact': 'pair-artifact (Paar raus)',
};

/** Die vier Kalibrier-Fälle (3 v4-Fehler + 1 Positiv-Schablone) — Task 1. */
export const CALIBRATION_CASE_IDS = [
  'data-act-de-art-2__dsgvo-art-4', // Positiv-Schablone (v4 korrekt)
  'cra-en-art-3__nis2-art-6', // Fehler 1: Richtung
  'dora-de-art-46__psd2-de-art-33', // Fehler 2: kein Leih-Operator
  'dsgvo-art-4__nis2-de-art-35', // Fehler 3: Paar-Artefakt / Nutzung
] as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Markiert die vorhandenen Slot-Werte im Satz farbig (best effort, erste Vorkommen). */
function markSentence(sentence: string, slots: BorrowSlots): string {
  interface Mark {
    start: number;
    end: number;
    cls: string;
  }
  const marks: Mark[] = [];
  const claim = (needle: string | undefined, cls: string): void => {
    if (!needle) return;
    const idx = sentence.indexOf(needle);
    if (idx < 0) return;
    // Überlappungen vermeiden.
    if (marks.some((m) => idx < m.end && idx + needle.length > m.start)) return;
    marks.push({ start: idx, end: idx + needle.length, cls });
  };
  claim(slots.term, 'slot-term');
  claim(slots.operator, 'slot-operator');
  // Artikel-Marke: „Artikel N" / „Article N" / „Art. N".
  if (slots.targetArticle) {
    const artRe = new RegExp(`(?:Artikel[ns]?|Article|Art\\.)\\s*0*${slots.targetArticle}\\b`, 'i');
    const m = artRe.exec(sentence);
    if (m && !marks.some((mk) => m.index < mk.end && m.index + m[0].length > mk.start)) {
      marks.push({ start: m.index, end: m.index + m[0].length, cls: 'slot-article' });
    }
  }
  claim(slots.targetLawHit, 'slot-law');

  marks.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const mk of marks) {
    out += esc(sentence.slice(pos, mk.start));
    out += `<mark class="${mk.cls}">${esc(sentence.slice(mk.start, mk.end))}</mark>`;
    pos = mk.end;
  }
  out += esc(sentence.slice(pos));
  return out;
}

function slotChip(label: string, value: string | undefined, missingReason: string): string {
  if (value) {
    return `<span class="chip chip-ok"><b>${esc(label)}</b> ${esc(value)}</span>`;
  }
  return `<span class="chip chip-missing"><b>${esc(label)}</b> fehlt — ${esc(missingReason)}</span>`;
}

function renderCaseCard(c: AuditCaseResult, isCalibration = false): string {
  const verdictCls = `verdict verdict-${c.autoVerdict}`;
  const dir = c.direction ? ` · Richtung <code>${esc(c.direction)}</code>` : '';
  const twin = c.languageTwinOf
    ? `<span class="twin">Sprachzwilling von <code>${esc(c.languageTwinOf)}</code> (zählt für n einfach)</span>`
    : '';
  const v4 =
    c.v4Label === undefined
      ? 'neu (Pool)'
      : c.v4Label === null
        ? 'none'
        : `<code>${esc(c.v4Label)}</code>`;

  const bucketLabel =
    c.bucket === 'a-interprets'
      ? '(a) v4-INTERPRETS'
      : c.bucket === 'b-none-operator'
        ? '(b) v4-none + Leih-Operator'
        : '(c) Pool-Kandidat';

  const sentenceBlock = c.citingSentence
    ? `<div class="sentence">${markSentence(c.citingSentence, c.slots)}</div>
       <div class="chips">
         ${slotChip('Begriff', c.slots.term, 'kein Definiendum in Operator-Nähe')}
         ${slotChip('Operator', c.slots.operator, 'kein Leih-Operator im Satz')}
         ${slotChip('Ziel-Artikel', c.slots.targetArticle, 'keine dem Ziel-Gesetz zugeordnete Artikelnummer')}
         ${slotChip('Ziel-Gesetz', c.slots.targetLawHit, 'kein Ziel-Gesetz-Identifikator im Satz')}
       </div>`
    : `<div class="sentence sentence-empty">Kein Satz auf einer der beiden Seiten nennt den Paar-Ziel-Artikel des jeweils anderen Gesetzes.</div>`;

  const reasons = c.reasons.map((r) => `<li>${esc(r)}</li>`).join('');

  return `<article class="card${isCalibration ? ' calib' : ''}">
    <header>
      <div class="card-id"><code>${esc(c.caseId)}</code></div>
      <div class="${verdictCls}">${esc(VERDICT_LABEL[c.autoVerdict])}${dir}</div>
    </header>
    <div class="meta">
      <span class="bucket">${esc(bucketLabel)}</span>
      <span>v4: ${v4}</span>
      ${c.citingSide ? `<span>zitierende Seite: <code>${esc(c.citingSide)}</code></span>` : ''}
      ${twin}
    </div>
    <div class="provisions">
      <div><b>a</b> ${esc(c.a.source)} ${esc(c.a.paragraphNumber)}${c.a.title ? ` — ${esc(c.a.title)}` : ''}</div>
      <div><b>b</b> ${esc(c.b.source)} ${esc(c.b.paragraphNumber)}${c.b.title ? ` — ${esc(c.b.title)}` : ''}</div>
    </div>
    ${sentenceBlock}
    <div class="ppath">${esc(c.pPath)}</div>
    <details><summary>Prüfpfad im Klartext</summary><ul>${reasons}</ul></details>
  </article>`;
}

function renderCalibrationCard(c: AuditCaseResult): string {
  const verdictCls = `verdict verdict-${c.autoVerdict}`;
  const dir = c.direction ? ` <code>${esc(c.direction)}</code>` : '';
  const v4 = c.v4Label === null ? 'none' : c.v4Label === undefined ? '—' : `<code>${esc(c.v4Label)}</code>`;
  return `<div class="calib-card">
    <div class="calib-id"><code>${esc(c.caseId)}</code></div>
    <div class="calib-row"><span>v4-Label</span><span>${v4}</span></div>
    <div class="calib-row"><span>Auto-Verdikt</span><span class="${verdictCls}">${esc(VERDICT_LABEL[c.autoVerdict])}${dir}</span></div>
    <div class="calib-row"><span>P-Pfad</span><span class="calib-ppath">${esc(c.pPath)}</span></div>
  </div>`;
}

export function renderAuditHtml(subset: AuditSubset, opts: { generatedAt?: string } = {}): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const byId = new Map(subset.cases.map((c) => [c.caseId, c]));
  const calibrationCards = CALIBRATION_CASE_IDS.map((id) => byId.get(id))
    .filter((c): c is AuditCaseResult => Boolean(c))
    .map(renderCalibrationCard)
    .join('\n');

  const caseCards = subset.cases
    .map((c) => renderCaseCard(c, (CALIBRATION_CASE_IDS as readonly string[]).includes(c.caseId)))
    .join('\n');

  const { a, b, c: cCount, total } = subset.counts;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>INTERPRETS — Audit-Instrument (THE-519)</title>
<style>
  :root {
    --bg: #ffffff; --fg: #0f172a; --muted: #64748b; --border: #e2e8f0;
    --card: #f8fafc; --accent: #7c3aed;
    --ok-bg: #dcfce7; --ok-fg: #166534; --ok-border: #86efac;
    --miss-bg: #fee2e2; --miss-fg: #991b1b; --miss-border: #fca5a5;
    --v-interprets: #16a34a; --v-none: #64748b; --v-pair: #dc2626; --v-policy: #d97706;
    --mark-term: #fde68a; --mark-operator: #bfdbfe; --mark-article: #ddd6fe; --mark-law: #bbf7d0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8; --border: #334155;
      --card: #1e293b; --accent: #a78bfa;
      --ok-bg: #14532d; --ok-fg: #bbf7d0; --ok-border: #166534;
      --miss-bg: #450a0a; --miss-fg: #fecaca; --miss-border: #7f1d1d;
      --mark-term: #78350f; --mark-operator: #1e3a8a; --mark-article: #4c1d95; --mark-law: #14532d;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--fg);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 1080px; margin-inline: auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2.5rem 0 1rem; border-bottom: 2px solid var(--border); padding-bottom: .4rem; }
  .lede { color: var(--muted); margin: 0 0 1.5rem; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .88em;
    background: var(--card); padding: .05em .35em; border-radius: 4px; }
  .counts { display: flex; gap: 1rem; flex-wrap: wrap; margin: 0 0 1rem; }
  .counts .box { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: .6rem 1rem; }
  .counts .box b { font-size: 1.4rem; display: block; color: var(--accent); }
  .calib-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
  .calib-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
  .calib-id { margin-bottom: .6rem; word-break: break-all; }
  .calib-row { display: flex; justify-content: space-between; gap: .5rem; padding: .25rem 0;
    border-top: 1px dashed var(--border); font-size: .9rem; }
  .calib-row > span:first-child { color: var(--muted); }
  .calib-ppath { text-align: right; font-size: .82rem; }
  .rules { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--accent);
    border-radius: 8px; padding: 1rem 1.25rem; }
  .rules h3 { margin: .75rem 0 .25rem; font-size: 1rem; }
  .rules h3:first-child { margin-top: 0; }
  .rules p { margin: .25rem 0; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 1.1rem 1.25rem; margin: 0 0 1rem; }
  .card.calib { border-left: 4px solid var(--accent); }
  .card header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
    flex-wrap: wrap; }
  .card-id { word-break: break-all; }
  .verdict { font-weight: 700; font-size: .9rem; }
  .verdict-interprets { color: var(--v-interprets); }
  .verdict-none-usage { color: var(--v-none); }
  .verdict-pair-artifact { color: var(--v-pair); }
  .verdict-policy-A { color: var(--v-policy); }
  .meta { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--muted); font-size: .85rem;
    margin: .5rem 0 .75rem; }
  .bucket { color: var(--accent); }
  .twin { color: var(--v-policy); }
  .provisions { font-size: .9rem; margin-bottom: .75rem; }
  .provisions > div { margin: .15rem 0; }
  .provisions b { display: inline-block; width: 1.2em; color: var(--muted); }
  .sentence { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: .75rem; margin-bottom: .6rem; overflow-x: auto; }
  .sentence-empty { color: var(--muted); font-style: italic; }
  mark { padding: .05em .2em; border-radius: 3px; color: inherit; }
  mark.slot-term { background: var(--mark-term); }
  mark.slot-operator { background: var(--mark-operator); }
  mark.slot-article { background: var(--mark-article); }
  mark.slot-law { background: var(--mark-law); }
  .chips { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: .6rem; }
  .chip { font-size: .8rem; padding: .25rem .55rem; border-radius: 999px; border: 1px solid; }
  .chip b { font-weight: 700; margin-right: .3em; }
  .chip-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-border); }
  .chip-missing { background: var(--miss-bg); color: var(--miss-fg); border-color: var(--miss-border); }
  .ppath { font-size: .85rem; color: var(--muted); font-family: ui-monospace, Menlo, monospace; }
  details { margin-top: .5rem; font-size: .85rem; }
  summary { cursor: pointer; color: var(--muted); }
  details ul { margin: .5rem 0 0; padding-left: 1.2rem; }
  .legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: .8rem; color: var(--muted); margin: .5rem 0 0; }
  .legend span { display: inline-flex; align-items: center; gap: .3rem; }
  .legend .sw { width: 1rem; height: 1rem; border-radius: 3px; display: inline-block; }
</style>
</head>
<body>
  <h1>INTERPRETS — Audit-Instrument</h1>
  <p class="lede">THE-519 · erzeugt ${esc(generatedAt)} · aus <code>relations.v4.json</code>.
  Das Instrument urteilt nicht — es zeigt für jeden Fall, was im markierten Satz steht, und leitet
  daraus mechanisch ein Verdikt + die berechnete Richtung ab.</p>

  <div class="counts">
    <div class="box"><b>${total}</b> Fälle in der Audit-Teilmenge</div>
    <div class="box"><b>${a}</b> (a) v4-INTERPRETS</div>
    <div class="box"><b>${b}</b> (b) v4-none + Operator</div>
    <div class="box"><b>${cCount}</b> (c) Pool</div>
  </div>

  <div class="legend">
    <span><span class="sw" style="background:var(--mark-term)"></span>Begriff (Definiendum)</span>
    <span><span class="sw" style="background:var(--mark-operator)"></span>Leih-Operator</span>
    <span><span class="sw" style="background:var(--mark-article)"></span>Ziel-Artikel</span>
    <span><span class="sw" style="background:var(--mark-law)"></span>Ziel-Gesetz</span>
  </div>

  <h2>Eich-Karten — wie das Instrument jeden Fehler fängt</h2>
  <p class="lede">Die vier Kalibrier-Fälle nebeneinander: das v4-Label, das Auto-Verdikt des
  Instruments und der Prüfpfad. Drei sind v4-Fehler, einer die korrekte Positiv-Schablone.</p>
  <div class="calib-grid">
    ${calibrationCards}
  </div>

  <h2>Regel-Fragen — zwei offene Entscheidungen (C5b)</h2>
  <div class="rules">
    <h3>Regel A — geprägter Begriff über einen Sach-Artikel (<code>policy-A</code>)</h3>
    <p>Fälle mit Leih-Operator + Definiendum, deren Verweis auf den Paar-Artikel zielt (P0 ✓, P1 ✓),
    der Ziel-Artikel aber KEIN Definitions-Ort ist (P2 ✗). Der markierte Satz borgt einen Begriff,
    aber die zitierte Provision definiert ihn nicht selbst.</p>
    <p><b>Zu entscheiden:</b> zählen diese Fälle als <code>INTERPRETS</code>, als <code>none</code>,
    oder als eigener Sub-Typ? Bis zur Entscheidung trägt das Instrument sie als <code>policy-A</code>.</p>
    <h3>Regel B — Nutzungs-Referenz</h3>
    <p>Fälle, in denen der markierte Satz einen Ziel-Artikel nennt, aber KEINEN Leih-Operator + kein
    Definiendum trägt (P0 ✗). Der Satz benutzt die andere Norm, ohne einen Begriff aus ihr zu borgen.</p>
    <p><b>Zu entscheiden:</b> Nutzungs-Referenz endgültig als <code>none</code> festzurren?</p>
  </div>

  <h2>Alle Fälle der Audit-Teilmenge (${total})</h2>
  ${caseCards}
</body>
</html>
`;
}

// ─── JSON-Sidecar ───────────────────────────────────────────────────

export interface SidecarPerCase {
  autoVerdict: AutoVerdict;
  direction?: Direction;
  bucket: AuditBucket;
  v4Label: string | null | undefined;
  slots: BorrowSlots;
  pPath: string;
  citingSide?: 'a' | 'b';
  languageTwinOf?: string;
}

export interface AuditSidecar {
  generatedFrom: 'relations.v4.json';
  frozenAt: string;
  caseIds: string[];
  counts: AuditSubset['counts'];
  perCase: Record<string, SidecarPerCase>;
}

export function buildSidecar(subset: AuditSubset, opts: { frozenAt?: string } = {}): AuditSidecar {
  const frozenAt = opts.frozenAt ?? new Date().toISOString();
  const caseIds = subset.cases.map((c) => c.caseId); // bereits caseId-sortiert
  const perCase: Record<string, SidecarPerCase> = {};
  for (const c of subset.cases) {
    perCase[c.caseId] = {
      autoVerdict: c.autoVerdict,
      ...(c.direction ? { direction: c.direction } : {}),
      bucket: c.bucket,
      v4Label: c.v4Label,
      slots: c.slots,
      pPath: c.pPath,
      ...(c.citingSide ? { citingSide: c.citingSide } : {}),
      ...(c.languageTwinOf ? { languageTwinOf: c.languageTwinOf } : {}),
    };
  }
  return { generatedFrom: 'relations.v4.json', frozenAt, caseIds, counts: subset.counts, perCase };
}

// ─── CLI ────────────────────────────────────────────────────────────

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
}

const DEFAULT_GOLDEN = path.join(__dirname, '..', 'evals', 'golden', 'relations.v4.json');
const DEFAULT_OUT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'superpowers',
  '2026-07-26-the-519-interprets-audit.html',
);

function main(): void {
  const argv = process.argv.slice(2);
  const goldenPath = path.resolve(argValue(argv, '--golden') ?? DEFAULT_GOLDEN);
  const outPath = path.resolve(argValue(argv, '--out') ?? DEFAULT_OUT);
  const sidecarPath = path.resolve(
    argValue(argv, '--sidecar') ?? outPath.replace(/\.html?$/i, '.sidecar.json'),
  );
  const poolArg = argValue(argv, '--pool');

  const golden = loadRelationsGolden(goldenPath);

  let poolDocs: PoolDoc[] | undefined;
  if (poolArg) {
    const poolPath = path.resolve(poolArg);
    const raw = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`--pool: ${poolPath} enthält kein Array`);
    poolDocs = raw as PoolDoc[];
    console.log(`[audit-interprets] Pool: ${poolDocs.length} Docs aus ${poolPath}`);
  } else {
    console.log('[audit-interprets] kein --pool — (c) bleibt leer (v4-only-Lauf)');
  }

  const subset = collectAuditSubset(golden.cases, poolDocs);
  const html = renderAuditHtml(subset);
  const sidecar = buildSidecar(subset);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');

  const { a, b, c, total } = subset.counts;
  console.log(
    `[audit-interprets] Audit-Teilmenge: ${total} Fälle (a=${a} INTERPRETS, b=${b} none+Operator, c=${c} Pool)`,
  );
  console.log('[audit-interprets] Kalibrier-Fälle:');
  const byId = new Map(subset.cases.map((x) => [x.caseId, x]));
  for (const id of CALIBRATION_CASE_IDS) {
    const cse = byId.get(id);
    console.log(
      `  ${id}: ${cse ? cse.autoVerdict + (cse.direction ? ` (${cse.direction})` : '') : 'NICHT in Teilmenge'}`,
    );
  }
  console.log(`[audit-interprets] → HTML     ${outPath}`);
  console.log(`[audit-interprets] → Sidecar  ${sidecarPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[audit-interprets] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
