/**
 * Seed Policy Templates for DORA, NIS2, and TOGAF frameworks.
 * These are imported as 'draft' status — the user must review and activate.
 */

interface SeedPolicy {
  name: string;
  description: string;
  category: string;
  framework: string;
  severity: 'error' | 'warning' | 'info';
  source: 'dora' | 'nis2' | 'togaf';
  scope: { domains: string[]; elementTypes: string[]; layers: string[] };
  rules: Array<{ field: string; operator: string; value: unknown; message: string }>;
}

export const SEED_POLICIES: SeedPolicy[] = [
  // ─── DORA (5 Policies) ───

  {
    name: 'ICT Risk Management',
    description: 'DORA Art. 6: All ICT systems must have documented risk assessments with risk level no higher than "high".',
    category: 'compliance',
    framework: 'DORA',
    severity: 'error',
    source: 'dora',
    scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] },
    rules: [
      { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'DORA Art. 6: ICT elements must not have critical risk level without mitigation plan' },
      { field: 'description', operator: 'exists', value: true, message: 'DORA Art. 6: ICT elements must have documented descriptions for risk assessment' },
    ],
  },
  {
    name: 'ICT Incident Classification',
    description: 'DORA Art. 18: Major ICT incidents must be classified by maturity level >= 2.',
    category: 'compliance',
    framework: 'DORA',
    severity: 'warning',
    source: 'dora',
    scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] },
    rules: [
      { field: 'maturity', operator: 'gte', value: 2, message: 'DORA Art. 18: ICT systems must have maturity level >= 2 for incident classification readiness' },
    ],
  },
  {
    name: 'Resilience Testing',
    description: 'DORA Art. 26: Critical ICT systems must undergo resilience testing — status must not be "retired".',
    category: 'compliance',
    framework: 'DORA',
    severity: 'error',
    source: 'dora',
    scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] },
    rules: [
      { field: 'status', operator: 'not_equals', value: 'retired', message: 'DORA Art. 26: Retired systems cannot be part of resilience testing — decommission or replace' },
    ],
  },
  {
    name: 'Third-Party ICT Risk',
    description: 'DORA Art. 28: Third-party ICT service dependencies must be documented and assessed.',
    category: 'security',
    framework: 'DORA',
    severity: 'warning',
    source: 'dora',
    scope: { domains: [], elementTypes: ['application', 'application_component', 'platform_service'], layers: [] },
    rules: [
      { field: 'description', operator: 'exists', value: true, message: 'DORA Art. 28: Applications must document third-party service dependencies' },
    ],
  },
  {
    name: 'Threat Intelligence Sharing',
    description: 'DORA Art. 45: Financial entities should have processes for sharing threat intelligence.',
    category: 'compliance',
    framework: 'DORA',
    severity: 'info',
    source: 'dora',
    scope: { domains: [], elementTypes: [], layers: ['business', 'application'] },
    rules: [
      { field: 'maturity', operator: 'gte', value: 2, message: 'DORA Art. 45: Business/application elements should meet maturity level >= 2 for threat intelligence readiness' },
    ],
  },

  // ─── NIS2 (4 Policies) ───

  {
    name: 'Risk Analysis Measures',
    description: 'NIS2 Art. 21(2a): Entities must implement risk analysis and information system security policies.',
    category: 'security',
    framework: 'NIS2',
    severity: 'error',
    source: 'nis2',
    scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] },
    rules: [
      { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'NIS2 Art. 21(2a): Systems with critical risk must have documented mitigation' },
      { field: 'description', operator: 'exists', value: true, message: 'NIS2 Art. 21(2a): All systems must be documented for risk analysis' },
    ],
  },
  {
    name: 'Incident Handling',
    description: 'NIS2 Art. 21(2b): Incident handling procedures must be in place for all operational systems.',
    category: 'compliance',
    framework: 'NIS2',
    severity: 'warning',
    source: 'nis2',
    scope: { domains: [], elementTypes: [], layers: ['application'] },
    rules: [
      { field: 'status', operator: 'not_equals', value: 'retired', message: 'NIS2 Art. 21(2b): Retired systems must not be in active incident handling scope' },
      { field: 'maturity', operator: 'gte', value: 2, message: 'NIS2 Art. 21(2b): Systems must reach maturity level 2+ for incident handling readiness' },
    ],
  },
  {
    name: 'Business Continuity',
    description: 'NIS2 Art. 21(2c): Business continuity and crisis management must cover all critical systems.',
    category: 'compliance',
    framework: 'NIS2',
    severity: 'error',
    source: 'nis2',
    scope: { domains: [], elementTypes: [], layers: ['business', 'application'] },
    rules: [
      { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'NIS2 Art. 21(2c): Critical-risk elements must have business continuity plans' },
    ],
  },
  {
    name: 'Supply Chain Security',
    description: 'NIS2 Art. 21(2d): Supply chain security including security-related aspects of supplier relationships.',
    category: 'security',
    framework: 'NIS2',
    severity: 'warning',
    source: 'nis2',
    scope: { domains: [], elementTypes: ['application', 'application_component', 'technology_component'], layers: [] },
    rules: [
      { field: 'description', operator: 'exists', value: true, message: 'NIS2 Art. 21(2d): Supply chain components must document supplier relationships' },
    ],
  },

  // ─── TOGAF Baseline (3 Policies) ───

  {
    name: 'Architecture Description',
    description: 'TOGAF 10 §4.1: Every architecture element must have a meaningful description.',
    category: 'architecture',
    framework: 'TOGAF 10',
    severity: 'warning',
    source: 'togaf',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'description', operator: 'exists', value: true, message: 'TOGAF 10: Every element must have a description for architecture documentation' },
    ],
  },
  {
    name: 'Naming Convention',
    description: 'TOGAF 10 §5.2: Element names must be descriptive (minimum 3 characters).',
    category: 'naming',
    framework: 'TOGAF 10',
    severity: 'warning',
    source: 'togaf',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'name', operator: 'regex', value: '^.{3,}$', message: 'TOGAF 10: Element names must be at least 3 characters long' },
    ],
  },
  {
    name: 'Layer Integrity',
    description: 'TOGAF 10: Technology layer elements should not have "retired" status without replacement plan.',
    category: 'architecture',
    framework: 'TOGAF 10',
    severity: 'warning',
    source: 'togaf',
    scope: { domains: [], elementTypes: [], layers: ['technology'] },
    rules: [
      { field: 'status', operator: 'not_equals', value: 'retired', message: 'TOGAF 10: Retired technology elements should be decommissioned or replaced' },
    ],
  },
];
