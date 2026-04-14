import type { AgentPersona } from '@thearchitect/shared/src/types/simulation.types';

// Client-side fallback when the persona endpoint returns empty or errors.
// Mirrors server/src/services/mirofish/personas.ts — kept minimal (only the
// three DEFAULT_PERSONA_IDS used by the SimulationPanel auto-selection).
// If the server's preset list is expanded, add those ids here too.
export const FALLBACK_PRESET_PERSONAS: AgentPersona[] = [
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
    systemPromptSuffix: 'You are the CTO. You balance innovation against risk and push back on changes that fragment the architecture.',
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
    systemPromptSuffix: 'You are a Business Unit Lead. You push for fast delivery and cost savings, resist anything that slows velocity.',
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
    systemPromptSuffix: 'You are the IT Operations Manager. You block changes that threaten uptime and resist parallel migrations.',
  },
];
