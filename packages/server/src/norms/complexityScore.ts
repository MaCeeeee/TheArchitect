/**
 * Norm-Complexity-Score (C_score) — reine, deterministische Metrik über den
 * @eId-Norm-Baum eines Gesetzes/Standards. KEIN LLM, KEIN I/O, KEIN Python.
 *
 * Adaption von OntoLearner (arXiv:2607.01977, §3.4). Kern-Befund des Papers:
 * Fehlermodi (FP/FN-Bias, Halluzinationen) skalieren mit *struktureller*
 * Komplexität der Ontologie, nicht mit Modellgröße. Der Score ist rein
 * intrinsisch (log(1+x) ist punktweise, kollektions-unabhängig) und damit
 * reproduzierbar — geeignet als Steuergröße für (a) Eval-Stratifizierung
 * (THE-430), (b) Confidence-Schwellen (THE-432), (c) Review-Priorisierung.
 *
 * Datengrundlage: `NormSectionView[]` (norm.service-Facade), Baum via `parentEId`.
 *
 * ⚠ DEGENERIERTE ACHSE bis THE-415: In P1 werden Korpus-Quellen als EINE Ebene
 * projiziert (norm.types.ts §NormSectionView) — die Hierarchie-Tiefe ist dann
 * ≈1 für alle Korpus-Normen. Die Formel bleibt korrekt (Tiefe trägt via
 * `weights.hierarchy` bei, ist nur konstant); sobald THE-415 den echten Baum
 * ingestet, aktiviert sich die Tiefen-Achse OHNE Code-Änderung. Upload-Normen
 * mit `sections`-Struktur nutzen die Achse bereits.
 *
 * Linear: THE-431 (REQ-ONTO-001.1) · Parent THE-421 (UC-ONTO-001)
 */

/** Minimal-Sicht auf eine Norm-Section — kompatibel zu `NormSectionView`. */
export interface NormTreeNode {
  eId: string;
  parentEId?: string;
  level?: number;
  text?: string;
  heading?: string;
}

// ─── Benannte Konfiguration (AC-2) ──────────────────────────────
//
// Gewichte + Sigmoid-Konstanten sind die einzigen "magischen Zahlen" des
// Scores und leben deshalb hier zentral, dokumentiert und typisiert. Der Score
// ist rangstabil unter Gewichts-Perturbation (Paper: Spearman ρ≥0,999) — kleine
// Anpassungen ändern die Reihung praktisch nicht.

export const C_SCORE_CONFIG = {
  /** Familien-Gewichte (Σ = 1.0). Aus dem Paper-Setup übernommen. */
  weights: {
    graph: 0.30, // strukturelle Größe (Knoten/Kanten/Roots/Leaves)
    coverage: 0.25, // Provisions-Menge + Text-/Typ-Abdeckung
    hierarchy: 0.1, // Tiefe (bis THE-415 degeneriert für Korpus)
    breadth: 0.2, // Verzweigungsgrad
    dataset: 0.15, // Terme + Relationen-Dichte
  },
  /** Sigmoid: 1 / (1 + exp(-a·(z − b))). Zentriert das gewichtete log-Maß auf [0,1]. */
  sigmoid: { a: 0.4, b: 6.0 },
} as const;

export type ComplexityFamily = keyof typeof C_SCORE_CONFIG.weights;

// ─── Interpretations-Bänder (AC-2, Paper Tabelle 3a) ────────────
//
// 5 Stufen über den Sigmoid-Output [0,1]. Die `guidance` sagt dem Consumer,
// wie konservativ Auto-Schwellen zu wählen sind (THE-432): je komplexer die
// Norm, desto höher die Konfidenz-Anforderung für Auto-Akzeptanz.

export type ComplexityBand = 'trivial' | 'low' | 'moderate' | 'high' | 'very-high';

export interface BandDefinition {
  band: ComplexityBand;
  /** untere Grenze (inklusiv); obere = nächste Band-Grenze bzw. 1.0 für very-high. */
  min: number;
  guidance: string;
}

export const C_SCORE_BANDS: readonly BandDefinition[] = [
  { band: 'trivial', min: 0.0, guidance: 'flache/kleine Norm — Auto-Schwellen wie Default zulässig' },
  { band: 'low', min: 0.2, guidance: 'geringe Struktur — Default-Schwellen ausreichend' },
  { band: 'moderate', min: 0.4, guidance: 'mittlere Struktur — Eval-Breakdown beobachten' },
  { band: 'high', min: 0.6, guidance: 'hohe Struktur — konservativere Auto-Schwelle, mehr Review' },
  { band: 'very-high', min: 0.8, guidance: 'sehr komplex — Halluzinations-Zone, Auto-Akzeptanz nur bei Top-Konfidenz' },
] as const;

export function bandForScore(score: number): ComplexityBand {
  let current: ComplexityBand = C_SCORE_BANDS[0].band;
  for (const b of C_SCORE_BANDS) {
    if (score >= b.min) current = b.band;
  }
  return current;
}

// ─── AC-4: Confidence-Schwelle pro Band (Default = keine Regression) ──
//
// Der Mapping-Service (complianceMapping.service) nutzt heute EINE globale
// Schwelle (COMPLIANCE_CONFIDENCE_THRESHOLD, Default 0.5). Dieser Layer erlaubt
// eine STRENGERE Auto-Akzeptanz-Schwelle für komplexe Normen (Paper: dort
// konzentrieren sich Halluzinationen), OHNE das heutige Verhalten zu ändern:
// die Default-Overrides sind LEER → für jedes Band gilt die globale Schwelle.
// Erst ein explizit gesetztes Band-Override weicht davon ab.

export type BandThresholdOverrides = Partial<Record<ComplexityBand, number>>;

export function confidenceThresholdForBand(
  band: ComplexityBand,
  globalThreshold: number,
  overrides: BandThresholdOverrides = {},
): number {
  const o = overrides[band];
  return o === undefined ? globalThreshold : o;
}

// ─── Roh-Metrik-Familien ────────────────────────────────────────

export interface FamilyMetrics {
  graph: { nodes: number; edges: number; roots: number; leaves: number };
  coverage: { provisions: number; withText: number; textCoverage: number; distinctHeadings: number };
  hierarchy: { maxDepth: number; avgDepth: number; minLeafDepth: number };
  breadth: { maxChildren: number; avgChildren: number; internalNodes: number };
  dataset: { terms: number; taxonomicRelations: number; termsPerRoot: number };
}

interface TreeIndex {
  ids: Set<string>;
  childrenOf: Map<string, string[]>;
  parentOf: Map<string, string | undefined>;
  roots: string[];
}

/** Baut Kinder-/Eltern-Index. Ein parentEId, der auf keine bekannte eId zeigt,
 *  wird als Wurzel behandelt (defensiv gegen unvollständige Projektionen). */
function indexTree(nodes: NormTreeNode[]): TreeIndex {
  const ids = new Set(nodes.map(n => n.eId));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string | undefined>();
  const roots: string[] = [];
  for (const n of nodes) {
    const hasParent = n.parentEId != null && n.parentEId !== n.eId && ids.has(n.parentEId);
    const parent = hasParent ? n.parentEId : undefined;
    parentOf.set(n.eId, parent);
    if (parent === undefined) {
      roots.push(n.eId);
    } else {
      const list = childrenOf.get(parent) ?? [];
      list.push(n.eId);
      childrenOf.set(parent, list);
    }
  }
  return { ids, childrenOf, parentOf, roots };
}

/** Tiefe je Knoten (Wurzel = 0), iterativ mit Zyklus-Schutz. */
function depths(idx: TreeIndex): Map<string, number> {
  const depth = new Map<string, number>();
  for (const root of idx.roots) {
    // BFS von jeder Wurzel; besuchte Knoten werden nicht erneut vertieft (Zyklus-/DAG-Schutz).
    const queue: Array<{ id: string; d: number }> = [{ id: root, d: 0 }];
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (depth.has(id)) continue;
      depth.set(id, d);
      for (const child of idx.childrenOf.get(id) ?? []) {
        if (!depth.has(child)) queue.push({ id: child, d: d + 1 });
      }
    }
  }
  // Knoten in Zyklen ohne Wurzel-Pfad bekommen Tiefe 0 (konservativ).
  for (const id of idx.ids) if (!depth.has(id)) depth.set(id, 0);
  return depth;
}

export function computeFamilyMetrics(nodes: NormTreeNode[]): FamilyMetrics {
  const idx = indexTree(nodes);
  const n = nodes.length;

  // Graph
  const edges = [...idx.parentOf.values()].filter(p => p !== undefined).length;
  const leaves = [...idx.ids].filter(id => (idx.childrenOf.get(id)?.length ?? 0) === 0).length;

  // Coverage
  const withText = nodes.filter(x => (x.text ?? '').trim().length > 0).length;
  const distinctHeadings = new Set(nodes.map(x => (x.heading ?? '').trim().toLowerCase()).filter(Boolean)).size;

  // Hierarchy
  const depthMap = depths(idx);
  const depthVals = [...depthMap.values()];
  const maxDepth = depthVals.length ? Math.max(...depthVals) : 0;
  const avgDepth = depthVals.length ? depthVals.reduce((a, b) => a + b, 0) / depthVals.length : 0;
  const leafDepths = [...idx.ids]
    .filter(id => (idx.childrenOf.get(id)?.length ?? 0) === 0)
    .map(id => depthMap.get(id) ?? 0);
  const minLeafDepth = leafDepths.length ? Math.min(...leafDepths) : 0;

  // Breadth
  const childCounts = [...idx.childrenOf.values()].map(c => c.length);
  const internalNodes = childCounts.length;
  const maxChildren = childCounts.length ? Math.max(...childCounts) : 0;
  const avgChildren = internalNodes ? childCounts.reduce((a, b) => a + b, 0) / internalNodes : 0;

  return {
    graph: { nodes: n, edges, roots: idx.roots.length, leaves },
    coverage: { provisions: n, withText, textCoverage: n ? withText / n : 0, distinctHeadings },
    hierarchy: { maxDepth, avgDepth, minLeafDepth },
    breadth: { maxChildren, avgChildren, internalNodes },
    // taxonomicRelations = Baumkanten; non-taxonomic (E7) sind cross-norm und
    // NICHT Teil des intrinsischen Baums → hier bewusst ausgelassen (THE-433).
    dataset: {
      terms: distinctHeadings,
      taxonomicRelations: edges,
      termsPerRoot: idx.roots.length ? distinctHeadings / idx.roots.length : distinctHeadings,
    },
  };
}

// ─── Aggregation → Score ────────────────────────────────────────

const log1p = (x: number): number => Math.log(1 + Math.max(0, x));

/** Ein log-normalisierter Repräsentant je Familie (Summe der Kern-Metriken). */
function familyScalars(m: FamilyMetrics): Record<ComplexityFamily, number> {
  return {
    graph: log1p(m.graph.nodes) + log1p(m.graph.edges) + log1p(m.graph.roots) + log1p(m.graph.leaves),
    coverage: log1p(m.coverage.provisions) + log1p(m.coverage.distinctHeadings) + m.coverage.textCoverage,
    hierarchy: log1p(m.hierarchy.maxDepth) + log1p(m.hierarchy.avgDepth),
    breadth: log1p(m.breadth.maxChildren) + log1p(m.breadth.avgChildren) + log1p(m.breadth.internalNodes),
    dataset: log1p(m.dataset.terms) + log1p(m.dataset.taxonomicRelations) + log1p(m.dataset.termsPerRoot),
  };
}

function sigmoid(z: number): number {
  const { a, b } = C_SCORE_CONFIG.sigmoid;
  return 1 / (1 + Math.exp(-a * (z - b)));
}

export interface NormComplexity {
  /** Score ∈ [0,1] (Sigmoid-Output). */
  score: number;
  band: ComplexityBand;
  /** Gewichtete log-Aggregation VOR der Sigmoid (nachvollziehbar/debuggbar). */
  aggregate: number;
  familyScalars: Record<ComplexityFamily, number>;
  metrics: FamilyMetrics;
}

/** Berechnet den C_score über einen Norm-Baum. Rein & deterministisch (AC-1/AC-5). */
export function computeComplexityScore(nodes: NormTreeNode[]): NormComplexity {
  const metrics = computeFamilyMetrics(nodes);
  const scalars = familyScalars(metrics);
  const w = C_SCORE_CONFIG.weights;
  const aggregate =
    scalars.graph * w.graph +
    scalars.coverage * w.coverage +
    scalars.hierarchy * w.hierarchy +
    scalars.breadth * w.breadth +
    scalars.dataset * w.dataset;
  const score = sigmoid(aggregate);
  return { score, band: bandForScore(score), aggregate, familyScalars: scalars, metrics };
}
