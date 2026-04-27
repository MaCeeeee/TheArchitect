// UC-ADD-004 Generator C — Tree-Preview for AI-extracted Architecture-Hierarchy
// Renders Vision/Mission → Stakeholders / Capabilities → Processes → Activities
// with per-branch accept-toggle. Cascade: parent toggles all children.

import { useMemo } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, Target, Users, Layers, Workflow, ListChecks } from 'lucide-react';
import type {
  ExtractedHierarchy,
  AcceptState,
  Capability,
  Process,
  Activity,
} from '../../hooks/useHierarchyGenerator';

interface Props {
  hierarchy: ExtractedHierarchy;
  accept: AcceptState;
  onToggle: (path: TogglePath) => void;
  expanded: Set<string>;
  onExpand: (key: string) => void;
}

export type TogglePath =
  | { kind: 'vision' }
  | { kind: 'stakeholder'; index: number }
  | { kind: 'stakeholders-all' }
  | { kind: 'capability'; index: number }
  | { kind: 'capability-cascade'; index: number; capabilityName: string }
  | { kind: 'process'; index: number }
  | { kind: 'process-cascade'; index: number; processName: string }
  | { kind: 'activity'; index: number };

export default function HierarchyTree({ hierarchy, accept, onToggle, expanded, onExpand }: Props) {
  // Group: capability → processes → activities
  const tree = useMemo(() => buildTree(hierarchy), [hierarchy]);
  const stakeholdersAll = accept.stakeholders.every(Boolean) && accept.stakeholders.length > 0;
  const stakeholdersAny = accept.stakeholders.some(Boolean);

  return (
    <div className="space-y-2">
      {/* Vision/Mission node */}
      {hierarchy.vision && (
        <Branch
          icon={<Target size={12} />}
          label={
            <>
              <span className="font-semibold">Vision</span>{' '}
              <span className="text-[var(--text-tertiary)]">
                ({hierarchy.vision.visionStatements.length} statements)
              </span>
            </>
          }
          accepted={accept.vision}
          onToggle={() => onToggle({ kind: 'vision' })}
          expandable
          expanded={expanded.has('vision')}
          onExpand={() => onExpand('vision')}
          depth={0}
        >
          <div className="ml-6 space-y-1 text-[11px] text-[var(--text-secondary)]">
            {hierarchy.vision.mission && (
              <div className="flex gap-1">
                <span className="text-[var(--text-tertiary)] shrink-0">Mission:</span>
                <span>{hierarchy.vision.mission}</span>
              </div>
            )}
            {hierarchy.vision.visionStatements.map((v, i) => (
              <div key={i} className="flex gap-1">
                <span className="text-[var(--text-tertiary)] shrink-0">·</span>
                <span>{v}</span>
              </div>
            ))}
            {hierarchy.vision.drivers && hierarchy.vision.drivers.length > 0 && (
              <div className="pt-1">
                <span className="text-[var(--text-tertiary)]">Drivers: </span>
                {hierarchy.vision.drivers.map((d, i) => (
                  <span key={i} className="inline-block mr-1 mb-1 rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px]">{d}</span>
                ))}
              </div>
            )}
            {hierarchy.vision.principles && hierarchy.vision.principles.length > 0 && (
              <div className="pt-1">
                <span className="text-[var(--text-tertiary)]">Principles: </span>
                {hierarchy.vision.principles.map((p, i) => (
                  <span key={i} className="inline-block mr-1 mb-1 rounded bg-[#00ff41]/10 text-[#33ff66] px-1.5 py-0.5 text-[10px]">{p}</span>
                ))}
              </div>
            )}
            {hierarchy.vision.goals && hierarchy.vision.goals.length > 0 && (
              <div className="pt-1">
                <span className="text-[var(--text-tertiary)]">Goals: </span>
                {hierarchy.vision.goals.map((g, i) => (
                  <span key={i} className="inline-block mr-1 mb-1 rounded bg-amber-500/10 text-amber-300 px-1.5 py-0.5 text-[10px]">{g}</span>
                ))}
              </div>
            )}
          </div>
        </Branch>
      )}

      {/* Stakeholders */}
      {hierarchy.stakeholders.length > 0 && (
        <Branch
          icon={<Users size={12} />}
          label={
            <>
              <span className="font-semibold">Stakeholders</span>{' '}
              <span className="text-[var(--text-tertiary)]">
                ({accept.stakeholders.filter(Boolean).length}/{hierarchy.stakeholders.length})
              </span>
            </>
          }
          accepted={stakeholdersAll}
          partial={stakeholdersAny && !stakeholdersAll}
          onToggle={() => onToggle({ kind: 'stakeholders-all' })}
          expandable
          expanded={expanded.has('stakeholders')}
          onExpand={() => onExpand('stakeholders')}
          depth={0}
        >
          <div className="ml-6 space-y-1">
            {hierarchy.stakeholders.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <CheckBox checked={accept.stakeholders[i] ?? true} onClick={() => onToggle({ kind: 'stakeholder', index: i })} />
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] w-4">{i + 1}</span>
                <span className="font-semibold">{s.name}</span>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="text-[var(--text-secondary)] truncate">{s.role}</span>
                <BadgeInfluence influence={s.influence} attitude={s.attitude} />
              </div>
            ))}
          </div>
        </Branch>
      )}

      {/* Capabilities → Processes → Activities (nested) */}
      {tree.capabilities.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-3 mb-1">
            <Layers size={10} />
            Capabilities → Processes → Activities
          </div>

          {tree.capabilities.map((cap) => (
            <CapabilityRow
              key={cap.index}
              cap={cap}
              accept={accept}
              onToggle={onToggle}
              expanded={expanded}
              onExpand={onExpand}
            />
          ))}

          {/* Orphan processes (no parent capability matched) */}
          {tree.orphanProcesses.length > 0 && (
            <Branch
              icon={<Workflow size={12} />}
              label={<span className="text-amber-400">Orphan Processes ({tree.orphanProcesses.length})</span>}
              accepted={false}
              partial
              onToggle={() => {}}
              expandable
              expanded={expanded.has('orphans')}
              onExpand={() => onExpand('orphans')}
              depth={0}
            >
              <div className="ml-6 text-[10px] text-amber-300">
                These processes reference unknown capabilities and won't be linked. Accept individually if desired.
                {tree.orphanProcesses.map((p) => (
                  <div key={p.index} className="flex items-center gap-2 mt-0.5">
                    <CheckBox checked={accept.processes[p.index] ?? true} onClick={() => onToggle({ kind: 'process', index: p.index })} />
                    <span>{p.process.name}</span>
                  </div>
                ))}
              </div>
            </Branch>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Capability row (with nested processes + activities) ──────────────────────

function CapabilityRow({
  cap, accept, onToggle, expanded, onExpand,
}: {
  cap: CapabilityNode;
  accept: AcceptState;
  onToggle: (p: TogglePath) => void;
  expanded: Set<string>;
  onExpand: (key: string) => void;
}) {
  const isExpanded = expanded.has(`cap-${cap.index}`);
  const procCount = cap.processes.length;
  const procAccepted = cap.processes.filter((p) => accept.processes[p.index] ?? true).length;
  const accepted = accept.capabilities[cap.index] ?? true;
  const partial = procCount > 0 && procAccepted > 0 && procAccepted < procCount;

  return (
    <Branch
      icon={<Layers size={12} />}
      label={
        <>
          <span className="font-semibold">{cap.capability.name}</span>{' '}
          <span className="text-[var(--text-tertiary)]">
            ({procAccepted}/{procCount} processes)
          </span>
        </>
      }
      accepted={accepted}
      partial={partial}
      onToggle={() => onToggle({ kind: 'capability-cascade', index: cap.index, capabilityName: cap.capability.name })}
      expandable={procCount > 0}
      expanded={isExpanded}
      onExpand={() => onExpand(`cap-${cap.index}`)}
      depth={0}
    >
      <div className="ml-2 mt-1 space-y-1">
        <div className="ml-4 text-[10px] text-[var(--text-tertiary)] italic">
          {cap.capability.description}
        </div>
        {cap.processes.map((p) => (
          <ProcessRow
            key={p.index}
            proc={p}
            accept={accept}
            onToggle={onToggle}
            expanded={expanded}
            onExpand={onExpand}
          />
        ))}
      </div>
    </Branch>
  );
}

function ProcessRow({
  proc, accept, onToggle, expanded, onExpand,
}: {
  proc: ProcessNode;
  accept: AcceptState;
  onToggle: (p: TogglePath) => void;
  expanded: Set<string>;
  onExpand: (key: string) => void;
}) {
  const isExpanded = expanded.has(`proc-${proc.index}`);
  const actCount = proc.activities.length;
  const actAccepted = proc.activities.filter((a) => accept.activities[a.index] ?? true).length;
  const accepted = accept.processes[proc.index] ?? true;
  const partial = actCount > 0 && actAccepted > 0 && actAccepted < actCount;

  return (
    <Branch
      icon={<Workflow size={12} />}
      label={
        <>
          <span className="font-semibold">{proc.process.name}</span>{' '}
          <span className="text-[var(--text-tertiary)]">
            {actCount > 0 ? `(${actAccepted}/${actCount} activities)` : '(no activities)'}
          </span>
        </>
      }
      accepted={accepted}
      partial={partial}
      onToggle={() => onToggle({ kind: 'process-cascade', index: proc.index, processName: proc.process.name })}
      expandable={actCount > 0}
      expanded={isExpanded}
      onExpand={() => onExpand(`proc-${proc.index}`)}
      depth={1}
    >
      {actCount > 0 && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {proc.activities.map((a) => (
            <div key={a.index} className="flex items-center gap-2 text-[10px]">
              <CheckBox checked={accept.activities[a.index] ?? true} onClick={() => onToggle({ kind: 'activity', index: a.index })} />
              <ListChecks size={10} className="text-[var(--text-tertiary)] shrink-0" />
              <span className="font-mono text-[var(--text-tertiary)] w-4 text-right">{a.index + 1}</span>
              <span className="text-[var(--text-secondary)] font-semibold">{a.activity.name}</span>
              <span className="text-[var(--text-tertiary)]">·</span>
              <span className="text-[var(--text-tertiary)] truncate">{a.activity.owner}</span>
              <span className="text-[var(--text-tertiary)]">·</span>
              <span className="text-[var(--text-tertiary)] truncate">{a.activity.when}</span>
            </div>
          ))}
        </div>
      )}
    </Branch>
  );
}

// ─── Generic Branch wrapper ─────────────────────────────────────────────────

function Branch({
  icon, label, accepted, partial, onToggle, expandable, expanded, onExpand, children, depth,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  accepted: boolean;
  partial?: boolean;
  onToggle: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  children?: React.ReactNode;
  depth: number;
}) {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)]" style={{ marginLeft: depth * 8 }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {expandable && onExpand ? (
          <button onClick={onExpand} className="text-[var(--text-tertiary)] hover:text-white shrink-0">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <CheckBox checked={accepted} partial={partial} onClick={onToggle} />
        <span className="text-[var(--text-tertiary)] shrink-0">{icon}</span>
        <span className="text-xs flex-1 truncate">{label}</span>
      </div>
      {expanded && children}
    </div>
  );
}

function CheckBox({ checked, partial, onClick }: { checked: boolean; partial?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`h-4 w-4 shrink-0 rounded border transition flex items-center justify-center ${
        checked
          ? 'border-[#00ff41] bg-[#00ff41]'
          : partial
          ? 'border-[#00ff41]/70 bg-[#00ff41]/30'
          : 'border-[var(--border-subtle)] hover:border-[#00ff41]'
      }`}
      aria-pressed={checked}
    >
      {checked && <CheckCircle2 size={10} className="text-[#0a0a0a]" />}
      {!checked && partial && <span className="block h-1 w-1 rounded-full bg-[#00ff41]" />}
    </button>
  );
}

function BadgeInfluence({ influence, attitude }: { influence: string; attitude: string }) {
  const infColor = influence === 'high' ? '#ef4444' : influence === 'medium' ? '#f59e0b' : '#64748b';
  const attColor =
    attitude === 'supportive' ? '#22c55e' :
    attitude === 'neutral' ? '#94a3b8' :
    attitude === 'skeptical' ? '#f59e0b' : '#ef4444';
  return (
    <span className="ml-auto flex items-center gap-1 text-[9px]">
      <span className="rounded px-1 py-0.5" style={{ background: `${infColor}25`, color: infColor }}>{influence}</span>
      <span className="rounded px-1 py-0.5" style={{ background: `${attColor}25`, color: attColor }}>{attitude}</span>
    </span>
  );
}

// ─── Tree-builder ───────────────────────────────────────────────────────────

interface CapabilityNode {
  index: number;
  capability: Capability;
  processes: ProcessNode[];
}

interface ProcessNode {
  index: number;
  process: Process;
  activities: ActivityNode[];
}

interface ActivityNode {
  index: number;
  activity: Activity;
}

interface BuiltTree {
  capabilities: CapabilityNode[];
  orphanProcesses: ProcessNode[];
}

function buildTree(h: ExtractedHierarchy): BuiltTree {
  const capByName = new Map<string, CapabilityNode>();
  const capabilityNodes: CapabilityNode[] = h.capabilities.map((c, i) => {
    const node: CapabilityNode = { index: i, capability: c, processes: [] };
    capByName.set(c.name, node);
    return node;
  });

  const procByName = new Map<string, ProcessNode>();
  const orphans: ProcessNode[] = [];
  h.processes.forEach((p, i) => {
    const node: ProcessNode = { index: i, process: p, activities: [] };
    procByName.set(p.name, node);
    const parent = capByName.get(p.parentCapability);
    if (parent) parent.processes.push(node);
    else orphans.push(node);
  });

  h.activities.forEach((a, i) => {
    const parent = procByName.get(a.parentProcess);
    if (parent) parent.activities.push({ index: i, activity: a });
  });

  return { capabilities: capabilityNodes, orphanProcesses: orphans };
}
