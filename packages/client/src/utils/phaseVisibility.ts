import type { JourneyPhase } from '../stores/journeyStore';

/**
 * Phase-gated visibility mapping for progressive disclosure.
 * Controls which sidebar tabs and sub-sections are visible at each TOGAF ADM phase.
 *
 * Phase 1 (A): Architecture Vision    → envision, copilot
 * Phase 2 (B-D): Architecture Def.    → envision, explorer, copilot, architect
 * Phase 3 (E): Opportunities          → explorer, comply (subset), copilot, architect
 * Phase 4 (F): Migration Planning     → explorer, comply, analyze, copilot, architect
 * Phase 5 (G): Impl. Governance       → explorer, comply, analyze, copilot, architect
 * Phase 6 (H): Change Management      → all
 */

const PHASE_TABS: Record<JourneyPhase, string[]> = {
  1: ['envision', 'copilot'],
  2: ['envision', 'explorer', 'architect', 'copilot'],
  3: ['explorer', 'comply', 'architect', 'copilot'],
  4: ['explorer', 'comply', 'analyze', 'architect', 'copilot'],
  5: ['explorer', 'comply', 'analyze', 'architect', 'copilot'],
  6: ['envision', 'explorer', 'comply', 'analyze', 'architect', 'copilot'],
};

// Compliance panel sub-sections visible per phase
const COMPLY_SECTIONS: Record<JourneyPhase, string[]> = {
  1: [],
  2: [],
  3: ['pipeline', 'standards', 'matrix', 'remediate'],
  4: ['pipeline', 'standards', 'matrix', 'remediate', 'policies', 'elements', 'roadmap'],
  5: ['pipeline', 'standards', 'matrix', 'remediate', 'policies', 'elements', 'roadmap', 'approvals', 'dashboard', 'policy-manager'],
  6: ['pipeline', 'standards', 'matrix', 'remediate', 'policies', 'elements', 'roadmap', 'approvals', 'dashboard', 'policy-manager', 'progress', 'audit', 'audit-trail'],
};

// Analytics panel sub-sections visible per phase
const ANALYZE_SECTIONS: Record<JourneyPhase, string[]> = {
  1: [],
  2: [],
  3: [],
  4: ['dashboard', 'risk', 'impact', 'cost', 'monte', 'scenarios', 'capacity', 'roadmap'],
  5: ['dashboard', 'risk', 'impact', 'cost', 'monte', 'scenarios', 'capacity', 'roadmap', 'portfolio', 'integrations'],
  6: ['dashboard', 'risk', 'impact', 'cost', 'monte', 'scenarios', 'capacity', 'roadmap', 'portfolio', 'integrations'],
};

/**
 * Get visible sidebar tabs for the current phase.
 * When showAll is true, returns all tabs.
 */
export function getVisibleTabs(phase: JourneyPhase, showAll: boolean): string[] {
  if (showAll) return ['envision', 'explorer', 'comply', 'analyze', 'architect', 'copilot'];
  return PHASE_TABS[phase] || PHASE_TABS[6];
}

/**
 * Get visible sub-sections for a given sidebar panel and phase.
 * When showAll is true, returns all sections (empty array = no filtering).
 */
export function getVisibleSections(panel: string, phase: JourneyPhase, showAll: boolean): string[] | null {
  if (showAll) return null; // null = show all, no filtering

  switch (panel) {
    case 'comply':
      return COMPLY_SECTIONS[phase] || COMPLY_SECTIONS[6];
    case 'analyze':
      return ANALYZE_SECTIONS[phase] || ANALYZE_SECTIONS[6];
    default:
      return null;
  }
}

/**
 * Check if a specific toolbar action should be visible in the current phase.
 */
export function isToolbarActionVisible(action: string, phase: JourneyPhase, showAll: boolean): boolean {
  if (showAll) return true;

  switch (action) {
    case 'xray':
    case 'scenario':
      return phase >= 4; // Available from Migration Planning
    case 'export':
      return phase >= 3; // Available from Opportunities & Solutions
    case 'import-bpmn':
    case 'import-n8n':
    case 'import-csv':
    case 'import-mapping':
      return phase >= 2; // Available from Architecture Definition
    default:
      return true; // Always visible
  }
}
