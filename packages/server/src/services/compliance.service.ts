import { ViolationSeverity } from '@thearchitect/shared';
import { Policy, IPolicy } from '../models/Policy';
import { runCypher } from '../config/neo4j';

export interface ComplianceViolation {
  elementId: string;
  elementName: string;
  elementType: string;
  policyId: string;
  policyName: string;
  severity: ViolationSeverity;
  category: string;
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
  operator?: string; // THE-499: optional, damit getBuiltInChecks (setzt kein operator) unangetastet bleibt
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ComplianceReport {
  projectId: string;
  timestamp: string;
  totalElements: number;
  totalPolicies: number;
  violations: ComplianceViolation[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    complianceScore: number;
  };
  byCategory: Record<string, number>;
}

// THE-442: Gewichte so gewählt, dass migrierte Alt-Daten (error→high,
// warning→medium, info→low) exakt den Alt-Score reproduzieren.
const SEVERITY_SCORE_WEIGHTS: Record<ViolationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 1,
  low: 0,
};

export function computeComplianceScore(counts: SeverityCounts, maxPossible: number): number {
  const max = Math.max(maxPossible, 1);
  const penalty =
    counts.critical * SEVERITY_SCORE_WEIGHTS.critical +
    counts.high * SEVERITY_SCORE_WEIGHTS.high +
    counts.medium * SEVERITY_SCORE_WEIGHTS.medium +
    counts.low * SEVERITY_SCORE_WEIGHTS.low;
  return Math.max(0, Math.min(100, Math.round(((max - penalty) / max) * 100)));
}

// Run compliance check against all enabled policies
export async function checkCompliance(projectId: string): Promise<ComplianceReport> {
  const policies = await Policy.find({ projectId, enabled: true });

  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.togafDomain as domain, e.maturityLevel as maturity,
            e.riskLevel as riskLevel, e.status as status,
            e.description as description, e.metadata as metadata`,
    { projectId }
  );

  const elements = records.map((r) => ({
    id: r.get('id'),
    name: r.get('name'),
    type: r.get('type'),
    layer: r.get('layer'),
    domain: r.get('domain'),
    maturity: r.get('maturity')?.toNumber?.() || 1,
    riskLevel: r.get('riskLevel') || 'low',
    status: r.get('status') || 'current',
    description: r.get('description') || '',
    metadata: r.get('metadata') || {},
  }));

  const violations: ComplianceViolation[] = [];

  for (const policy of policies) {
    const matchingElements = elements.filter((el) => elementMatchesScope(el, policy));

    for (const el of matchingElements) {
      for (const rule of policy.rules) {
        const fieldValue = getFieldValue(el, rule.field);
        if (!evaluateRule(fieldValue, rule.operator, rule.value)) {
          violations.push({
            elementId: el.id,
            elementName: el.name,
            elementType: el.type,
            policyId: policy._id.toString(),
            policyName: policy.name,
            severity: policy.severity,
            category: policy.category,
            message: rule.message,
            field: rule.field,
            currentValue: fieldValue,
            expectedValue: rule.value,
            operator: rule.operator,
          });
        }
      }
    }
  }

  const counts = {
    critical: violations.filter((v) => v.severity === 'critical').length,
    high: violations.filter((v) => v.severity === 'high').length,
    medium: violations.filter((v) => v.severity === 'medium').length,
    low: violations.filter((v) => v.severity === 'low').length,
  };
  const maxPossible = Math.max(elements.length * policies.length, 1);

  const byCategory: Record<string, number> = {};
  for (const v of violations) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  }

  // summary shape: errors/warnings/infos → bySeverity (Konsumenten: ComplianceDashboard, advisor.service)
  return {
    projectId,
    timestamp: new Date().toISOString(),
    totalElements: elements.length,
    totalPolicies: policies.length,
    violations,
    summary: {
      ...counts,
      complianceScore: computeComplianceScore(counts, maxPossible),
    },
    byCategory,
  };
}

// Built-in architecture best-practice checks (no policies needed)
export function getBuiltInChecks(elements: { name: string; description: string; type: string; status: string; maturity: number; riskLevel: string }[]): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  for (const el of elements) {
    if (!el.description || el.description.length < 10) {
      violations.push({
        elementId: '', elementName: el.name, elementType: el.type,
        policyId: 'builtin-description', policyName: 'Description Required',
        severity: 'medium', category: 'architecture', message: 'Element should have a description (min 10 chars)',
        field: 'description', currentValue: el.description, expectedValue: 'min 10 chars',
      });
    }

    if (el.status === 'retired' && el.riskLevel === 'critical') {
      violations.push({
        elementId: '', elementName: el.name, elementType: el.type,
        policyId: 'builtin-retired-risk', policyName: 'Retired Critical Risk',
        severity: 'high', category: 'security', message: 'Retired elements should not have critical risk level',
        field: 'riskLevel', currentValue: el.riskLevel, expectedValue: 'low or medium',
      });
    }

    if (el.maturity <= 1 && el.status === 'current') {
      violations.push({
        elementId: '', elementName: el.name, elementType: el.type,
        policyId: 'builtin-low-maturity', policyName: 'Low Maturity Current',
        severity: 'medium', category: 'architecture', message: 'Current elements with maturity 1 should be reviewed',
        field: 'maturityLevel', currentValue: el.maturity, expectedValue: '>= 2',
      });
    }
  }

  return violations;
}

export function elementMatchesScope(el: { type: string; domain: string; layer: string }, policy: IPolicy): boolean {
  const scope = policy.scope;
  if (scope.domains.length > 0 && !scope.domains.includes(el.domain)) return false;
  if (scope.elementTypes.length > 0 && !scope.elementTypes.includes(el.type)) return false;
  if (scope.layers.length > 0 && !scope.layers.includes(el.layer)) return false;
  return true;
}

export function getFieldValue(el: Record<string, unknown>, field: string): unknown {
  // THE-501: rule fields target `maturityLevel`, but both read paths (checkCompliance
  // above and policy-evaluation.service, which imports this function) map the Neo4j
  // column onto the object key `maturity` — resolve the alias here so one fix covers both.
  const resolved = field === 'maturityLevel' ? 'maturity' : field;
  return resolved.split('.').reduce((obj, key) => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined), el as unknown);
}

export function evaluateRule(value: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'equals': return value === expected;
    case 'not_equals': return value !== expected;
    case 'contains': return typeof value === 'string' && typeof expected === 'string' && value.includes(expected);
    case 'gt': return typeof value === 'number' && typeof expected === 'number' && value > expected;
    case 'lt': return typeof value === 'number' && typeof expected === 'number' && value < expected;
    case 'gte': return typeof value === 'number' && typeof expected === 'number' && value >= expected;
    case 'lte': return typeof value === 'number' && typeof expected === 'number' && value <= expected;
    case 'exists': return expected ? (value != null && value !== '') : (value == null || value === '');
    case 'regex': return typeof value === 'string' && typeof expected === 'string' && new RegExp(expected).test(value);
    default: return true;
  }
}
