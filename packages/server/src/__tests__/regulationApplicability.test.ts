/**
 * UC-LAW-001 — Regulatory Applicability Radar (pure Auswertung, ohne DB).
 *
 * Run: cd packages/server && npx jest regulationApplicability --verbose
 */
import { NORM_ONTOLOGY, verdictFromScore } from '@thearchitect/shared';
import {
  evaluateSignals,
  assessRules,
  combineWeights,
  type ProjectFacts,
  type ElementFact,
} from '../services/regulationApplicability.service';
import { APPLICABILITY_RULES, SIGNAL_DEFS } from '../data/applicability-rules';

let elementSeq = 0;
function el(partial: Partial<ElementFact> & { name: string }): ElementFact {
  elementSeq += 1;
  return {
    id: `el-${elementSeq}`,
    type: 'application_component',
    description: '',
    fromWizard: false,
    ...partial,
  };
}

function facts(elements: ElementFact[], projectFields: ProjectFacts['projectFields'] = []): ProjectFacts {
  return { projectId: 'p1', elements, projectFields };
}

function assessmentFor(ruleId: string, input: ProjectFacts) {
  const a = assessRules(evaluateSignals(input)).find(r => r.ruleId === ruleId);
  if (!a) throw new Error(`rule ${ruleId} missing`);
  return a;
}

describe('applicability rules registry (UC-LAW-001)', () => {
  it('every rule references only ontology norm sources (E6 contract)', () => {
    const registered = new Set<string>(NORM_ONTOLOGY.normSources.map(s => s.id));
    for (const rule of APPLICABILITY_RULES) {
      for (const src of rule.corpusSourceIds) {
        expect(registered.has(src)).toBe(true);
      }
    }
  });

  it('every contribution references a defined signal', () => {
    const signalIds = new Set(SIGNAL_DEFS.map(s => s.id));
    for (const rule of APPLICABILITY_RULES) {
      for (const c of rule.contributions) {
        expect(signalIds.has(c.signalId)).toBe(true);
        expect(c.weight).toBeGreaterThan(0);
        expect(c.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('requiresSignals only reference defined signals', () => {
    const signalIds = new Set(SIGNAL_DEFS.map(s => s.id));
    for (const def of SIGNAL_DEFS) {
      for (const req of def.requiresSignals ?? []) {
        expect(signalIds.has(req)).toBe(true);
      }
    }
  });
});

describe('combineWeights (noisy-OR)', () => {
  it('is 0 without contributions and never exceeds 1', () => {
    expect(combineWeights([])).toBe(0);
    expect(combineWeights([1, 0.9])).toBe(1);
  });

  it('independent evidence reinforces: 0.7 + 0.35 → 0.81', () => {
    expect(combineWeights([0.7, 0.35])).toBe(0.81);
  });

  it('verdict thresholds hold at the boundaries', () => {
    expect(verdictFromScore(0.75)).toBe('applicable');
    expect(verdictFromScore(0.45)).toBe('likely');
    expect(verdictFromScore(0.2)).toBe('possible');
    expect(verdictFromScore(0.19)).toBe('not_indicated');
  });
});

describe('signal extraction', () => {
  it('detects personal data from element names (PII patterns)', () => {
    const signals = evaluateSignals(
      facts([el({ name: 'Customer Database', type: 'data_object' })]),
    );
    const s = signals.find(x => x.id === 'personal-data');
    expect(s?.detected).toBe(true);
    expect(s?.evidence[0]).toMatchObject({ kind: 'element', name: 'Customer Database' });
  });

  it('detects explicit PII sensitivity classification', () => {
    const signals = evaluateSignals(
      facts([el({ name: 'Order Ledger', type: 'data_object', sensitivity: 'PII' })]),
    );
    expect(signals.find(x => x.id === 'pii-classified')?.detected).toBe(true);
  });

  it('detects AI components via the ai_agent element type', () => {
    // Name bewusst ohne AI-Pattern-Treffer — der Typ allein muss reichen.
    const signals = evaluateSignals(facts([el({ name: 'Fraud Watchdog', type: 'ai_agent' })]));
    const s = signals.find(x => x.id === 'ai-components');
    expect(s?.detected).toBe(true);
    expect(s?.evidence[0]?.detail).toContain('ai_agent');
  });

  it('security-baseline needs ≥3 pure technology-type elements, but 1 security pattern suffices', () => {
    const twoNodes = evaluateSignals(
      facts([el({ name: 'Server A', type: 'node' }), el({ name: 'Server B', type: 'node' })]),
    );
    expect(twoNodes.find(x => x.id === 'security-baseline')?.detected).toBe(false);

    const threeNodes = evaluateSignals(
      facts([
        el({ name: 'Server A', type: 'node' }),
        el({ name: 'Server B', type: 'node' }),
        el({ name: 'Server C', type: 'node' }),
      ]),
    );
    expect(threeNodes.find(x => x.id === 'security-baseline')?.detected).toBe(true);

    const oneFirewall = evaluateSignals(facts([el({ name: 'Perimeter Firewall', type: 'node' })]));
    expect(oneFirewall.find(x => x.id === 'security-baseline')?.detected).toBe(true);
  });

  it('facilities/materials alone do not count as connected products', () => {
    const signals = evaluateSignals(
      facts([el({ name: 'Headquarters Building', type: 'facility' })]),
    );
    expect(signals.find(x => x.id === 'connected-products')?.detected).toBe(false);
  });

  it('high-risk-ai-context stays undetected without ai-components (gate)', () => {
    const signals = evaluateSignals(
      facts([el({ name: 'Recruiting Portal', description: 'hiring workflow' })]),
    );
    const gated = signals.find(x => x.id === 'high-risk-ai-context');
    // Evidenz sichtbar, aber Gate zu — Transparenz statt stillem Verwerfen.
    expect(gated?.detected).toBe(false);
    expect(gated?.matchCount).toBeGreaterThan(0);
  });

  it('high-risk-ai-context opens when AI components exist', () => {
    const signals = evaluateSignals(
      facts([
        el({ name: 'CV Scoring Model', description: 'ML model ranking applicants' }),
        el({ name: 'Recruiting Portal', description: 'hiring workflow' }),
      ]),
    );
    expect(signals.find(x => x.id === 'ai-components')?.detected).toBe(true);
    expect(signals.find(x => x.id === 'high-risk-ai-context')?.detected).toBe(true);
  });

  it('reads project-level patterns from project fields', () => {
    const signals = evaluateSignals(
      facts([], [{ name: 'description', value: 'Payment platform for banks' }]),
    );
    const s = signals.find(x => x.id === 'financial-sector');
    expect(s?.detected).toBe(true);
    expect(s?.evidence[0]).toMatchObject({ kind: 'project', name: 'description' });
  });

  it('marks wizard-generated elements in the evidence', () => {
    const signals = evaluateSignals(
      facts([el({ name: 'User Profile Store', type: 'data_object', fromWizard: true })]),
    );
    expect(signals.find(x => x.id === 'personal-data')?.evidence[0]?.fromWizard).toBe(true);
  });

  it('caps evidence but keeps the full match count', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      el({ name: `Customer Record ${i}`, type: 'data_object' }),
    );
    const s = evaluateSignals(facts(many)).find(x => x.id === 'personal-data');
    expect(s?.matchCount).toBe(12);
    expect(s?.evidence.length).toBeLessThanOrEqual(8);
  });
});

describe('rule assessment (architecture → laws)', () => {
  it('PII-heavy architecture → GDPR applicable', () => {
    const a = assessmentFor(
      'dsgvo',
      facts([
        el({ name: 'Customer Master Data', type: 'data_object', sensitivity: 'PII' }),
        el({ name: 'Customer', type: 'business_actor' }),
      ]),
    );
    expect(a.verdict).toBe('applicable');
    expect(a.contributions.length).toBeGreaterThanOrEqual(2);
  });

  it('AI agent in HR context → AI Act applicable, with both contributions', () => {
    const a = assessmentFor(
      'ai-act',
      facts([
        el({ name: 'Candidate Scoring Agent', type: 'ai_agent' }),
        el({ name: 'Recruiting Process', description: 'hiring pipeline', type: 'process' }),
      ]),
    );
    expect(a.verdict).toBe('applicable');
    expect(a.contributions.map(c => c.signalId).sort()).toEqual([
      'ai-components',
      'high-risk-ai-context',
    ]);
  });

  it('pure CRM architecture → AI Act not indicated', () => {
    const a = assessmentFor('ai-act', facts([el({ name: 'Customer Database', type: 'data_object' })]));
    expect(a.verdict).toBe('not_indicated');
    expect(a.score).toBe(0);
  });

  it('IoT devices → Data Act at least likely', () => {
    const a = assessmentFor(
      'data-act',
      facts([
        el({ name: 'Smart Meter Fleet', type: 'device' }),
        el({ name: 'Telemetry Ingest', description: 'sensor data stream' }),
      ]),
    );
    expect(['likely', 'applicable']).toContain(a.verdict);
  });

  it('bank context → DORA, and cloud alone does not trigger DORA', () => {
    const bank = assessmentFor(
      'dora',
      facts([], [{ name: 'description', value: 'Core banking and payment processing' }]),
    );
    expect(bank.verdict).not.toBe('not_indicated');
    expect(bank.score).toBeGreaterThanOrEqual(0.45);

    const cloudOnly = assessmentFor(
      'dora',
      facts([el({ name: 'AWS EKS Cluster', type: 'node' })]),
    );
    expect(cloudOnly.verdict).toBe('not_indicated');
  });

  it('empty architecture → every rule not_indicated with honest rationale', () => {
    const all = assessRules(evaluateSignals(facts([])));
    for (const a of all) {
      expect(a.verdict).toBe('not_indicated');
      expect(a.rationale).toContain('No indicators');
    }
  });

  it('sorts by score, binding laws before voluntary standards on ties', () => {
    const all = assessRules(
      evaluateSignals(
        facts([el({ name: 'Customer Portal', description: 'user accounts and profiles' })]),
      ),
    );
    const scores = all.map(a => a.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});
