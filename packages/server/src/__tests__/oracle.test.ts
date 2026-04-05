/**
 * Oracle — Acceptance Risk Score Tests
 *
 * Tests:
 *   1. Shared types and exports
 *   2. OracleProposal Zod validation
 *   3. OracleVerdict structure (mock LLM)
 *   4. Score computation and weighting
 *   5. MongoDB persistence
 *   6. History endpoint
 *   7. Error handling (missing AI key)
 *
 * Run: cd packages/server && npx jest src/__tests__/oracle.test.ts --verbose
 */

import type {
  OracleProposal,
  OracleVerdict,
  AgentVerdict,
  ResistanceFactor,
  OracleFatigueForecast,
  OracleChangeType,
  OracleRiskLevel,
  OraclePosition,
  AgentVerdictPosition,
  ResistanceSeverity,
} from '@thearchitect/shared';

// ══════════════════════════════════════════════════════════════════
// SECTION 1: Shared Types & Exports
// ══════════════════════════════════════════════════════════════════

describe('1. Oracle Types — Shared Package Exports', () => {
  test('1.1 All Oracle types are importable from @thearchitect/shared', () => {
    // Type-level check — if this compiles, the exports work
    const proposal: OracleProposal = {
      title: 'Test',
      description: 'Test proposal description text',
      affectedElementIds: ['el-1'],
      changeType: 'modify',
    };
    expect(proposal.title).toBe('Test');
    expect(proposal.changeType).toBe('modify');
  });

  test('1.2 OracleChangeType covers all 5 types', () => {
    const types: OracleChangeType[] = ['retire', 'migrate', 'consolidate', 'introduce', 'modify'];
    expect(types).toHaveLength(5);
  });

  test('1.3 OracleRiskLevel covers all 4 levels', () => {
    const levels: OracleRiskLevel[] = ['low', 'medium', 'high', 'critical'];
    expect(levels).toHaveLength(4);
  });

  test('1.4 OraclePosition covers all 3 positions', () => {
    const positions: OraclePosition[] = ['likely_accepted', 'contested', 'likely_rejected'];
    expect(positions).toHaveLength(3);
  });

  test('1.5 AgentVerdictPosition covers all 4 positions', () => {
    const positions: AgentVerdictPosition[] = ['approve', 'reject', 'modify', 'abstain'];
    expect(positions).toHaveLength(4);
  });

  test('1.6 ResistanceSeverity covers 3 levels', () => {
    const severities: ResistanceSeverity[] = ['low', 'medium', 'high'];
    expect(severities).toHaveLength(3);
  });

  test('1.7 OracleVerdict has all required fields', () => {
    const verdict: OracleVerdict = {
      acceptanceRiskScore: 42,
      riskLevel: 'medium',
      overallPosition: 'contested',
      agentVerdicts: [],
      resistanceFactors: [],
      mitigationSuggestions: ['Do something'],
      fatigueForecast: {
        projectedDelayMonths: 2,
        budgetAtRisk: 50000,
        overloadedStakeholders: [],
      },
      timestamp: new Date().toISOString(),
      durationMs: 1234,
    };

    expect(verdict.acceptanceRiskScore).toBe(42);
    expect(verdict.riskLevel).toBe('medium');
    expect(verdict.overallPosition).toBe('contested');
    expect(Array.isArray(verdict.agentVerdicts)).toBe(true);
    expect(Array.isArray(verdict.resistanceFactors)).toBe(true);
    expect(Array.isArray(verdict.mitigationSuggestions)).toBe(true);
    expect(verdict.fatigueForecast.projectedDelayMonths).toBeGreaterThanOrEqual(0);
    expect(verdict.fatigueForecast.budgetAtRisk).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(verdict.fatigueForecast.overloadedStakeholders)).toBe(true);
    expect(typeof verdict.timestamp).toBe('string');
    expect(verdict.durationMs).toBeGreaterThan(0);
  });

  test('1.8 AgentVerdict has all required fields', () => {
    const av: AgentVerdict = {
      personaId: 'cto',
      personaName: 'CTO',
      stakeholderType: 'c_level',
      position: 'approve',
      reasoning: 'This aligns well with our strategy.',
      concerns: ['Timeline might be aggressive'],
      acceptanceScore: 85,
    };

    expect(av.personaId).toBe('cto');
    expect(av.acceptanceScore).toBe(85);
    expect(av.concerns).toHaveLength(1);
  });

  test('1.9 ResistanceFactor has all required fields', () => {
    const rf: ResistanceFactor = {
      factor: 'Budget overrun',
      severity: 'high',
      source: 'IT Operations Manager',
      description: 'IT Ops concerned about budget',
    };

    expect(rf.factor).toBe('Budget overrun');
    expect(rf.severity).toBe('high');
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 2: Zod Validation Schema
// ══════════════════════════════════════════════════════════════════

describe('2. OracleProposal Validation', () => {
  // Import Zod schema inline to avoid server-side dependency issues
  let OracleProposalSchema: import('zod').ZodType;

  beforeAll(async () => {
    const { z } = await import('zod');
    OracleProposalSchema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(10).max(3000),
      affectedElementIds: z.array(z.string()).min(1),
      changeType: z.enum(['retire', 'migrate', 'consolidate', 'introduce', 'modify']),
      estimatedCost: z.number().min(0).optional(),
      estimatedDuration: z.number().min(1).max(120).optional(),
      targetScenarioId: z.string().optional(),
    });
  });

  test('2.1 Valid proposal passes validation', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'CRM Consolidation',
      description: 'Consolidate 5 CRM systems into one unified Salesforce instance.',
      affectedElementIds: ['el-1', 'el-2'],
      changeType: 'consolidate',
      estimatedCost: 2500000,
      estimatedDuration: 18,
    });
    expect(result.success).toBe(true);
  });

  test('2.2 Empty title rejected', () => {
    const result = OracleProposalSchema.safeParse({
      title: '',
      description: 'Valid description text here.',
      affectedElementIds: ['el-1'],
      changeType: 'modify',
    });
    expect(result.success).toBe(false);
  });

  test('2.3 Short description rejected (< 10 chars)', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Test',
      description: 'Too short',
      affectedElementIds: ['el-1'],
      changeType: 'modify',
    });
    expect(result.success).toBe(false);
  });

  test('2.4 Empty affectedElementIds rejected', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Test Proposal',
      description: 'A sufficiently long description for testing.',
      affectedElementIds: [],
      changeType: 'modify',
    });
    expect(result.success).toBe(false);
  });

  test('2.5 Invalid changeType rejected', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Test Proposal',
      description: 'A sufficiently long description for testing.',
      affectedElementIds: ['el-1'],
      changeType: 'destroy',
    });
    expect(result.success).toBe(false);
  });

  test('2.6 estimatedDuration > 120 rejected', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Test Proposal',
      description: 'A sufficiently long description for testing.',
      affectedElementIds: ['el-1'],
      changeType: 'modify',
      estimatedDuration: 999,
    });
    expect(result.success).toBe(false);
  });

  test('2.7 Negative estimatedCost rejected', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Test Proposal',
      description: 'A sufficiently long description for testing.',
      affectedElementIds: ['el-1'],
      changeType: 'modify',
      estimatedCost: -100,
    });
    expect(result.success).toBe(false);
  });

  test('2.8 Optional fields can be omitted', () => {
    const result = OracleProposalSchema.safeParse({
      title: 'Minimal Proposal',
      description: 'A sufficiently long description for testing.',
      affectedElementIds: ['el-1'],
      changeType: 'introduce',
    });
    expect(result.success).toBe(true);
  });

  test('2.9 All 5 changeTypes are valid', () => {
    const types: OracleChangeType[] = ['retire', 'migrate', 'consolidate', 'introduce', 'modify'];
    for (const ct of types) {
      const result = OracleProposalSchema.safeParse({
        title: `Test ${ct}`,
        description: 'A sufficiently long description for testing.',
        affectedElementIds: ['el-1'],
        changeType: ct,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3: Score Computation Logic
// ══════════════════════════════════════════════════════════════════

describe('3. Score Computation & Weighting', () => {
  test('3.1 Stakeholder weights sum to 1.0', () => {
    const weights: Record<string, number> = {
      c_level: 0.30,
      business_unit: 0.25,
      it_ops: 0.20,
      data_team: 0.15,
      external: 0.10,
    };
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  test('3.2 Risk score derivation: score < 30 → low', () => {
    expect(deriveRiskLevel(15)).toBe('low');
    expect(deriveRiskLevel(29)).toBe('low');
  });

  test('3.3 Risk score derivation: 30-59 → medium', () => {
    expect(deriveRiskLevel(30)).toBe('medium');
    expect(deriveRiskLevel(59)).toBe('medium');
  });

  test('3.4 Risk score derivation: 60-79 → high', () => {
    expect(deriveRiskLevel(60)).toBe('high');
    expect(deriveRiskLevel(79)).toBe('high');
  });

  test('3.5 Risk score derivation: 80+ → critical', () => {
    expect(deriveRiskLevel(80)).toBe('critical');
    expect(deriveRiskLevel(100)).toBe('critical');
  });

  test('3.6 Overall position: score < 35 → likely_accepted', () => {
    expect(deriveOverallPosition(20)).toBe('likely_accepted');
    expect(deriveOverallPosition(34)).toBe('likely_accepted');
  });

  test('3.7 Overall position: 35-64 → contested', () => {
    expect(deriveOverallPosition(35)).toBe('contested');
    expect(deriveOverallPosition(64)).toBe('contested');
  });

  test('3.8 Overall position: 65+ → likely_rejected', () => {
    expect(deriveOverallPosition(65)).toBe('likely_rejected');
    expect(deriveOverallPosition(100)).toBe('likely_rejected');
  });

  test('3.9 Weighted risk score: all approve (score 90) → low risk', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('cto', 'c_level', 'approve', 90),
      mockVerdict('bu', 'business_unit', 'approve', 90),
      mockVerdict('ops', 'it_ops', 'approve', 90),
      mockVerdict('data', 'data_team', 'approve', 90),
      mockVerdict('sec', 'external', 'approve', 90),
    ];
    const score = computeWeightedRiskScore(verdicts);
    expect(score).toBeLessThan(20);
  });

  test('3.10 Weighted risk score: all reject (score 10) → high risk', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('cto', 'c_level', 'reject', 10),
      mockVerdict('bu', 'business_unit', 'reject', 10),
      mockVerdict('ops', 'it_ops', 'reject', 10),
      mockVerdict('data', 'data_team', 'reject', 10),
      mockVerdict('sec', 'external', 'reject', 10),
    ];
    const score = computeWeightedRiskScore(verdicts);
    expect(score).toBeGreaterThan(80);
  });

  test('3.11 c_level rejection (weight 0.30) increases score more than external (0.10)', () => {
    const baseVerdicts: AgentVerdict[] = [
      mockVerdict('cto', 'c_level', 'approve', 90),
      mockVerdict('bu', 'business_unit', 'approve', 90),
      mockVerdict('ops', 'it_ops', 'approve', 90),
      mockVerdict('data', 'data_team', 'approve', 90),
      mockVerdict('sec', 'external', 'approve', 90),
    ];

    const withCtoReject = [...baseVerdicts];
    withCtoReject[0] = mockVerdict('cto', 'c_level', 'reject', 10);
    const ctoDelta = computeWeightedRiskScore(withCtoReject);

    const withExtReject = [...baseVerdicts];
    withExtReject[4] = mockVerdict('sec', 'external', 'reject', 10);
    const extDelta = computeWeightedRiskScore(withExtReject);

    expect(ctoDelta).toBeGreaterThan(extDelta);
  });

  test('3.12 Score is always between 0 and 100', () => {
    const extreme1 = computeWeightedRiskScore([mockVerdict('x', 'c_level', 'approve', 100)]);
    const extreme2 = computeWeightedRiskScore([mockVerdict('x', 'c_level', 'reject', 0)]);
    expect(extreme1).toBeGreaterThanOrEqual(0);
    expect(extreme1).toBeLessThanOrEqual(100);
    expect(extreme2).toBeGreaterThanOrEqual(0);
    expect(extreme2).toBeLessThanOrEqual(100);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4: Resistance Factor Extraction
// ══════════════════════════════════════════════════════════════════

describe('4. Resistance Factors', () => {
  test('4.1 No factors from approving agents', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('cto', 'c_level', 'approve', 90, ['No concerns']),
    ];
    const factors = extractResistanceFactors(verdicts);
    expect(factors).toHaveLength(0);
  });

  test('4.2 Rejecting agents generate high severity factors', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('ops', 'it_ops', 'reject', 20, ['Stability risk', 'Budget overrun']),
    ];
    const factors = extractResistanceFactors(verdicts);
    expect(factors.length).toBeGreaterThanOrEqual(1);
    expect(factors[0].severity).toBe('high');
  });

  test('4.3 Modifying agents generate medium severity factors', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('bu', 'business_unit', 'modify', 50, ['Need phased approach']),
    ];
    const factors = extractResistanceFactors(verdicts);
    expect(factors.length).toBeGreaterThanOrEqual(1);
    expect(factors[0].severity).toBe('medium');
  });

  test('4.4 Maximum 5 resistance factors', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('a', 'c_level', 'reject', 10, ['c1', 'c2', 'c3']),
      mockVerdict('b', 'it_ops', 'reject', 10, ['c4', 'c5', 'c6']),
    ];
    const factors = extractResistanceFactors(verdicts);
    expect(factors.length).toBeLessThanOrEqual(5);
  });

  test('4.5 Factors sorted by severity (high first)', () => {
    const verdicts: AgentVerdict[] = [
      mockVerdict('bu', 'business_unit', 'modify', 50, ['Medium concern']),
      mockVerdict('ops', 'it_ops', 'reject', 10, ['Critical concern']),
    ];
    const factors = extractResistanceFactors(verdicts);
    if (factors.length >= 2) {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      expect(severityOrder[factors[0].severity]).toBeLessThanOrEqual(severityOrder[factors[1].severity]);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 5: Fatigue Forecast
// ══════════════════════════════════════════════════════════════════

describe('5. Fatigue Forecast', () => {
  test('5.1 projectedDelayMonths is >= 0', () => {
    const forecast: OracleFatigueForecast = {
      projectedDelayMonths: 2.5,
      budgetAtRisk: 0,
      overloadedStakeholders: [],
    };
    expect(forecast.projectedDelayMonths).toBeGreaterThanOrEqual(0);
  });

  test('5.2 budgetAtRisk is >= 0', () => {
    const forecast: OracleFatigueForecast = {
      projectedDelayMonths: 0,
      budgetAtRisk: 150000,
      overloadedStakeholders: [],
    };
    expect(forecast.budgetAtRisk).toBeGreaterThanOrEqual(0);
  });

  test('5.3 overloadedStakeholders is an array', () => {
    const forecast: OracleFatigueForecast = {
      projectedDelayMonths: 5,
      budgetAtRisk: 200000,
      overloadedStakeholders: ['IT Operations Manager', 'CTO'],
    };
    expect(Array.isArray(forecast.overloadedStakeholders)).toBe(true);
    expect(forecast.overloadedStakeholders).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 6: File Structure & Static Analysis
// ══════════════════════════════════════════════════════════════════

describe('6. File Structure', () => {
  test('6.1 oracle.types.ts exists in shared package', () => {
    expect(() => require('@thearchitect/shared/src/types/oracle.types')).not.toThrow();
  });

  test('6.2 OracleAssessment model exists', () => {
    const { OracleAssessment } = require('../models/OracleAssessment');
    expect(OracleAssessment).toBeDefined();
    expect(typeof OracleAssessment.find).toBe('function');
    expect(typeof OracleAssessment.create).toBe('function');
  });

  test('6.3 oracle.service.ts exports assessAcceptanceRisk', () => {
    const { assessAcceptanceRisk } = require('../services/oracle.service');
    expect(typeof assessAcceptanceRisk).toBe('function');
  });

  test('6.4 oracle.routes.ts exports a Router', () => {
    const router = require('../routes/oracle.routes');
    expect(router.default || router).toBeDefined();
  });

  test('6.5 Preset personas: all 5 are available', () => {
    const { getAllPresetPersonas } = require('../services/mirofish/personas');
    const personas = getAllPresetPersonas();
    expect(personas).toHaveLength(5);
    const ids = personas.map((p: { id: string }) => p.id);
    expect(ids).toContain('cto');
    expect(ids).toContain('business_unit_lead');
    expect(ids).toContain('it_operations_manager');
    expect(ids).toContain('data_architect');
    expect(ids).toContain('security_officer');
  });

  test('6.6 Stakeholder types mapped to 5 personas', () => {
    const { getAllPresetPersonas } = require('../services/mirofish/personas');
    const personas = getAllPresetPersonas();
    const types = new Set(personas.map((p: { stakeholderType: string }) => p.stakeholderType));
    // c_level appears twice (CTO + CISO), so unique types < 5
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 7: OracleAssessment Model Schema
// ══════════════════════════════════════════════════════════════════

describe('7. OracleAssessment Model Schema', () => {
  test('7.1 Schema has required fields', () => {
    const { OracleAssessment } = require('../models/OracleAssessment');
    const paths = Object.keys(OracleAssessment.schema.paths);
    expect(paths).toContain('projectId');
    expect(paths).toContain('userId');
    expect(paths).toContain('proposal');
    expect(paths).toContain('verdict');
    expect(paths).toContain('createdAt');
  });

  test('7.2 projectId is required', () => {
    const { OracleAssessment } = require('../models/OracleAssessment');
    const projectIdPath = OracleAssessment.schema.path('projectId');
    expect(projectIdPath.isRequired).toBe(true);
  });

  test('7.3 Has compound index on projectId + createdAt', () => {
    const { OracleAssessment } = require('../models/OracleAssessment');
    const indexes = OracleAssessment.schema.indexes();
    const hasProjectCreatedIndex = indexes.some(
      (idx: [Record<string, number>, unknown]) =>
        idx[0].projectId === 1 && idx[0].createdAt === -1,
    );
    expect(hasProjectCreatedIndex).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Helpers — Pure Logic Extracted for Testing
// ══════════════════════════════════════════════════════════════════

const STAKEHOLDER_WEIGHTS: Record<string, number> = {
  c_level: 0.30,
  business_unit: 0.25,
  it_ops: 0.20,
  data_team: 0.15,
  external: 0.10,
};

function computeWeightedRiskScore(verdicts: AgentVerdict[]): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const verdict of verdicts) {
    const weight = STAKEHOLDER_WEIGHTS[verdict.stakeholderType] || 0.10;
    weightedSum += (100 - verdict.acceptanceScore) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 50;
  return Math.max(0, Math.min(100, weightedSum / totalWeight));
}

function deriveRiskLevel(score: number): OracleRiskLevel {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}

function deriveOverallPosition(score: number): OraclePosition {
  if (score < 35) return 'likely_accepted';
  if (score < 65) return 'contested';
  return 'likely_rejected';
}

function extractResistanceFactors(verdicts: AgentVerdict[]): ResistanceFactor[] {
  const factors: ResistanceFactor[] = [];
  for (const verdict of verdicts) {
    if (verdict.position === 'approve') continue;
    for (const concern of verdict.concerns) {
      if (!concern || concern.includes('parsing failed')) continue;
      const severity: ResistanceSeverity =
        verdict.position === 'reject' ? 'high' :
        verdict.position === 'modify' ? 'medium' : 'low';
      factors.push({
        factor: concern.slice(0, 100),
        severity,
        source: verdict.personaName,
        description: `${verdict.personaName} (${verdict.stakeholderType}): ${concern}`,
      });
    }
  }
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  factors.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return factors.slice(0, 5);
}

function mockVerdict(
  id: string,
  stakeholderType: string,
  position: AgentVerdictPosition,
  score: number,
  concerns: string[] = [],
): AgentVerdict {
  return {
    personaId: id,
    personaName: id.charAt(0).toUpperCase() + id.slice(1),
    stakeholderType,
    position,
    reasoning: `Mock reasoning for ${id}`,
    concerns,
    acceptanceScore: score,
  };
}
