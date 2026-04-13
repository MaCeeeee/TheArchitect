// Demo seed: Vision, Stakeholders, Standards, Policies
// Seeded alongside architecture elements to populate every feature panel

import type { IVision, IStakeholder } from '../models/Project';

// ── Vision (Phase A — Architecture Vision) ──

export const DEMO_VISION: IVision = {
  scope: 'Enterprise-wide digital banking transformation covering retail, commercial, and wealth management divisions across 12 countries in the EU/EEA region.',
  visionStatement: 'Transform our legacy banking platform into a cloud-native, API-first ecosystem that delivers personalized financial services in real-time while meeting Basel III, PSD2, and DORA regulatory requirements by Q4 2027.',
  principles: [
    'API-First: Every capability must be accessible via a versioned REST/gRPC API',
    'Security by Design: Zero-trust architecture with encryption at rest and in transit',
    'Cloud-Native: Containerized microservices on Kubernetes with GitOps deployment',
    'Data-Driven: Real-time analytics and ML models inform every business decision',
    'Regulatory Compliance: Architecture must satisfy DORA, PSD2, Basel III, and GDPR from day one',
    'Customer Centricity: Sub-200ms response times, 99.99% availability for customer-facing services',
  ],
  drivers: [
    'Regulatory pressure: DORA compliance deadline Q1 2025, PSD2 open banking mandate',
    'Customer expectations: 73% of retail customers demand real-time payment visibility',
    'Cost reduction: Legacy mainframe maintenance costs €4.2M/yr — 3x cloud-native equivalent',
    'Competitive threat: Neobanks capturing 15% market share in under-35 demographic',
    'Operational risk: 3 critical incidents in past 12 months traced to monolithic architecture',
  ],
  goals: [
    'Reduce time-to-market for new financial products from 9 months to 6 weeks',
    'Achieve 99.99% uptime for payment processing and account services',
    'Cut infrastructure costs by 40% through cloud migration and auto-scaling',
    'Enable real-time fraud detection with <50ms decision latency',
    'Full DORA compliance across all critical ICT services',
    'Launch unified digital channel (web + mobile + chatbot) by Q2 2027',
  ],
};

// ── Stakeholders ──

export const DEMO_STAKEHOLDERS: IStakeholder[] = [
  {
    id: 'stk-cto',
    name: 'Dr. Elena Fischer',
    role: 'Chief Technology Officer',
    stakeholderType: 'c_level',
    interests: ['Cloud migration ROI', 'Engineering velocity', 'Technical debt reduction'],
    influence: 'high',
    attitude: 'champion',
  },
  {
    id: 'stk-cro',
    name: 'Marcus van der Berg',
    role: 'Chief Risk Officer',
    stakeholderType: 'c_level',
    interests: ['DORA compliance', 'Operational resilience', 'Audit trail completeness'],
    influence: 'high',
    attitude: 'supporter',
  },
  {
    id: 'stk-head-retail',
    name: 'Sophie Leclerc',
    role: 'Head of Retail Banking',
    stakeholderType: 'business_unit',
    interests: ['Customer experience', 'Digital channel launch', 'Product time-to-market'],
    influence: 'high',
    attitude: 'champion',
  },
  {
    id: 'stk-head-compliance',
    name: 'Thomas Reiter',
    role: 'Head of Compliance',
    stakeholderType: 'business_unit',
    interests: ['Regulatory reporting accuracy', 'Audit readiness', 'Policy enforcement'],
    influence: 'medium',
    attitude: 'neutral',
  },
  {
    id: 'stk-lead-platform',
    name: 'Anika Johansson',
    role: 'Platform Engineering Lead',
    stakeholderType: 'it_ops',
    interests: ['Kubernetes adoption', 'CI/CD pipeline', 'Observability coverage'],
    influence: 'medium',
    attitude: 'champion',
  },
  {
    id: 'stk-lead-data',
    name: 'Raj Patel',
    role: 'Chief Data Officer',
    stakeholderType: 'data_team',
    interests: ['Data mesh architecture', 'ML model governance', 'Real-time analytics'],
    influence: 'medium',
    attitude: 'supporter',
  },
  {
    id: 'stk-auditor',
    name: 'Karin Schwarz',
    role: 'External Auditor (BaFin)',
    stakeholderType: 'external',
    interests: ['Basel III compliance', 'Incident response documentation', 'System resilience evidence'],
    influence: 'high',
    attitude: 'neutral',
  },
  {
    id: 'stk-vendor',
    name: 'CloudNova Solutions',
    role: 'Cloud Migration Partner',
    stakeholderType: 'external',
    interests: ['Migration timeline', 'Infrastructure spend', 'Multi-year contract'],
    influence: 'low',
    attitude: 'supporter',
  },
];

// ── Compliance Standards (ISO 27001 subset) ──

export interface DemoStandard {
  name: string;
  version: string;
  type: 'iso' | 'aspice' | 'togaf' | 'custom';
  description: string;
  sections: { id: string; title: string; number: string; content: string; level: number }[];
}

export const DEMO_STANDARDS: DemoStandard[] = [
  {
    name: 'ISO 27001:2022',
    version: '2022',
    type: 'iso',
    description: 'Information security management system requirements — subset of controls relevant to digital banking platform.',
    sections: [
      { id: 'iso-5.1', title: 'Information Security Policies', number: '5.1', content: 'A set of policies for information security shall be defined, approved by management, published, and communicated to employees and relevant external parties.', level: 1 },
      { id: 'iso-5.2', title: 'Information Security Roles and Responsibilities', number: '5.2', content: 'Information security roles and responsibilities shall be defined and allocated. Conflicting duties shall be segregated to reduce opportunities for unauthorized modification or misuse.', level: 1 },
      { id: 'iso-6.1', title: 'Screening', number: '6.1', content: 'Background verification checks on all candidates for employment shall be carried out in accordance with relevant laws, regulations, and ethics.', level: 1 },
      { id: 'iso-8.1', title: 'User Endpoint Devices', number: '8.1', content: 'Information stored on, processed by, or accessible via user endpoint devices shall be protected. Policies and procedures for mobile device management shall be established.', level: 1 },
      { id: 'iso-8.5', title: 'Secure Authentication', number: '8.5', content: 'Secure authentication technologies and procedures shall be established based on information access restrictions and the topic-specific policy on access control.', level: 1 },
      { id: 'iso-8.7', title: 'Protection Against Malware', number: '8.7', content: 'Protection against malware shall be implemented and supported by appropriate user awareness training.', level: 1 },
      { id: 'iso-8.9', title: 'Configuration Management', number: '8.9', content: 'Configurations, including security configurations, of hardware, software, services, and networks shall be established, documented, implemented, monitored, and reviewed.', level: 1 },
      { id: 'iso-8.15', title: 'Logging', number: '8.15', content: 'Logs that record activities, exceptions, faults, and other relevant events shall be produced, stored, protected, and analyzed.', level: 1 },
      { id: 'iso-8.24', title: 'Use of Cryptography', number: '8.24', content: 'Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.', level: 1 },
      { id: 'iso-8.25', title: 'Secure Development Life Cycle', number: '8.25', content: 'Rules for the secure development of software and systems shall be established and applied.', level: 1 },
    ],
  },
  {
    name: 'DORA (EU 2022/2554)',
    version: '2024',
    type: 'custom',
    description: 'Digital Operational Resilience Act — ICT risk management and operational resilience requirements for financial entities.',
    sections: [
      { id: 'dora-5', title: 'ICT Risk Management Framework', number: '5', content: 'Financial entities shall have in place an internal governance and control framework that ensures effective and prudent management of ICT risk.', level: 1 },
      { id: 'dora-6', title: 'ICT Systems and Tools', number: '6', content: 'Financial entities shall use and maintain updated ICT systems, protocols, and tools that are appropriate to the scale of operations and adequate to support critical functions.', level: 1 },
      { id: 'dora-9', title: 'Detection', number: '9', content: 'Financial entities shall have mechanisms to promptly detect anomalous activities, including ICT network performance issues and ICT-related incidents.', level: 1 },
      { id: 'dora-10', title: 'Response and Recovery', number: '10', content: 'Financial entities shall put in place a comprehensive ICT business continuity policy, including response and recovery plans addressing ICT-related incidents.', level: 1 },
      { id: 'dora-11', title: 'Backup and Restoration', number: '11', content: 'Financial entities shall maintain and regularly test ICT business continuity plans and ICT response and recovery plans with respect to backup and restoration.', level: 1 },
      { id: 'dora-15', title: 'ICT-Related Incident Reporting', number: '15', content: 'Financial entities shall classify ICT-related incidents and determine their impact based on criteria including geographic spread, duration, and data loss.', level: 1 },
      { id: 'dora-24', title: 'ICT Third-Party Risk', number: '24', content: 'Financial entities shall manage ICT third-party risk as an integral component of ICT risk within their ICT risk management framework.', level: 1 },
      { id: 'dora-26', title: 'Contractual Arrangements', number: '26', content: 'Contractual arrangements on the use of ICT services shall include at minimum service level descriptions, data processing locations, and provisions on availability and security.', level: 1 },
    ],
  },
];

// ── Governance Policies ──

export interface DemoPolicy {
  name: string;
  description: string;
  category: 'naming' | 'security' | 'compliance' | 'architecture' | 'data' | 'custom';
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  status: 'active' | 'draft';
  source: 'custom' | 'dora' | 'iso27001' | 'togaf';
  scope: { domains: string[]; elementTypes: string[]; layers: string[] };
  rules: { field: string; operator: string; value: unknown; message: string }[];
}

export const DEMO_POLICIES: DemoPolicy[] = [
  {
    name: 'Critical Services Must Have High Maturity',
    description: 'Any element with critical risk level must have maturity level >= 4 to ensure operational resilience.',
    category: 'architecture',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'dora',
    scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] },
    rules: [
      { field: 'riskLevel', operator: 'equals', value: 'critical', message: 'Element is critical risk' },
      { field: 'maturityLevel', operator: 'gte', value: 4, message: 'Critical elements must have maturity level >= 4' },
    ],
  },
  {
    name: 'All Services Must Have Error Rate < 5%',
    description: 'Application services must maintain error rates below 5% threshold per SLA requirements.',
    category: 'compliance',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: ['service', 'application'], layers: ['application'] },
    rules: [
      { field: 'errorRatePercent', operator: 'lt', value: 5, message: 'Error rate exceeds 5% SLA threshold' },
    ],
  },
  {
    name: 'Technology Components Require Owner Documentation',
    description: 'All technology layer components must have an owner defined in metadata for incident escalation.',
    category: 'architecture',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'togaf',
    scope: { domains: [], elementTypes: ['technology_component'], layers: ['technology'] },
    rules: [
      { field: 'metadata.owner', operator: 'exists', value: true, message: 'Technology component must have documented owner' },
    ],
  },
  {
    name: 'High Technical Debt Requires Transformation Plan',
    description: 'Elements with technical debt ratio > 0.4 must have an active transformation strategy other than retain.',
    category: 'architecture',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'technicalDebtRatio', operator: 'gt', value: 0.4, message: 'Technical debt ratio exceeds 40%' },
      { field: 'transformationStrategy', operator: 'not_equals', value: 'retain', message: 'High-debt elements must not have retain strategy' },
    ],
  },
  {
    name: 'Encryption Required for Data Services',
    description: 'Database and storage components must use encryption at rest per ISO 27001:2022 control 8.24.',
    category: 'security',
    severity: 'error',
    enabled: true,
    status: 'active',
    source: 'iso27001',
    scope: { domains: [], elementTypes: ['technology_component'], layers: ['technology'] },
    rules: [
      { field: 'description', operator: 'contains', value: 'database', message: 'Data services must document encryption practices per ISO 27001 8.24' },
    ],
  },
  {
    name: 'Customer-Facing Services Require 99.9% Availability',
    description: 'Services accessed by external users must target < 0.1% error rate for SLA compliance.',
    category: 'compliance',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'dora',
    scope: { domains: [], elementTypes: ['service', 'application'], layers: ['application'] },
    rules: [
      { field: 'userCount', operator: 'gt', value: 10000, message: 'High-traffic service' },
      { field: 'errorRatePercent', operator: 'lt', value: 0.1, message: 'Customer-facing services require < 0.1% error rate' },
    ],
  },
  {
    name: 'Naming Convention: Lowercase with Hyphens',
    description: 'All element names should follow kebab-case convention for API and infrastructure naming consistency.',
    category: 'naming',
    severity: 'info',
    enabled: true,
    status: 'draft',
    source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'name', operator: 'regex', value: '^[A-Z][a-zA-Z0-9 ]+$', message: 'Element name should be properly capitalized words' },
    ],
  },
  {
    name: 'DORA: ICT Third-Party Risk Assessment',
    description: 'Third-party technology dependencies must be documented with vendor information and SLA terms.',
    category: 'compliance',
    severity: 'warning',
    enabled: true,
    status: 'active',
    source: 'dora',
    scope: { domains: [], elementTypes: ['technology_component'], layers: ['technology'] },
    rules: [
      { field: 'metadata.technology', operator: 'exists', value: true, message: 'Technology stack must be documented for third-party risk assessment' },
    ],
  },
];
