/**
 * Plain-language descriptions for each sidebar section.
 * Shown in SectionHeader components to help users understand
 * WHEN and WHY to use each feature.
 * All text in English — no TOGAF jargon without explanation.
 */

export const SECTION_DESCRIPTIONS: Record<string, { title: string; description: string; phase?: string }> = {
  // Envision (Phase A)
  envision: {
    title: 'Architecture Vision',
    description: 'Define what this project aims to achieve, who\'s involved, and which principles apply.',
    phase: 'Phase A',
  },

  // Explorer (Phases B-D)
  explorer: {
    title: 'Architecture Explorer',
    description: 'Your architecture at a glance. Elements organized by layer — click to select on the 3D canvas.',
    phase: 'Phases B-D',
  },

  // Comply sections (Phase E+)
  pipeline: {
    title: 'Compliance Pipeline',
    description: 'Track each compliance standard\'s journey — from upload to audit-ready.',
    phase: 'Phase E',
  },
  standards: {
    title: 'Standards',
    description: 'Upload industry standards (ISO 27001, SOC 2, DORA) to check your architecture against them.',
    phase: 'Phase E',
  },
  matrix: {
    title: 'Compliance Matrix',
    description: 'See how your architecture maps to compliance requirements. Green = covered, Red = gaps.',
    phase: 'Phase E',
  },
  remediate: {
    title: 'Gap Remediation',
    description: 'The system identified gaps in your compliance. Review AI-suggested fixes to close them.',
    phase: 'Phase E',
  },
  policies: {
    title: 'Policy Drafts',
    description: 'AI-generated governance policies based on your mapped standards. Review and approve them.',
    phase: 'Phase G',
  },
  elements: {
    title: 'Suggested Elements',
    description: 'AI-suggested architecture elements to fill compliance gaps. Accept to add them to your canvas.',
    phase: 'Phase E',
  },
  approvals: {
    title: 'Approvals',
    description: 'Pending policy and architecture decisions that need your approval before taking effect.',
    phase: 'Phase G',
  },
  dashboard: {
    title: 'Compliance Dashboard',
    description: 'Real-time overview of policy violations, compliance score, and governance health.',
    phase: 'Phase G',
  },
  'policy-manager': {
    title: 'Policy Manager',
    description: 'View, edit, enable, or disable governance policies. Configure rules and severity levels.',
    phase: 'Phase G',
  },
  'audit-trail': {
    title: 'Audit Trail',
    description: 'Complete history of who changed what, when, and why in your architecture.',
    phase: 'Phase H',
  },
  progress: {
    title: 'Compliance Progress',
    description: 'Track compliance snapshots over time. Compare how your coverage improves across audit cycles.',
    phase: 'Phase H',
  },
  audit: {
    title: 'Audit Readiness',
    description: 'Create and manage audit checklists. Prepare evidence for compliance reviews.',
    phase: 'Phase H',
  },

  // Analyze sections (Phase F+)
  risk: {
    title: 'Risk Analysis',
    description: 'Identify which parts of your architecture carry the most risk based on maturity, dependencies, and gaps.',
    phase: 'Phase F',
  },
  impact: {
    title: 'Impact Analysis',
    description: 'Understand how changes to one element ripple through dependencies in your architecture.',
    phase: 'Phase F',
  },
  cost: {
    title: 'Cost Analysis',
    description: 'Track total cost of ownership, optimize spending, and compare cost scenarios.',
    phase: 'Phase F',
  },
  monte: {
    title: 'Monte Carlo Simulation',
    description: 'Run thousands of simulations to understand the range of possible cost and timeline outcomes.',
    phase: 'Phase F',
  },
  scenarios: {
    title: 'Scenario Comparison',
    description: 'Create "what-if" scenarios to compare alternative architecture decisions side by side.',
    phase: 'Phase F',
  },
  capacity: {
    title: 'Capacity Planning',
    description: 'Estimate whether your team and infrastructure can handle planned architecture changes.',
    phase: 'Phase F',
  },
  roadmap: {
    title: 'Transformation Roadmap',
    description: 'Plan the migration path from current to target architecture with timelines and milestones.',
    phase: 'Phase F',
  },
  portfolio: {
    title: 'Portfolio Management',
    description: 'Manage lifecycle, criticality, and ownership of all architecture elements in one view.',
    phase: 'Phase G',
  },
  integrations: {
    title: 'Integrations',
    description: 'Connect external tools (JIRA, ServiceNow, SAP) to sync architecture data automatically.',
    phase: 'Phase G',
  },

  // Other
  architect: {
    title: 'TOGAF Reference',
    description: 'Browse the TOGAF 10 ADM framework, architecture patterns, and reusable templates.',
  },
  copilot: {
    title: 'AI Copilot',
    description: 'Ask questions about your architecture, get suggestions, and automate repetitive tasks.',
  },
};
