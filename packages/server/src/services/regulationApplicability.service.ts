/**
 * UC-LAW-001 — Regulatory Applicability Radar.
 *
 * „Welche Gesetze gelten für diese Architektur?" — beantwortet deterministisch
 * aus den Architektur-Elementen (insb. den vom AI Wizard/Blueprint generierten:
 * `source='blueprint'`) und dem Projekt-Kontext (Name, Beschreibung, Vision,
 * Tags, Stakeholder). Kein LLM im Pfad — reproduzierbar, erklärbar, läuft ohne
 * API-Keys. Regeln + Signale sind DATA (data/applicability-rules.ts, THE-413-Geist).
 *
 * Aufbau:
 *  1. loadProjectFacts     — Neo4j-Elemente + Mongo-Projekt → ProjectFacts
 *  2. evaluateSignals      — PURE: Facts → Signal-Ergebnisse mit Evidenz
 *  3. assessRules          — PURE: Signale → Gesetzes-Einschätzungen (noisy-OR)
 *  4. buildApplicabilityReport — orchestriert + reichert mit Norm-/Pipeline-
 *     Zustand an (referenced / inPipeline / availableInCorpus / workId), damit
 *     die UI direkt „Add to pipeline" (THE-390 P4b) anbieten kann.
 */
import mongoose from 'mongoose';
import {
  deriveNormWorkId,
  verdictFromScore,
  type ApplicabilityEvidence,
  type ApplicabilityReport,
  type ApplicabilitySignalResult,
  type NormApplicabilityAssessment,
} from '@thearchitect/shared';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { Project } from '../models/Project';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import { listNorms, listAvailableCorpusNorms } from './norm.service';
import {
  APPLICABILITY_DISCLAIMER,
  APPLICABILITY_RULES,
  ASSUMED_JURISDICTIONS,
  MAX_EVIDENCE_PER_SIGNAL,
  SIGNAL_DEFS,
  type ApplicabilityRule,
  type SignalDef,
} from '../data/applicability-rules';

// ─── Fakten-Modell (Input der puren Auswertung) ──────────────────────

export interface ElementFact {
  id: string;
  name: string;
  type: string;
  description: string;
  /** metadata.sensitivity (X-Ray-Buckets: public|internal|confidential|PII). */
  sensitivity?: string;
  /** True bei `source='blueprint'` — vom AI Wizard generiert. */
  fromWizard: boolean;
}

export interface ProjectField {
  /** Feld-Label für die Evidenz-Anzeige (z. B. 'vision', 'tags'). */
  name: string;
  value: string;
}

export interface ProjectFacts {
  projectId: string;
  elements: ElementFact[];
  projectFields: ProjectField[];
}

// ─── 1. Fakten laden ─────────────────────────────────────────────────

export async function loadProjectFacts(projectId: string): Promise<ProjectFacts> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type,
            e.description as description, e.metadataJson as metadataJson,
            e.source as source
     ORDER BY e.layer, e.name`,
    { projectId },
  );

  const elements: ElementFact[] = [];
  for (const r of records) {
    const props = serializeNeo4jProperties(r.toObject());
    const id = props.id != null ? String(props.id) : '';
    const name = props.name != null ? String(props.name) : '';
    if (!id || !name) continue;
    let sensitivity: string | undefined;
    try {
      if (props.metadataJson) {
        const meta = JSON.parse(String(props.metadataJson)) as Record<string, unknown>;
        if (typeof meta.sensitivity === 'string') sensitivity = meta.sensitivity;
      }
    } catch {
      /* metadataJson kaputt → ohne Sensitivity weiter */
    }
    elements.push({
      id,
      name,
      type: props.type != null ? String(props.type) : 'custom',
      description: props.description != null ? String(props.description) : '',
      sensitivity,
      fromWizard: props.source === 'blueprint',
    });
  }

  const projectFields: ProjectField[] = [];
  // Projekt-Kontext ist optional — ohne Mongo-Doc (oder invalide Id) werten wir
  // nur die Elemente aus, statt zu scheitern.
  if (mongoose.isValidObjectId(projectId)) {
    const project = await Project.findById(projectId)
      .select('name description vision tags stakeholders')
      .lean();
    if (project) {
      if (project.name) projectFields.push({ name: 'project name', value: String(project.name) });
      if (project.description) projectFields.push({ name: 'description', value: String(project.description) });
      const v = project.vision as { scope?: string; visionStatement?: string; principles?: string[]; drivers?: string[]; goals?: string[] } | undefined;
      if (v) {
        const visionText = [v.scope, v.visionStatement, ...(v.principles ?? []), ...(v.drivers ?? []), ...(v.goals ?? [])]
          .filter(Boolean)
          .join(' · ');
        if (visionText) projectFields.push({ name: 'vision', value: visionText });
      }
      if (Array.isArray(project.tags) && project.tags.length > 0) {
        projectFields.push({ name: 'tags', value: project.tags.join(' · ') });
      }
      const stakeholders = (project.stakeholders ?? []) as Array<{ name?: string; role?: string }>;
      if (stakeholders.length > 0) {
        projectFields.push({
          name: 'stakeholders',
          value: stakeholders.map(s => [s.name, s.role].filter(Boolean).join(' — ')).join(' · '),
        });
      }
    }
  }

  return { projectId, elements, projectFields };
}

// ─── 2. Signale auswerten (PURE) ─────────────────────────────────────

/** Erster Pattern-Treffer in `text` → gematchter Ausschnitt (für die Evidenz). */
function firstMatch(patterns: readonly RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

function evaluateSignal(def: SignalDef, facts: ProjectFacts): ApplicabilitySignalResult {
  const evidence: ApplicabilityEvidence[] = [];
  const seenElements = new Set<string>();

  const pushElement = (el: ElementFact, detail: string) => {
    if (seenElements.has(el.id)) return;
    seenElements.add(el.id);
    evidence.push({
      kind: 'element',
      elementId: el.id,
      name: el.name,
      detail,
      ...(el.fromWizard ? { fromWizard: true } : {}),
    });
  };

  const typeSet = def.elementTypes ? new Set<string>(def.elementTypes) : null;
  const patternTypeSet = def.elementPatternTypes ? new Set<string>(def.elementPatternTypes) : null;
  const sensitivitySet = def.sensitivities ? new Set<string>(def.sensitivities) : null;

  // Pattern-/Sensitivity-Treffer zählen IMMER; reine Typ-Treffer erst ab
  // `minTypeMatches` (z. B. „substantial technology estate" ≥ 3 Elemente).
  const typeOnlyMatches: ElementFact[] = [];
  for (const el of facts.elements) {
    if (sensitivitySet && el.sensitivity && sensitivitySet.has(el.sensitivity)) {
      pushElement(el, `sensitivity: ${el.sensitivity}`);
      continue;
    }
    if (def.elementPatterns && (!patternTypeSet || patternTypeSet.has(el.type))) {
      const matched = firstMatch(def.elementPatterns, `${el.name} ${el.description}`);
      if (matched) {
        pushElement(el, `matched "${matched.trim()}"`);
        continue;
      }
    }
    if (typeSet?.has(el.type)) typeOnlyMatches.push(el);
  }
  if (typeOnlyMatches.length >= (def.minTypeMatches ?? 1)) {
    for (const el of typeOnlyMatches) pushElement(el, `element type: ${el.type}`);
  }

  if (def.projectPatterns) {
    for (const field of facts.projectFields) {
      const matched = firstMatch(def.projectPatterns, field.value);
      if (matched) {
        evidence.push({ kind: 'project', name: field.name, detail: `matched "${matched.trim()}"` });
      }
    }
  }

  return {
    id: def.id,
    label: def.label,
    description: def.description,
    detected: evidence.length > 0,
    matchCount: evidence.length,
    evidence: evidence.slice(0, MAX_EVIDENCE_PER_SIGNAL),
  };
}

/**
 * Alle Signale auswerten. Zweiter Pass löst `requiresSignals` auf: ein Gate-
 * Signal (z. B. high-risk-ai-context) bleibt `detected=false`, wenn die
 * Voraussetzung fehlt — die gefundene Evidenz bleibt aber sichtbar (Transparenz:
 * „Kontext gefunden, aber keine AI-Komponenten").
 */
export function evaluateSignals(facts: ProjectFacts): ApplicabilitySignalResult[] {
  const results = SIGNAL_DEFS.map(def => evaluateSignal(def, facts));
  const byId = new Map(results.map(r => [r.id, r]));
  for (const def of SIGNAL_DEFS) {
    if (!def.requiresSignals?.length) continue;
    const self = byId.get(def.id);
    if (!self?.detected) continue;
    const gateOpen = def.requiresSignals.every(id => byId.get(id)?.detected);
    if (!gateOpen) self.detected = false;
  }
  return results;
}

// ─── 3. Regeln bewerten (PURE) ───────────────────────────────────────

/** noisy-OR: unabhängige Evidenz verstärkt sich, überstimmt aber nie. */
export function combineWeights(weights: number[]): number {
  const miss = weights.reduce((acc, w) => acc * (1 - Math.min(Math.max(w, 0), 1)), 1);
  return Math.round((1 - miss) * 100) / 100;
}

export interface RuleAssessment
  extends Pick<
    NormApplicabilityAssessment,
    'ruleId' | 'label' | 'corpusSourceIds' | 'jurisdiction' | 'kind' | 'bindingness' | 'verdict' | 'score' | 'contributions' | 'rationale' | 'baselineNote'
  > {}

export function assessRules(signals: ApplicabilitySignalResult[]): RuleAssessment[] {
  const detected = new Map(signals.filter(s => s.detected).map(s => [s.id, s]));

  const assessments = APPLICABILITY_RULES.map((rule: ApplicabilityRule): RuleAssessment => {
    const hits = rule.contributions.filter(c => detected.has(c.signalId));
    const score = combineWeights(hits.map(c => c.weight));
    const contributions = hits.map(c => ({
      signalId: c.signalId,
      signalLabel: detected.get(c.signalId)?.label ?? c.signalId,
      weight: c.weight,
      rationale: c.rationale,
    }));
    const rationale =
      contributions.length > 0
        ? contributions.map(c => c.rationale).join(' ')
        : 'No indicators for this norm were found in the current architecture model.';
    return {
      ruleId: rule.ruleId,
      label: rule.label,
      corpusSourceIds: [...rule.corpusSourceIds],
      jurisdiction: rule.jurisdiction,
      kind: rule.kind,
      bindingness: rule.bindingness,
      score,
      verdict: verdictFromScore(score),
      contributions,
      rationale,
      baselineNote: rule.baselineNote,
    };
  });

  // Score absteigend; bei Gleichstand bindende Gesetze vor freiwilligen Standards.
  return assessments.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.bindingness === 'binding' && b.bindingness !== 'binding') return -1;
    if (b.bindingness === 'binding' && a.bindingness !== 'binding') return 1;
    return a.label.localeCompare(b.label);
  });
}

// ─── 4. Report bauen (Orchestrierung + Norm-Zustand) ─────────────────

interface NormWorldState {
  referencedCorpusSources: Set<string>;
  availableCorpusSources: Set<string>;
  pipelineNormIds: Set<string>;
  uploadTitles: string[];
}

async function loadNormWorldState(projectId: string): Promise<NormWorldState> {
  const [norms, available] = await Promise.all([
    listNorms(projectId).catch(() => []),
    listAvailableCorpusNorms(projectId).catch(() => []),
  ]);

  const referencedCorpusSources = new Set<string>();
  const uploadTitles: string[] = [];
  for (const n of norms) {
    if (n.source === 'corpus') {
      referencedCorpusSources.add(n.identity.workId.replace(/^corpus:/, ''));
    } else {
      uploadTitles.push(n.title);
    }
  }
  const availableCorpusSources = new Set(
    available.map(n => n.identity.workId.replace(/^corpus:/, '')),
  );

  const pipelineNormIds = new Set<string>();
  if (mongoose.isValidObjectId(projectId)) {
    const states = await CompliancePipelineState.find({ projectId })
      .select('normId')
      .lean()
      .catch(() => []);
    for (const s of states) {
      if (s.normId) pipelineNormIds.add(String(s.normId));
    }
  }

  return { referencedCorpusSources, availableCorpusSources, pipelineNormIds, uploadTitles };
}

function enrichAssessment(
  a: RuleAssessment,
  rule: ApplicabilityRule | undefined,
  world: NormWorldState,
): NormApplicabilityAssessment {
  const referencedSource = a.corpusSourceIds.find(s => world.referencedCorpusSources.has(s));
  const availableSource = a.corpusSourceIds.find(s => world.availableCorpusSources.has(s));
  const uploadMatch = rule?.uploadTitlePatterns?.some(re =>
    world.uploadTitles.some(t => re.test(t)),
  );
  const inPipeline = a.corpusSourceIds.some(s =>
    world.pipelineNormIds.has(deriveNormWorkId('corpus', s)),
  );
  const preferredSource = referencedSource ?? availableSource;
  return {
    ...a,
    referenced: Boolean(referencedSource) || Boolean(uploadMatch),
    inPipeline,
    availableInCorpus: Boolean(availableSource) || Boolean(referencedSource),
    workId: preferredSource ? deriveNormWorkId('corpus', preferredSource) : undefined,
  };
}

export async function buildApplicabilityReport(projectId: string): Promise<ApplicabilityReport> {
  const [facts, world] = await Promise.all([
    loadProjectFacts(projectId),
    loadNormWorldState(projectId),
  ]);

  const signals = evaluateSignals(facts);
  const ruleById = new Map(APPLICABILITY_RULES.map(r => [r.ruleId, r]));
  const assessments = assessRules(signals).map(a =>
    enrichAssessment(a, ruleById.get(a.ruleId), world),
  );

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    elementCount: facts.elements.length,
    wizardElementCount: facts.elements.filter(e => e.fromWizard).length,
    assumedJurisdictions: [...ASSUMED_JURISDICTIONS],
    signals,
    assessments,
    disclaimer: APPLICABILITY_DISCLAIMER,
  };
}
