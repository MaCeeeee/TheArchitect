/**
 * enumerateRelationCandidates — reine, deterministische Kandidaten-Aufzählung
 * für den Relations-Batch (THE-433, Slice 1, Task 2).
 *
 * Bekommt Korpus-Dokumente als Plain Objects (kein Mongo, kein Netz, kein LLM
 * — dasselbe Reinheits-Muster wie typingBatch.ts) und zählt auf, welche Paare
 * überhaupt KI-Vorschlags-Kandidaten sind. Die Verweis-Muster kommen aus
 * @thearchitect/shared (lawPatterns) — dieselbe Logik, die auch der
 * Eval-Harness auf dem Server ausführt (eine Wahrheit statt zwei).
 *
 * Regeln (aus der Task-Spec, Begründungen in lawPatterns.ts):
 *  - Gescannt wird nur gegen Familien ANDERER Gesetze: Sprachzwillinge
 *    derselben Familie (dsgvo vs dsgvo-en) sind Übersetzungen, keine
 *    Cross-Norm-Beziehung — sie werden gar nicht erst gescannt.
 *  - Nur Treffer MIT Artikel-Pinpoint werden Kandidaten. Eine law-level-
 *    Erwähnung („… gilt unbeschadet der Verordnung (EU) 2016/679") ist nach
 *    RUBRIC.md RULE 1 keine Beziehung — sie wird gezählt
 *    (stats.lawLevelRejected), nie zum Kandidaten befördert.
 *  - Ziel-Auflösung sprachrein bevorzugt: hat die Ziel-Familie mehrere
 *    Sprachvarianten im Korpus, gewinnt die Variante mit der Sprache des
 *    zitierenden Dokuments (cross-linguale Paare nur als Fallback).
 *  - Nicht auflösbare Ziele (Artikel nicht im Korpus) landen LAUT in
 *    `unresolvedTargets` — nie still verworfen (dieselbe Anti-Silent-Drop-
 *    Haltung wie der Anchor-Throw in relationsCandidates.ts und die
 *    Coverage-Lektion aus feedback_crawl_whole_laws).
 *  - Deterministisch: Ausgaben sind stabil sortiert (citing→target-Key),
 *    unabhängig von der Input-Reihenfolge; ein Paar (citing, target) erscheint
 *    genau einmal (erste Evidence in stabiler Reihenfolge gewinnt).
 *
 * Linear: THE-433 · Muster: @thearchitect/shared relations/lawPatterns.ts
 */
import {
  LAW_FAMILY_PATTERNS,
  SOURCE_TO_FAMILY,
  hasReferencePatterns,
  referencesLaw,
  normalizeArticleNumber,
} from '@thearchitect/shared';

/** Der Dokument-Ausschnitt, den die Aufzählung braucht — bewusst ohne Mongo-Typen. */
export interface RelationCandidateDoc {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
  versionHash: string;
}

export interface RelationCandidateEvidence {
  /** Der konkret gefundene Textausschnitt des Verweises. */
  matched: string;
  /** Normalisierte Artikel-Pinpoints aus dem Verweis. */
  articleHints: string[];
}

export interface RelationCandidate {
  /** a-Seite der späteren Suggestion: das zitierende Dokument (Träger). */
  citing: RelationCandidateDoc;
  /** b-Seite: die konkret benannte Ziel-Provision. */
  target: RelationCandidateDoc;
  evidence: RelationCandidateEvidence;
}

export interface UnresolvedTarget {
  citingKey: string;
  /** Repräsentative Quelle der Ziel-Familie (sprachrein bevorzugt). */
  targetSource: string;
  articleHint: string;
}

export interface RelationEnumerationStats {
  docsScanned: number;
  candidates: number;
  /** Gesetzes-Erwähnungen OHNE Artikel-Pinpoint — gezählt, nie Kandidat (RULE 1). */
  lawLevelRejected: number;
  unresolvedTargets: number;
  /** Quellen im Input ohne SOURCE_TO_FAMILY-Eintrag — laut ausgewiesen, sonst stiller Blindfleck. */
  sourcesWithoutPatterns: string[];
  /**
   * Review-Finding 1 (THE-433): Familie → Treffer-Zahl für Familien, die in
   * der Registry Muster HABEN, aber mit 0 Dokumenten im Input vertreten sind.
   * Ohne diesen Zähler verschwände ein Verweis auf eine abwesende Familie
   * komplett — genau die Sorte stiller Coverage-Lücke, die der
   * DSGVO-Blindfleck 2026-07-19 belegt hat. Nur Familien mit >0 Treffern
   * erscheinen; deren Pinpoints stehen zusätzlich in `unresolvedTargets`.
   */
  familiesWithoutDocs: Record<string, number>;
}

export interface RelationEnumerationResult {
  candidates: RelationCandidate[];
  unresolvedTargets: UnresolvedTarget[];
  stats: RelationEnumerationStats;
}

type Family = keyof typeof LAW_FAMILY_PATTERNS;

export function enumerateRelationCandidates(docs: RelationCandidateDoc[]): RelationEnumerationResult {
  // Stabile Arbeitsreihenfolge unabhängig vom Input: alles Weitere iteriert
  // über diese Sortierung, damit „erste Evidence gewinnt" deterministisch ist.
  const sortedDocs = [...docs].sort((a, b) => a.regulationKey.localeCompare(b.regulationKey));

  // Familie → Quellen (sortiert) und Familie → Artikelnummer → Dokumente.
  const familySources = new Map<Family, string[]>();
  const familyProvisions = new Map<Family, Map<string, RelationCandidateDoc[]>>();
  const sourcesWithoutPatterns = new Set<string>();

  for (const d of sortedDocs) {
    if (!hasReferencePatterns(d.source)) {
      sourcesWithoutPatterns.add(d.source);
      continue; // ohne Familie kein Ziel-Index — als Zitierender wird es unten trotzdem gescannt
    }
    const family = SOURCE_TO_FAMILY[d.source];
    if (!familySources.has(family)) familySources.set(family, []);
    const sources = familySources.get(family)!;
    if (!sources.includes(d.source)) sources.push(d.source);

    const article = normalizeArticleNumber(d.paragraphNumber);
    if (article === undefined) continue; // „Anhang III" etc. — konservativ kein Pinpoint-Ziel
    if (!familyProvisions.has(family)) familyProvisions.set(family, new Map());
    const byArticle = familyProvisions.get(family)!;
    if (!byArticle.has(article)) byArticle.set(article, []);
    byArticle.get(article)!.push(d); // sortedDocs-Reihenfolge → Listen sind key-sortiert
  }

  for (const sources of familySources.values()) sources.sort();

  // Review-Finding 1 (THE-433): Gescannt wird gegen ALLE Familien der Registry,
  // nicht nur gegen die im Input vertretenen. Sonst wäre ein Verweis auf eine
  // Familie ohne Input-Dokumente ein stiller Totalausfall — kein Kandidat, kein
  // unresolvedTarget, keine Statistik. Für Familien ohne Dokumente liefert die
  // Registry die repräsentative Quelle (sortiert erste).
  const registrySourcesByFamily = new Map<Family, string[]>();
  for (const [source, family] of Object.entries(SOURCE_TO_FAMILY)) {
    if (!registrySourcesByFamily.has(family)) registrySourcesByFamily.set(family, []);
    registrySourcesByFamily.get(family)!.push(source);
  }
  for (const sources of registrySourcesByFamily.values()) sources.sort();
  const targetFamilies = [...registrySourcesByFamily.keys()].sort();

  const candidateByPair = new Map<string, RelationCandidate>();
  const unresolvedByKey = new Map<string, UnresolvedTarget>();
  let lawLevelRejected = 0;
  const familiesWithoutDocs: Record<string, number> = {};

  /** Sprachrein bevorzugt, sonst stabil erste — für Ziel-Docs UND Report-Quellen. */
  const preferLanguage = <T>(items: T[], langOf: (t: T) => string | undefined, wanted: string): T => {
    const sameLang = items.filter((t) => langOf(t) === wanted);
    return (sameLang.length > 0 ? sameLang : items)[0];
  };

  for (const citing of sortedDocs) {
    const citingFamily: Family | undefined = SOURCE_TO_FAMILY[citing.source];

    for (const family of targetFamilies) {
      // Sprachzwillinge derselben Familie ausschließen — gar nicht erst scannen.
      if (family === citingFamily) continue;

      const sources = familySources.get(family);
      // Muster hängen an der FAMILIE — jede Quelle der Familie liefert
      // identische Treffer; eine repräsentative Quelle genügt (bei Familien
      // ohne Input-Dokumente die aus der Registry).
      const scanSource = (sources ?? registrySourcesByFamily.get(family)!)[0];
      const matches = referencesLaw(citing.fullText, scanSource);
      if (matches.length === 0) continue;

      if (!sources) {
        // Familie hat Muster, aber KEIN Dokument im Input: Treffer laut
        // ausweisen statt still verwerfen — Zähler pro Familie, und jeder
        // Pinpoint zusätzlich als nicht auflösbares Ziel (Report-Quelle aus
        // der Registry, ohne Dokumente gibt es keine Sprachpräferenz).
        familiesWithoutDocs[family] = (familiesWithoutDocs[family] ?? 0) + matches.length;
        const reportSource = registrySourcesByFamily.get(family)![0];
        for (const match of matches) {
          for (const hint of match.articleHints) {
            const key = `${citing.regulationKey}|${reportSource}|${hint}`;
            if (!unresolvedByKey.has(key)) {
              unresolvedByKey.set(key, { citingKey: citing.regulationKey, targetSource: reportSource, articleHint: hint });
            }
          }
        }
        continue;
      }

      // Für unresolved-Meldungen: sprachrein bevorzugte Report-Quelle der Familie.
      const reportSource = preferLanguage(
        sources,
        (s) => sortedDocs.find((d) => d.source === s)?.language,
        citing.language,
      );

      for (const match of matches) {
        if (match.articleHints.length === 0) {
          // Nennt das Gesetz, aber keine Provision: law-level → kein Kandidat.
          lawLevelRejected++;
          continue;
        }
        for (const hint of match.articleHints) {
          const provisions = familyProvisions.get(family)?.get(hint);
          if (!provisions || provisions.length === 0) {
            const key = `${citing.regulationKey}|${reportSource}|${hint}`;
            if (!unresolvedByKey.has(key)) {
              unresolvedByKey.set(key, { citingKey: citing.regulationKey, targetSource: reportSource, articleHint: hint });
            }
            continue;
          }
          const target = preferLanguage(provisions, (d) => d.language, citing.language);
          const pairKey = `${citing.regulationKey}|${target.regulationKey}`;
          if (candidateByPair.has(pairKey)) continue; // duplikatfrei — erste Evidence gewinnt
          candidateByPair.set(pairKey, {
            citing,
            target,
            evidence: { matched: match.matched, articleHints: [...match.articleHints] },
          });
        }
      }
    }
  }

  const candidates = [...candidateByPair.values()].sort((x, y) => {
    const cmp = x.citing.regulationKey.localeCompare(y.citing.regulationKey);
    return cmp !== 0 ? cmp : x.target.regulationKey.localeCompare(y.target.regulationKey);
  });
  const unresolvedTargets = [...unresolvedByKey.values()].sort((x, y) => {
    return (
      x.citingKey.localeCompare(y.citingKey) ||
      x.targetSource.localeCompare(y.targetSource) ||
      x.articleHint.localeCompare(y.articleHint)
    );
  });

  return {
    candidates,
    unresolvedTargets,
    stats: {
      docsScanned: docs.length,
      candidates: candidates.length,
      lawLevelRejected,
      unresolvedTargets: unresolvedTargets.length,
      sourcesWithoutPatterns: [...sourcesWithoutPatterns].sort(),
      familiesWithoutDocs,
    },
  };
}
