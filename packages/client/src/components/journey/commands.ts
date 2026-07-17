// The command vocabulary of the v2 Journey (THE-492, Slice 3a). Almost every
// command is SAFE — it only navigates (to a v2 station, a classic route, or a
// v2 sheet). Nothing toggles classic-only UI state (that no-ops/breaks from v2).
// One exception (THE-500's toggle:show-all) flips transient v2-only UI state
// (salienceOverride) — still v2-safe, since classic never reads it. The ⌘K
// CommandMenu (THE-493) lists this registry.
import type { JourneyPhase } from '../../stores/journeyStore';
import { getVisibleSections, isToolbarActionVisible } from '../../utils/phaseVisibility';
import { useUIStore } from '../../stores/uiStore';

export interface CommandContext {
  projectId: string;
  navigate: (to: string) => void;
  phase: JourneyPhase;
}

export interface Command {
  id: string;
  group: string;
  label: string;
  keywords?: string[]; // reserved for 3b palette fuzzy search
  run: (ctx: CommandContext) => void;
  available?: (ctx: CommandContext) => boolean;
}

/** Sentinel nextAction routes (__envision__, __connection_mode__, …) have no v2
 *  home yet → resolve to the classic project view, the safe escape hatch. */
export function resolveActionRoute(route: string, projectId: string): string {
  return route.startsWith('__') ? `/project/${projectId}` : route;
}

/** Build the keyed registry of safe commands, closed over the current context. */
export function buildCommandRegistry(ctx: CommandContext): Record<string, Command> {
  const { projectId } = ctx;
  const nav = (route: string): Command['run'] => (c) => c.navigate(route);
  // Phase-gate a comply/analyze section through the existing progressive-disclosure
  // map (no parallel gate). Sections absent from the phase's list are unavailable.
  const sectionGate = (panel: 'comply' | 'analyze', section: string): Command['available'] =>
    (c) => getVisibleSections(panel, c.phase, false)?.includes(section) ?? true;

  const comply = (section: string, label: string, keywords: string[]): Command => ({
    id: `open:comply-${section}`, group: 'Compliance', label, keywords,
    run: nav(`/project/${projectId}/compliance/${section}`),
    available: sectionGate('comply', section),
  });
  const analyze = (section: string, label: string, keywords: string[]): Command => ({
    id: `open:analyze-${section}`, group: 'Analyze', label, keywords,
    run: nav(`/project/${projectId}/analyze/${section}`),
    available: sectionGate('analyze', section),
  });

  const list: Command[] = [
    // Station navigation (ids frozen — StationActions contract)
    { id: 'goto:vision',  group: 'Go to', label: 'Go to Vision',  keywords: ['station', 'phase a', 'scope'],        run: nav(`/v2/project/${projectId}/vision`) },
    { id: 'goto:model',   group: 'Go to', label: 'Go to Model',   keywords: ['station', 'editor', 'elements'],      run: nav(`/v2/project/${projectId}/model`) },
    { id: 'goto:explore', group: 'Go to', label: 'Go to Explore', keywords: ['station', 'standards', 'cover'],      run: nav(`/v2/project/${projectId}/explore`) },
    { id: 'goto:plan',    group: 'Go to', label: 'Go to Plan',    keywords: ['station', 'roadmap', 'migration'],    run: nav(`/v2/project/${projectId}/plan`) },
    { id: 'goto:govern',  group: 'Go to', label: 'Go to Govern',  keywords: ['station', 'policies', 'enforce'],     run: nav(`/v2/project/${projectId}/govern`) },
    { id: 'goto:track',   group: 'Go to', label: 'Go to Track',   keywords: ['station', 'audit', 'attest'],         run: nav(`/v2/project/${projectId}/track`) },
    // View (THE-500) — the first non-navigation command: flips transient v2-only
    // salience state instead of routing.
    { id: 'toggle:show-all', group: 'View', label: 'Toggle: show all detail', keywords: ['lod', 'salience', 'focus', 'detail', 'show all'],
      run: () => useUIStore.getState().toggleSalienceOverride() },
    // Model / project (ids frozen)
    { id: 'open:model-classic', group: 'Model', label: 'Open in classic editor', keywords: ['3d', 'edit', 'project view'], run: nav(`/project/${projectId}`) },
    { id: 'open:blueprint',     group: 'Model', label: 'Generate with AI (Blueprint)', keywords: ['ai', 'generate', 'import', 'create'], run: nav(`/project/${projectId}/blueprint`) },
    // Compliance sections (id open:matrix frozen; the rest are new open:comply-*)
    { id: 'open:matrix', group: 'Compliance', label: 'Coverage matrix', keywords: ['compliance', 'mapping', 'gaps'], run: nav(`/project/${projectId}/compliance/matrix`), available: sectionGate('comply', 'matrix') },
    comply('standards', 'Standards & regulations', ['upload', 'iso', 'togaf', 'norm']),
    comply('pipeline',  'Compliance pipeline',     ['stages', 'status', 'progress']),
    comply('remediate', 'Gap remediation',         ['fix', 'gaps', 'remediation']),
    comply('policies',  'Policies',                ['rules', 'governance', 'policy']),
    comply('elements',  'Element compliance',      ['violations', 'element']),
    // Bespoke: the page's section id ('compliance-dashboard') ≠ phaseVisibility's gate id ('dashboard').
    { id: 'open:comply-dashboard', group: 'Compliance', label: 'Compliance dashboard', keywords: ['overview', 'kpi'],
      run: nav(`/project/${projectId}/compliance/compliance-dashboard`), available: sectionGate('comply', 'dashboard') },
    comply('progress',  'Compliance progress',     ['snapshot', 'history']),
    comply('roadmap',   'Compliance roadmap',      ['plan', 'waves', 'migration']),
    { id: 'open:approvals', group: 'Compliance', label: 'Policy approvals', keywords: ['approve', 'review', 'sign-off'], run: nav(`/project/${projectId}/compliance/approvals`), available: sectionGate('comply', 'approvals') },
    { id: 'open:audit',     group: 'Compliance', label: 'Audit checklist',  keywords: ['attest', 'checklist', 'evidence'], run: nav(`/project/${projectId}/compliance/audit`), available: sectionGate('comply', 'audit') },
    // Analyze (id open:analyze frozen)
    { id: 'open:analyze', group: 'Analyze', label: 'Open Analyze', keywords: ['analysis', 'insights'], run: nav(`/project/${projectId}/analyze`), available: (c) => isToolbarActionVisible('xray', c.phase, false) },
    analyze('risk',      'Risk analysis',        ['risk', 'criticality']),
    analyze('impact',    'Impact analysis',      ['impact', 'dependencies']),
    analyze('cost',      'Cost analysis',        ['cost', 'budget', 'spend']),
    // Bespoke: the page's section id ('monte-carlo') ≠ phaseVisibility's gate id ('monte').
    { id: 'open:analyze-monte', group: 'Analyze', label: 'Monte Carlo simulation', keywords: ['simulation', 'probability', 'monte carlo'],
      run: nav(`/project/${projectId}/analyze/monte-carlo`), available: sectionGate('analyze', 'monte') },
    analyze('scenarios', 'Scenario planning',    ['what-if', 'scenario', 'oracle']),
    analyze('roadmap',   'Roadmap analysis',     ['roadmap', 'timeline', 'plateau']),
    analyze('portfolio', 'Portfolio analysis',   ['portfolio', 'applications']),
    // Workspace (NOTE: portfolio is project-scoped — there is no top-level /portfolio route)
    { id: 'open:portfolio', group: 'Workspace', label: 'Portfolio', keywords: ['projects', 'overview'], run: nav(`/project/${projectId}/portfolio`) },
    { id: 'open:dashboard', group: 'Workspace', label: 'Dashboard', keywords: ['home', 'projects'],     run: nav('/dashboard') },
    { id: 'open:settings',  group: 'Workspace', label: 'Settings',  keywords: ['preferences', 'account', 'profile'], run: nav('/settings') },
  ];

  return Object.fromEntries(list.map((c) => [c.id, c]));
}
