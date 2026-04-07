import { Policy, IPolicy } from '../models/Policy';
import { runCypher } from '../config/neo4j';

export interface ComplianceViolation {
  elementId: string;
  elementName: string;
  elementType: string;
  policyId: string;
  policyName: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
}

export interface ComplianceReport {
  projectId: string;
  timestamp: string;
  totalElements: number;
  totalPolicies: number;
  violations: ComplianceViolation[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    complianceScore: number;
  };
  byCategory: Record<string, number>;
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
          });
        }
      }
    }
  }

  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  const infos = violations.filter((v) => v.severity === 'info').length;
  const maxPossible = Math.max(elements.length * policies.length, 1);
  const complianceScore = Math.round(((maxPossible - errors * 3 - warnings) / maxPossible) * 100);

  const byCategory: Record<string, number> = {};
  for (const v of violations) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  }

  return {
    projectId,
    timestamp: new Date().toISOString(),
    totalElements: elements.length,
    totalPolicies: policies.length,
    violations,
    summary: {
      errors,
      warnings,
      infos,
      complianceScore: Math.max(0, Math.min(100, complianceScore)),
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
        severity: 'warning', category: 'architecture', message: 'Element should have a description (min 10 chars)',
        field: 'description', currentValue: el.description, expectedValue: 'min 10 chars',
      });
    }

    if (el.status === 'retired' && el.riskLevel === 'critical') {
      violations.push({
        elementId: '', elementName: el.name, elementType: el.type,
        policyId: 'builtin-retired-risk', policyName: 'Retired Critical Risk',
        severity: 'error', category: 'security', message: 'Retired elements should not have critical risk level',
        field: 'riskLevel', currentValue: el.riskLevel, expectedValue: 'low or medium',
      });
    }

    if (el.maturity <= 1 && el.status === 'current') {
      violations.push({
        elementId: '', elementName: el.name, elementType: el.type,
        policyId: 'builtin-low-maturity', policyName: 'Low Maturity Current',
        severity: 'warning', category: 'architecture', message: 'Current elements with maturity 1 should be reviewed',
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
  return field.split('.').reduce((obj, key) => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined), el as unknown);
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
