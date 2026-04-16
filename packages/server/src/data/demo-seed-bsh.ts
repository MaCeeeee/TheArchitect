// Demo seed: BSH ESG — Vision, Stakeholders, Standards, Policies
// Skeleton to mirror demo-seed.ts for the ESG Compliance Transformation scenario.
//
// TODO(fill-in): Standards sections are a meaningful subset of CSRD / LkSG.
// Extend further (or swap for real ESRS module text) before running compliance
// matching in a dress-rehearsal.

import type { IVision, IStakeholder } from '../models/Project';
import type { DemoStandard, DemoPolicy } from './demo-seed';

// ── Vision (Phase A — Architecture Vision) ──

export const DEMO_VISION_BSH: IVision = {
  scope:
    'Group-wide ESG Compliance Transformation covering 40 manufacturing sites, ~8,000 tier-1 suppliers, and 6 consumer brands (Bosch, Siemens, Gaggenau, Neff, Constructa, Thermador) across EU/NA/APAC.',
  visionStatement:
    'Establish a single source of truth for ESG data that delivers auditable CSRD reporting from Q1 2026 and scales to LkSG, CSDDD, EU Taxonomy, and SBTi net-zero commitments — without consultant dependency.',
  principles: [
    'Single source of truth for every ESG metric',
    'Complete audit trail on every data point — no Excel in the reporting path',
    'Supplier self-service to offload the central team',
    'Automated evidence via sensors and system APIs where possible',
    'Human-in-the-loop for materiality and judgment calls',
    'Cloud-native, API-first on Azure EU-Central (GDPR boundary)',
    'Compliance by design, not by post-hoc cleanup',
  ],
  drivers: [
    'CSRD first mandatory report FY2025 — published Q1 2026, external assurance mandatory',
    'LkSG enforcement since 2024 with extended reporting scope in 2025',
    'CSDDD phased introduction from 2027 — civil liability exposure',
    'EU Taxonomy pressure from investors + ESG rating agencies (MSCI, Sustainalytics, CDP)',
    'SBTi 1.5°C commitment: Scope 1+2 -50% by 2030 (2021 baseline), net-zero 2045',
    'Current reporting effort 18,000 person-hours/year — not sustainable',
  ],
  goals: [
    'Auditable CSRD-compliant reporting by Q1 2026',
    'Scope 1+2 emissions -50% by 2030 vs. 2021 baseline',
    'Verified Scope 3 baseline for downstream product use by end of 2026',
    '95% of tier-1 supplier spend covered by due-diligence assessment by end of 2026',
    '80% of ESG data collection automated (from ~30% today)',
    'Annual ESG reporting effort reduced from 18,000 to under 6,000 person-hours',
  ],
};

// ── Stakeholders ──

export const DEMO_STAKEHOLDERS_BSH: IStakeholder[] = [
  {
    id: 'bsh-stk-board',
    name: 'Executive Board',
    role: 'Program Sponsor',
    stakeholderType: 'c_level',
    interests: ['Regulatory exposure reduction', 'Reputation', 'Capital allocation to transformation'],
    influence: 'high',
    attitude: 'champion',
  },
  {
    id: 'bsh-stk-cfo',
    name: 'Matthias Kühn',
    role: 'Chief Financial Officer',
    stakeholderType: 'c_level',
    interests: ['Audit readiness', 'Cost discipline — €25M cap', 'Taxonomy-aligned reporting'],
    influence: 'high',
    attitude: 'champion',
  },
  {
    id: 'bsh-stk-cso',
    name: 'Dr. Anja Möller',
    role: 'Chief Sustainability Officer',
    stakeholderType: 'c_level',
    interests: ['Net-zero trajectory', 'Materiality assessment', 'Credible external assurance'],
    influence: 'high',
    attitude: 'champion',
  },
  {
    id: 'bsh-stk-procurement',
    name: 'Head of Group Procurement',
    role: 'Supplier Master Data Owner',
    stakeholderType: 'business_unit',
    interests: ['Supplier risk scoring', 'LkSG/CSDDD implementation', 'Ariba integration quality'],
    influence: 'high',
    attitude: 'supporter',
  },
  {
    id: 'bsh-stk-hr',
    name: 'Head of Group HR',
    role: 'Human Rights Grievance Workflow Owner',
    stakeholderType: 'business_unit',
    interests: ['Grievance case handling', 'Worker rights coverage', 'Data privacy of complainants'],
    influence: 'medium',
    attitude: 'supporter',
  },
  {
    id: 'bsh-stk-legal',
    name: 'Group Legal — Regulatory',
    role: 'Regulatory Interpretation',
    stakeholderType: 'business_unit',
    interests: ['ESRS applicability', 'CSDDD civil liability', 'Audit defensibility'],
    influence: 'high',
    attitude: 'neutral',
  },
  {
    id: 'bsh-stk-plant',
    name: 'Factory Plant Managers (40 plants)',
    role: 'Scope 1 Data Producer',
    stakeholderType: 'it_ops',
    interests: ['Zero production disruption', 'Reasonable data-collection burden', 'Local autonomy'],
    influence: 'medium',
    attitude: 'critic',
  },
  {
    id: 'bsh-stk-auditor',
    name: 'Deloitte (External Auditor)',
    role: 'CSRD Assurance Advisor',
    stakeholderType: 'external',
    interests: ['Evidence quality', 'Control design', 'Materiality methodology'],
    influence: 'high',
    attitude: 'neutral',
  },
  {
    id: 'bsh-stk-ir',
    name: 'Investor Relations',
    role: 'ESG Rating Liaison',
    stakeholderType: 'external',
    interests: ['MSCI / Sustainalytics / CDP scores', 'Taxonomy % disclosure', 'Investor narrative'],
    influence: 'medium',
    attitude: 'supporter',
  },
  {
    id: 'bsh-stk-it',
    name: 'Group CIO',
    role: 'Platform Owner',
    stakeholderType: 'it_ops',
    interests: ['Azure EU-Central boundary', 'SAP landscape stability', 'No new legacy debt'],
    influence: 'high',
    attitude: 'supporter',
  },
];

// ── Compliance Standards (CSRD + LkSG subset) ──

export const DEMO_STANDARDS_BSH: DemoStandard[] = [
  {
    name: 'EU CSRD — ESRS Core Subset',
    version: '2024',
    type: 'custom',
    description:
      'Corporate Sustainability Reporting Directive — European Sustainability Reporting Standards subset: general disclosures, climate change, own workforce, workers in value chain, business conduct.',
    sections: [
      { id: 'esrs-1', title: 'General Requirements', number: 'ESRS 1', content: 'Undertakings shall report on sustainability matters applying the concept of double materiality covering impact and financial materiality.', level: 1 },
      { id: 'esrs-2', title: 'General Disclosures', number: 'ESRS 2', content: 'Undertakings shall disclose the basis for preparation of the sustainability statement, including scope of consolidation, value chain coverage, and use of estimates.', level: 1 },
      { id: 'esrs-e1', title: 'Climate Change', number: 'ESRS E1', content: 'Disclose Scope 1, Scope 2 (location-based + market-based), and Scope 3 gross emissions; climate transition plan; and targets including alignment with 1.5°C pathway.', level: 1 },
      { id: 'esrs-s1', title: 'Own Workforce', number: 'ESRS S1', content: 'Disclose working conditions, equal treatment and opportunities, and other work-related rights including health and safety (TRIR, LTIR) and training hours.', level: 1 },
      { id: 'esrs-s2', title: 'Workers in the Value Chain', number: 'ESRS S2', content: 'Disclose policies, processes, and metrics for due diligence covering workers in the upstream and downstream value chain.', level: 1 },
      { id: 'esrs-g1', title: 'Business Conduct', number: 'ESRS G1', content: 'Disclose corporate culture, anti-corruption, anti-bribery, protection of whistleblowers, and management of relationships with suppliers including payment practices.', level: 1 },
    ],
  },
  {
    name: 'LkSG (DE Supply Chain Due Diligence Act)',
    version: '2024',
    type: 'custom',
    description:
      'German Supply Chain Due Diligence Act — human rights and environmental due-diligence obligations across direct and indirect suppliers.',
    sections: [
      { id: 'lksg-4', title: 'Risk Management', number: '§4', content: 'Enterprises shall establish an appropriate and effective risk management system to comply with human rights and environmental due-diligence obligations.', level: 1 },
      { id: 'lksg-5', title: 'Risk Analysis', number: '§5', content: 'Enterprises shall conduct a risk analysis to identify human rights and environmental risks in their own business area and at direct suppliers at least once per year.', level: 1 },
      { id: 'lksg-7', title: 'Remedial Action', number: '§7', content: 'Enterprises shall immediately take appropriate remedial action to prevent, end, or minimize the extent of a violation in their own business area.', level: 1 },
      { id: 'lksg-8', title: 'Complaints Procedure', number: '§8', content: 'Enterprises shall establish an appropriate complaints procedure that enables people to point out human rights and environmental risks and violations.', level: 1 },
      { id: 'lksg-9', title: 'Indirect Suppliers', number: '§9', content: 'Upon substantiated knowledge of a possible violation at indirect suppliers, enterprises shall conduct a risk analysis and take appropriate preventive measures.', level: 1 },
      { id: 'lksg-10', title: 'Documentation and Reporting', number: '§10', content: 'Enterprises shall document fulfillment of due-diligence obligations continuously and prepare an annual report published on their website.', level: 1 },
    ],
  },
];

// ── Governance Policies ──

export const DEMO_POLICIES_BSH: DemoPolicy[] = [
  {
    name: 'ESG Data Must Reside in EU',
    description: 'All applications handling ESG data must be hosted in EU regions (GDPR + data-sovereignty constraint).',
    category: 'compliance',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['application_component', 'technology_component'], layers: ['application', 'technology'] },
    rules: [
      { field: 'metadata.technology', operator: 'contains', value: 'EU', message: 'ESG application/tech must document EU hosting region' },
    ],
  },
  {
    name: 'Supplier Data Sources Require Owner',
    description: 'Every supplier-facing application must name a business owner for LkSG accountability.',
    category: 'compliance',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['application_component'], layers: ['application'] },
    rules: [
      { field: 'metadata.owner', operator: 'exists', value: true, message: 'Supplier app must document owner (LkSG §4)' },
    ],
  },
  {
    name: 'Audit Trail on Regulatory Reports',
    description: 'Any component feeding CSRD or LkSG reports must maintain an immutable audit trail.',
    category: 'compliance',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['application_component'], layers: ['application'] },
    rules: [
      { field: 'description', operator: 'contains', value: 'audit trail', message: 'Report-path apps must document audit-trail handling' },
    ],
  },
  {
    name: 'No Excel in the Reporting Path',
    description: 'Post-2026: ESG data pipelines must not rely on spreadsheet-based collection for mandatory-report elements.',
    category: 'data',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['business_process', 'application_component'], layers: ['business', 'application'] },
    rules: [
      { field: 'status', operator: 'not_equals', value: 'transitional', message: 'Transitional spreadsheet-based processes must converge to target state by Q1 2026' },
    ],
  },
  {
    name: 'Critical ESG Capabilities Require Maturity ≥ 3',
    description: 'CSRD and LkSG-critical capabilities must reach maturity level 3 or higher before go-live.',
    category: 'architecture',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['business_capability'], layers: ['business'] },
    rules: [
      { field: 'riskLevel', operator: 'equals', value: 'critical', message: 'Critical ESG capability' },
      { field: 'maturityLevel', operator: 'gte', value: 3, message: 'Critical ESG capability must reach maturity ≥ 3 before CSRD go-live' },
    ],
  },
  {
    name: 'BI Layer Must Remain SAP Analytics Cloud',
    description: 'Architecture constraint — executive reporting must remain on SAP Analytics Cloud per stakeholder mandate.',
    category: 'architecture',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['application_component'], layers: ['application'] },
    rules: [
      { field: 'description', operator: 'contains', value: 'BI', message: 'New BI layers are blocked — feed SAC' },
    ],
  },
];
