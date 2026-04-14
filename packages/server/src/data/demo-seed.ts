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

// ── Pre-Computed MiroFish Simulation Run ──
// Cloud Migration scenario: CTO (champion) vs IT Ops (critic) with BU Lead supporter.
// Pre-seeded so the demo's Simulation tab shows a completed run without running live AI.

export const DEMO_SIMULATION_RUN = {
  name: 'Cloud Migration — Wave 1 (Demo)',
  status: 'completed' as const,
  scenarioType: 'cloud_migration' as const,
  totalTokensUsed: 14_320,
  totalDurationMs: 48_700,
  config: {
    maxRounds: 3,
    scenarioType: 'cloud_migration',
    name: 'Cloud Migration — Wave 1 (Demo)',
    scenarioDescription:
      'Migrate three target services (AI Scoring Engine, Mobile BFF, Workflow Engine) to Kubernetes with blue/green deploy. Target completion Q3 2026 within €1.8M budget.',
    targetElementIds: [
      'demo-app-ai-scoring-engine',
      'demo-app-mobile-bff',
      'demo-app-workflow-engine',
    ],
    agents: [
      {
        id: 'cto',
        name: 'CTO',
        stakeholderType: 'c_level',
        visibleLayers: ['strategy', 'business', 'information', 'application', 'technology'],
        visibleDomains: ['business', 'data', 'application', 'technology'],
        maxGraphDepth: 5,
        budgetConstraint: 2_000_000,
        riskThreshold: 'high',
        expectedCapacity: 8,
        roundToMonthFactor: 2,
        priorities: ['innovation', 'risk_reduction', 'digital_transformation'],
        systemPromptSuffix:
          'You are the CTO. You balance innovation against risk and push back on changes that fragment the architecture.',
      },
      {
        id: 'business_unit_lead',
        name: 'Business Unit Lead',
        stakeholderType: 'business_unit',
        visibleLayers: ['strategy', 'business'],
        visibleDomains: ['business'],
        maxGraphDepth: 3,
        budgetConstraint: 500_000,
        riskThreshold: 'medium',
        expectedCapacity: 5,
        roundToMonthFactor: 2,
        priorities: ['cost_reduction', 'process_efficiency', 'time_to_market'],
        systemPromptSuffix:
          'You are a Business Unit Lead. You push for fast delivery and cost savings, resist anything that slows velocity.',
      },
      {
        id: 'it_operations_manager',
        name: 'IT Operations Manager',
        stakeholderType: 'it_ops',
        visibleLayers: ['application', 'technology'],
        visibleDomains: ['application', 'technology'],
        maxGraphDepth: 4,
        budgetConstraint: 800_000,
        riskThreshold: 'low',
        expectedCapacity: 4,
        roundToMonthFactor: 2,
        priorities: ['stability', 'security', 'maintenance_cost'],
        systemPromptSuffix:
          'You are the IT Operations Manager. You block changes that threaten uptime and resist parallel migrations.',
      },
    ],
  },
  rounds: [
    {
      roundNumber: 1,
      agentTurns: [
        {
          agentPersonaId: 'cto',
          agentName: 'CTO',
          position: 'approve',
          reasoning:
            'The AI Scoring Engine and Mobile BFF are greenfield-friendly and have ML governance already in place via MLflow. Cloud migration unlocks auto-scaling for fraud detection latency (<50ms target). I support parallel migration of all three with staged rollout.',
          proposedActions: [
            {
              type: 'modify_status',
              targetElementId: 'demo-app-ai-scoring-engine',
              targetElementName: 'AI Scoring Engine',
              changes: { status: 'target' },
              reasoning: 'Cloud-native ML inference required for sub-50ms fraud decisions.',
              estimatedCostImpact: 180_000,
              estimatedRiskImpact: -3,
            },
            {
              type: 'modify_status',
              targetElementId: 'demo-app-mobile-bff',
              targetElementName: 'Mobile BFF',
              changes: { status: 'target' },
              reasoning: 'Edge caching via CloudFront reduces p99 latency by ~40%.',
              estimatedCostImpact: 90_000,
              estimatedRiskImpact: -2,
            },
          ],
          validatedActions: [
            {
              type: 'modify_status',
              targetElementId: 'demo-app-ai-scoring-engine',
              targetElementName: 'AI Scoring Engine',
              changes: { status: 'target' },
              reasoning: 'Cloud-native ML inference required for sub-50ms fraud decisions.',
              estimatedCostImpact: 180_000,
              estimatedRiskImpact: -3,
            },
            {
              type: 'modify_status',
              targetElementId: 'demo-app-mobile-bff',
              targetElementName: 'Mobile BFF',
              changes: { status: 'target' },
              reasoning: 'Edge caching via CloudFront reduces p99 latency by ~40%.',
              estimatedCostImpact: 90_000,
              estimatedRiskImpact: -2,
            },
          ],
          rejectedActions: [],
          llmTokensUsed: 2_140,
          durationMs: 7_800,
        },
        {
          agentPersonaId: 'business_unit_lead',
          agentName: 'Business Unit Lead',
          position: 'approve',
          reasoning:
            'Faster time-to-market on mobile features is my top priority. Mobile BFF migration directly unblocks the Q2 digital channels launch. I back the CTO on parallel migration — sequential rollout would push launch to Q4.',
          proposedActions: [
            {
              type: 'approve_change',
              targetElementId: 'demo-app-mobile-bff',
              targetElementName: 'Mobile BFF',
              reasoning: 'Unblocks Q2 2027 digital channels launch.',
              estimatedCostImpact: 0,
              estimatedRiskImpact: 0,
            },
          ],
          validatedActions: [
            {
              type: 'approve_change',
              targetElementId: 'demo-app-mobile-bff',
              targetElementName: 'Mobile BFF',
              reasoning: 'Unblocks Q2 2027 digital channels launch.',
              estimatedCostImpact: 0,
              estimatedRiskImpact: 0,
            },
          ],
          rejectedActions: [],
          llmTokensUsed: 1_620,
          durationMs: 5_200,
        },
        {
          agentPersonaId: 'it_operations_manager',
          agentName: 'IT Operations Manager',
          position: 'reject',
          reasoning:
            'Parallel migration of three stateful services violates our change freeze policy. Workflow Engine has active production traffic with 12M records — its migration window needs dedicated observability. I block parallel execution.',
          proposedActions: [
            {
              type: 'block_change',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              reasoning: 'Stateful service with 12M records — requires sequential migration window.',
              estimatedCostImpact: 0,
              estimatedRiskImpact: 4,
            },
          ],
          validatedActions: [
            {
              type: 'block_change',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              reasoning: 'Stateful service with 12M records — requires sequential migration window.',
              estimatedCostImpact: 0,
              estimatedRiskImpact: 4,
            },
          ],
          rejectedActions: [],
          llmTokensUsed: 1_980,
          durationMs: 6_500,
        },
      ],
      emergenceEvents: [
        {
          type: 'coalition',
          description: 'CTO and Business Unit Lead aligned on parallel migration for AI Scoring + Mobile BFF.',
          involvedAgents: ['cto', 'business_unit_lead'],
          severity: 0.3,
          round: 1,
        },
      ],
      fatigueSnapshot: {
        globalIndex: 0.22,
        rating: 'green',
        perAgent: { cto: 0.18, business_unit_lead: 0.14, it_operations_manager: 0.34 },
      },
    },
    {
      roundNumber: 2,
      agentTurns: [
        {
          agentPersonaId: 'cto',
          agentName: 'CTO',
          position: 'modify',
          reasoning:
            'IT Ops has a valid point on Workflow Engine. I propose a compromise: AI Scoring + Mobile BFF migrate in Wave 1 (parallel, Q2 2026), Workflow Engine moves to Wave 2 (Q3 2026) with dedicated rollback window. This preserves velocity while respecting ops stability.',
          proposedActions: [
            {
              type: 'modify_status',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              changes: { status: 'target', transformationStrategy: 'rehost' },
              reasoning: 'Defer to Wave 2 with dedicated migration window — compromise with IT Ops.',
              estimatedCostImpact: 210_000,
              estimatedRiskImpact: -1,
            },
          ],
          validatedActions: [
            {
              type: 'modify_status',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              changes: { status: 'target', transformationStrategy: 'rehost' },
              reasoning: 'Defer to Wave 2 with dedicated migration window — compromise with IT Ops.',
              estimatedCostImpact: 210_000,
              estimatedRiskImpact: -1,
            },
          ],
          rejectedActions: [],
          llmTokensUsed: 2_260,
          durationMs: 7_400,
        },
        {
          agentPersonaId: 'business_unit_lead',
          agentName: 'Business Unit Lead',
          position: 'approve',
          reasoning:
            'Wave 1 still unblocks the Q2 launch. Workflow Engine moving to Wave 2 is acceptable as long as it lands before Q3 2026. I approve the compromise.',
          proposedActions: [],
          validatedActions: [],
          rejectedActions: [],
          llmTokensUsed: 1_180,
          durationMs: 3_900,
        },
        {
          agentPersonaId: 'it_operations_manager',
          agentName: 'IT Operations Manager',
          position: 'approve',
          reasoning:
            'Sequential Workflow Engine migration with a dedicated window meets my stability requirements. I approve the revised plan provided we add pre-migration load testing and documented rollback procedures.',
          proposedActions: [
            {
              type: 'request_budget',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              reasoning: 'Additional €40K for load testing + rollback automation.',
              estimatedCostImpact: 40_000,
              estimatedRiskImpact: -2,
            },
          ],
          validatedActions: [
            {
              type: 'request_budget',
              targetElementId: 'demo-app-workflow-engine',
              targetElementName: 'Workflow Engine',
              reasoning: 'Additional €40K for load testing + rollback automation.',
              estimatedCostImpact: 40_000,
              estimatedRiskImpact: -2,
            },
          ],
          rejectedActions: [],
          llmTokensUsed: 1_640,
          durationMs: 5_100,
        },
      ],
      emergenceEvents: [
        {
          type: 'compromise',
          description: 'CTO split Wave 1/Wave 2 to address IT Ops concerns; consensus reached.',
          involvedAgents: ['cto', 'it_operations_manager', 'business_unit_lead'],
          severity: 0.55,
          round: 2,
        },
        {
          type: 'consensus',
          description: 'All three agents aligned on phased migration plan with observability budget.',
          involvedAgents: ['cto', 'business_unit_lead', 'it_operations_manager'],
          severity: 0.8,
          round: 2,
        },
      ],
      fatigueSnapshot: {
        globalIndex: 0.28,
        rating: 'green',
        perAgent: { cto: 0.24, business_unit_lead: 0.16, it_operations_manager: 0.42 },
      },
    },
  ],
  result: {
    outcome: 'consensus' as const,
    summary:
      'Phased cloud migration approved: Wave 1 (AI Scoring + Mobile BFF, Q2 2026, €270K) parallel, Wave 2 (Workflow Engine, Q3 2026, €250K incl. observability). Total €520K with -5 aggregate risk reduction. Consensus reached in 2 rounds after IT Ops blocking concern resolved via wave split.',
    riskDelta: {
      'demo-app-ai-scoring-engine': -3,
      'demo-app-mobile-bff': -2,
      'demo-app-workflow-engine': -3,
    },
    costDelta: {
      'demo-app-ai-scoring-engine': 180_000,
      'demo-app-mobile-bff': 90_000,
      'demo-app-workflow-engine': 250_000,
    },
    recommendedActions: [
      {
        type: 'modify_status',
        targetElementId: 'demo-app-ai-scoring-engine',
        targetElementName: 'AI Scoring Engine',
        changes: { status: 'target', transformationStrategy: 'rebuild' },
        reasoning: 'Wave 1 cloud-native rebuild on K8s + MLflow.',
        estimatedCostImpact: 180_000,
        estimatedRiskImpact: -3,
      },
      {
        type: 'modify_status',
        targetElementId: 'demo-app-mobile-bff',
        targetElementName: 'Mobile BFF',
        changes: { status: 'target', transformationStrategy: 'replatform' },
        reasoning: 'Wave 1 replatform with CloudFront edge caching.',
        estimatedCostImpact: 90_000,
        estimatedRiskImpact: -2,
      },
      {
        type: 'modify_status',
        targetElementId: 'demo-app-workflow-engine',
        targetElementName: 'Workflow Engine',
        changes: { status: 'target', transformationStrategy: 'rehost' },
        reasoning: 'Wave 2 rehost with load testing + rollback automation.',
        estimatedCostImpact: 250_000,
        estimatedRiskImpact: -3,
      },
    ],
    fatigue: {
      globalIndex: 0.28,
      rating: 'green' as const,
      perAgent: [
        {
          agentId: 'cto',
          agentName: 'CTO',
          fatigueIndex: 0.24,
          concurrencyLoad: 0.30,
          negotiationDrag: 0.22,
          constraintPressure: 0.20,
          bottleneckElements: [],
          projectedDelayMonths: 0.5,
        },
        {
          agentId: 'business_unit_lead',
          agentName: 'Business Unit Lead',
          fatigueIndex: 0.16,
          concurrencyLoad: 0.20,
          negotiationDrag: 0.15,
          constraintPressure: 0.12,
          bottleneckElements: [],
          projectedDelayMonths: 0.2,
        },
        {
          agentId: 'it_operations_manager',
          agentName: 'IT Operations Manager',
          fatigueIndex: 0.42,
          concurrencyLoad: 0.55,
          negotiationDrag: 0.40,
          constraintPressure: 0.32,
          bottleneckElements: ['demo-app-workflow-engine'],
          projectedDelayMonths: 1.4,
        },
      ],
      perElement: [
        {
          elementId: 'demo-app-workflow-engine',
          elementName: 'Workflow Engine',
          negotiationDrag: 0.40,
          involvedAgents: ['cto', 'it_operations_manager'],
          conflictRounds: 1,
          projectedDelayMonths: 1.4,
        },
      ],
      totalProjectedDelayMonths: 2.1,
      budgetAtRisk: 40_000,
      recommendation:
        'IT Ops fatigue (0.42) is the watchpoint — Workflow Engine migration should get a dedicated change-freeze window and full rollback drill before Wave 2 execution. Otherwise plan is healthy.',
    },
    emergenceMetrics: {
      totalInteractions: 6,
      deadlockCount: 0,
      consensusScore: 0.83,
      fatigueIndex: 0.28,
      fatigueRating: 'green' as const,
      avgRoundsToConsensus: 2,
      blockedHallucinations: 0,
      totalProjectedDelayMonths: 2.1,
      budgetAtRisk: 40_000,
    },
  },
};
