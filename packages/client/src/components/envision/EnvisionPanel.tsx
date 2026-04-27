import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target, Plus, X, Loader2,
  Users, Eye, Pencil, Trash2, Save,
  CheckCircle2, Circle, Sparkles, Upload, AlertTriangle,
  BarChart3, ChevronDown, ChevronUp, Layers,
} from 'lucide-react';
import { v4 as uuid } from 'uuid';
import HierarchyExtractionFlow from '../copilot/HierarchyExtractionFlow';
import { useEnvisionStore, type Stakeholder, type Vision } from '../../stores/envisionStore';
import { useArchitectureStore, type ArchitectureElement, type Connection } from '../../stores/architectureStore';
import { useSimulationStore } from '../../stores/simulationStore';
import type {
  AIStakeholderSuggestion,
  AIConflictInsight,
  AIReadinessAssessment,
} from '@thearchitect/shared';
import toast from 'react-hot-toast';
import { buildStakeholderElement, isDuplicate, getAutoConnectionTargets, buildConnection } from '../../utils/envisionSync';
import { architectureAPI } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

// ─── Sub-section Tabs ─────────────────────────────────
type Section = 'vision' | 'stakeholders' | 'readiness';

const SECTIONS: { id: Section; label: string; icon: typeof Target }[] = [
  { id: 'vision', label: 'Scope & Vision', icon: Eye },
  { id: 'stakeholders', label: 'Stakeholders', icon: Users },
  { id: 'readiness', label: 'Readiness', icon: CheckCircle2 },
];

// Map a highlight-field hint (set by PhaseBar / MissionControl / next-action CTAs)
// to the sub-section that contains it. Keeps CTA-clicks in lock-step with what
// the user sees blinking.
const FIELD_TO_SECTION: Record<string, Section> = {
  scope: 'vision',
  visionStatement: 'vision',
  principles: 'vision',
  drivers: 'vision',
  goals: 'vision',
  stakeholders: 'stakeholders',
  readiness: 'readiness',
};

const STAKEHOLDER_TYPES = [
  { value: 'c_level', label: 'C-Level Executive' },
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'it_ops', label: 'IT Operations' },
  { value: 'data_team', label: 'Data Team' },
  { value: 'external', label: 'External' },
] as const;

const INFLUENCE_LEVELS = ['high', 'medium', 'low'] as const;
const ATTITUDE_LEVELS = ['champion', 'supporter', 'neutral', 'critic'] as const;

const ATTITUDE_COLORS: Record<string, string> = {
  champion: 'text-emerald-400',
  supporter: 'text-blue-400',
  neutral: 'text-gray-400',
  critic: 'text-red-400',
};

const INFLUENCE_COLORS: Record<string, string> = {
  high: 'bg-purple-500/20 text-purple-300',
  medium: 'bg-blue-500/20 text-blue-300',
  low: 'bg-gray-500/20 text-gray-300',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'border-red-500/30 bg-red-500/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  low: 'border-blue-500/30 bg-blue-500/5',
};

const SEVERITY_TEXT: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-blue-400',
};

export default function EnvisionPanel() {
  const [section, setSection] = useState<Section>('vision');
  const projectId = useArchitectureStore((s) => s.projectId);
  const { vision, stakeholders, loading, saving, load, updateVision, saveVision, saveStakeholders } = useEnvisionStore();
  const highlightedField = useUIStore((s) => s.highlightedField);

  // Load envision data when project changes
  useEffect(() => {
    if (projectId) load(projectId);
  }, [projectId, load]);

  // When a CTA highlights a specific field (e.g. "Add Principles" → 'principles'),
  // auto-switch to the section that contains it so the user lands on the right tab.
  useEffect(() => {
    if (!highlightedField) return;
    const target = FIELD_TO_SECTION[highlightedField];
    if (target && target !== section) setSection(target);
  }, [highlightedField, section]);

  if (!projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <Target size={32} className="text-[var(--text-tertiary)] mb-3" />
        <p className="text-sm text-[var(--text-secondary)]">Open a project to define its architecture vision</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Section Tabs */}
      <div className="flex border-b border-[var(--border-subtle)]">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-medium transition ${
              section === s.id
                ? 'text-[var(--accent-default)] border-b-2 border-[var(--accent-default)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <s.icon size={12} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {section === 'vision' && <VisionSection />}
        {section === 'stakeholders' && <StakeholderSection />}
        {section === 'readiness' && <ReadinessSection />}
      </div>
    </div>
  );
}

// ─── Vision & Scope Section ───────────────────────────
function VisionSection() {
  const {
    vision, updateVision, saveVision, saving,
    isGenerating, aiSuggestions, aiError,
    generateVision, acceptVisionSuggestion, suggestPrinciples, acceptPrinciple,
    extractDocument, clearAISuggestions,
  } = useEnvisionStore();
  const highlightField = useUIStore((s) => s.highlightedField);
  const scopeRef = useRef<HTMLTextAreaElement>(null);
  const visionStatementRef = useRef<HTMLTextAreaElement>(null);
  const principlesRef = useRef<HTMLDivElement>(null);
  const driversRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showAIInput, setShowAIInput] = useState(false);
  const [showHierarchyFlow, setShowHierarchyFlow] = useState(false);
  const projectIdForGen = useArchitectureStore((s) => s.projectId);
  const [aiDescription, setAIDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll + focus the highlighted field. Single effect handles every field
  // so future fields just need a ref entry.
  useEffect(() => {
    const targetEl: HTMLElement | null =
      highlightField === 'scope' ? scopeRef.current
      : highlightField === 'visionStatement' ? visionStatementRef.current
      : highlightField === 'principles' ? principlesRef.current
      : highlightField === 'drivers' ? driversRef.current
      : highlightField === 'goals' ? goalsRef.current
      : null;
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof (targetEl as HTMLTextAreaElement).focus === 'function') {
      (targetEl as HTMLTextAreaElement).focus();
    }
  }, [highlightField]);

  const autoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveVision(), 1500);
  }, [saveVision]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleChange = (field: keyof Vision, value: string | string[]) => {
    updateVision({ [field]: value });
    autoSave();
  };

  const handleGenerate = async () => {
    if (!aiDescription.trim()) return;
    await generateVision(aiDescription);
    setShowAIInput(false);
    setAIDescription('');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await extractDocument(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-3 space-y-4">
      {/* Header with AI buttons */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed flex-1">
          TOGAF Phase A — Define what this architecture project covers, what success looks like, and which principles guide decisions.
        </p>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setShowAIInput(!showAIInput)}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md hover:bg-purple-500/20 transition disabled:opacity-50"
          >
            <Sparkles size={10} /> AI Generate
          </button>
          <button
            onClick={() => setShowHierarchyFlow(true)}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[#00ff41]/10 text-[#33ff66] border border-[#00ff41]/30 rounded-md hover:bg-[#00ff41]/20 transition disabled:opacity-50"
            title="Generate full architecture (Vision → Activity) from a regulatory document"
          >
            <Sparkles size={10} /> AI from PDF
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-md hover:border-[var(--accent-default)] transition disabled:opacity-50"
          >
            <Upload size={10} /> Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.pptx,.docx,.txt,.md"
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* AI Generate Input */}
      {showAIInput && (
        <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-2">
          <p className="text-[10px] font-medium text-purple-300">Describe your project in 1-3 sentences</p>
          <textarea
            value={aiDescription}
            onChange={(e) => setAIDescription(e.target.value)}
            rows={3}
            placeholder="e.g., Cloud migration of 50 microservices from on-premise to AWS, targeting 30% cost reduction and improved developer experience..."
            className="w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-purple-500 focus:outline-none resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAIInput(false); setAIDescription(''); }}
              className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!aiDescription.trim() || isGenerating}
              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-purple-500 text-white rounded hover:bg-purple-600 transition disabled:opacity-50"
            >
              {isGenerating ? (
                <><Loader2 size={10} className="animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={10} /> Generate</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* AI loading indicator (when not in input mode) */}
      {isGenerating && !showAIInput && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <Loader2 size={12} className="animate-spin text-purple-400" />
          <span className="text-[10px] text-purple-300">AI is working...</span>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
          <span className="text-[10px] text-red-300 flex-1">{aiError}</span>
          <button onClick={clearAISuggestions} className="text-[10px] text-red-400 hover:text-red-300 shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Vision Suggestion Card */}
      {aiSuggestions.vision && <VisionSuggestionCard />}

      {/* Scope */}
      <FieldBlock label="Scope" hint="What does this architecture project cover?">
        <textarea
          ref={scopeRef}
          value={vision.scope}
          onChange={(e) => handleChange('scope', e.target.value)}
          rows={3}
          className={`w-full bg-[var(--surface-base)] border rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none resize-none ${
            highlightField === 'scope'
              ? 'border-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse'
              : 'border-[var(--border-subtle)]'
          }`}
          placeholder="e.g., Enterprise IT landscape modernization covering business, application, and technology layers..."
        />
      </FieldBlock>

      {/* Vision Statement */}
      <FieldBlock label="Vision Statement" hint="What does success look like?">
        <textarea
          ref={visionStatementRef}
          value={vision.visionStatement}
          onChange={(e) => handleChange('visionStatement', e.target.value)}
          rows={3}
          className={`w-full bg-[var(--surface-base)] border rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none resize-none ${
            highlightField === 'visionStatement'
              ? 'border-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse'
              : 'border-[var(--border-subtle)]'
          }`}
          placeholder="e.g., A unified, cloud-native architecture that reduces operational costs by 30% and enables 2x faster feature delivery..."
        />
      </FieldBlock>

      {/* Principles (with AI suggest) */}
      <div
        ref={principlesRef}
        className={`rounded-md transition ${
          highlightField === 'principles'
            ? 'ring-2 ring-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse p-1 -m-1'
            : ''
        }`}
      >
        <TagListField
          label="Principles"
          hint="Non-negotiable architecture principles"
          items={vision.principles}
          onChange={(items) => handleChange('principles', items)}
          placeholder="e.g., Cloud-First"
          aiAction={{
            onClick: () => suggestPrinciples(),
            loading: isGenerating,
            label: 'Suggest',
          }}
        />
      </div>
      {/* Principle suggestion chips */}
      {aiSuggestions.principles && aiSuggestions.principles.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1">
          {aiSuggestions.principles.map((p) => (
            <button
              key={p.name}
              onClick={() => acceptPrinciple(p.name)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition"
              title={p.description}
            >
              <Plus size={8} /> {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Drivers */}
      <div
        ref={driversRef}
        className={`rounded-md transition ${
          highlightField === 'drivers'
            ? 'ring-2 ring-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse p-1 -m-1'
            : ''
        }`}
      >
        <TagListField
          label="Drivers"
          hint="What's driving this project?"
          items={vision.drivers}
          onChange={(items) => handleChange('drivers', items)}
          placeholder="e.g., Regulatory Requirements"
        />
      </div>

      {/* Goals */}
      <div
        ref={goalsRef}
        className={`rounded-md transition ${
          highlightField === 'goals'
            ? 'ring-2 ring-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse p-1 -m-1'
            : ''
        }`}
      >
        <TagListField
          label="Goals"
          hint="Measurable strategic goals"
          items={vision.goals}
          onChange={(items) => handleChange('goals', items)}
          placeholder="e.g., Reduce TCO by 25%"
        />
      </div>

      {/* Save indicator */}
      {saving && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 size={10} className="animate-spin" /> Saving...
        </div>
      )}

      {/* AI from PDF — full hierarchy extraction */}
      <HierarchyExtractionFlow
        isOpen={showHierarchyFlow}
        onClose={() => setShowHierarchyFlow(false)}
        projectId={projectIdForGen}
        onApplied={() => {
          toast.success('Architecture hierarchy applied');
          // 1) Refresh 3D-element + connection store so the workspace shows new nodes
          if (projectIdForGen) {
            architectureAPI.getElements(projectIdForGen).then((res) => {
              const data = (res.data?.data ?? res.data) as ArchitectureElement[];
              useArchitectureStore.setState({ elements: data });
            }).catch(() => { /* non-blocking */ });
            architectureAPI.getConnections(projectIdForGen).then((res) => {
              const data = (res.data?.data ?? res.data) as Connection[];
              useArchitectureStore.setState({ connections: data });
            }).catch(() => { /* non-blocking */ });
            // 2) Reload Phase-A vision + stakeholders (form fields get the AI-extracted values)
            useEnvisionStore.getState().load(projectIdForGen);
          }
        }}
      />
    </div>
  );
}

// ─── Vision Suggestion Card ──────────────────────────
function VisionSuggestionCard() {
  const { aiSuggestions, acceptVisionSuggestion, clearAISuggestions, updateVision, saveVision } = useEnvisionStore();
  const v = aiSuggestions.vision;
  if (!v) return null;

  const acceptField = (field: keyof Vision, value: string | string[]) => {
    updateVision({ [field]: value });
    saveVision();
    toast.success(`Accepted ${field}`);
  };

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-purple-500/20">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-purple-300">
          <Sparkles size={10} /> AI Vision Suggestion
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={acceptVisionSuggestion}
            className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium bg-purple-500 text-white rounded hover:bg-purple-600 transition"
          >
            <CheckCircle2 size={8} /> Accept All
          </button>
          <button
            onClick={clearAISuggestions}
            className="p-0.5 text-[var(--text-tertiary)] hover:text-red-400 transition"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Scope */}
        {v.scope && (
          <SuggestionField label="Scope" value={v.scope} onAccept={() => acceptField('scope', v.scope)} />
        )}

        {/* Vision Statement */}
        {v.visionStatement && (
          <SuggestionField label="Vision" value={v.visionStatement} onAccept={() => acceptField('visionStatement', v.visionStatement)} />
        )}

        {/* Principles */}
        {v.principles.length > 0 && (
          <div>
            <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Principles</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {v.principles.map((p) => (
                <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Drivers */}
        {v.drivers.length > 0 && (
          <div>
            <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Drivers</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {v.drivers.map((d) => (
                <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        {v.goals.length > 0 && (
          <div>
            <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Goals</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {v.goals.map((g) => (
                <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionField({ label, value, onAccept }: { label: string; value: string; onAccept: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 line-clamp-3">{value}</p>
      </div>
      <button
        onClick={onAccept}
        className="shrink-0 p-1 text-purple-400 hover:bg-purple-500/20 rounded transition"
        title={`Accept ${label}`}
      >
        <CheckCircle2 size={12} />
      </button>
    </div>
  );
}

// ─── Stakeholder Section ──────────────────────────────
function StakeholderSection() {
  const {
    stakeholders, addStakeholder, updateStakeholder, removeStakeholder, saveStakeholders, saving,
    isGenerating, aiSuggestions, aiError,
    suggestStakeholders, acceptStakeholderSuggestion, acceptAllStakeholderSuggestions,
    detectConflicts, clearAISuggestions,
  } = useEnvisionStore();
  const highlightField = useUIStore((s) => s.highlightedField);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Auto-scroll + focus the Add Stakeholder button when CTA highlights this field
  useEffect(() => {
    if (highlightField === 'stakeholders' && addBtnRef.current) {
      addBtnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      addBtnRef.current.focus();
    }
  }, [highlightField]);

  const handleAdd = () => {
    const newSH: Stakeholder = {
      id: uuid(),
      name: '',
      role: '',
      stakeholderType: 'business_unit',
      interests: [],
      influence: 'medium',
      attitude: 'neutral',
    };
    addStakeholder(newSH);
    setEditingId(newSH.id);
    setShowForm(true);
  };

  const handleSave = () => {
    setEditingId(null);
    setShowForm(false);
    saveStakeholders();
  };

  const handleRemove = (id: string) => {
    // Also remove synced ArchiMate element from Explorer (if exists)
    const { elements, removeElement, connections, removeConnection } = useArchitectureStore.getState();
    const syncedEl = elements.find(
      (el) => el.type === 'stakeholder' && el.metadata?.envisionStakeholderId === id,
    );
    if (syncedEl) {
      // Remove connections first
      connections
        .filter((c) => c.sourceId === syncedEl.id || c.targetId === syncedEl.id)
        .forEach((c) => removeConnection(c.id));
      removeElement(syncedEl.id);
    }

    removeStakeholder(id);
    if (editingId === id) {
      setEditingId(null);
      setShowForm(false);
    }
    saveStakeholders();
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed flex-1">
          Identify the people who influence or are impacted by architecture decisions.
        </p>
        <button
          onClick={suggestStakeholders}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md hover:bg-purple-500/20 transition disabled:opacity-50 shrink-0"
        >
          {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          AI Suggest
        </button>
      </div>

      {/* AI loading */}
      {isGenerating && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <Loader2 size={12} className="animate-spin text-purple-400" />
          <span className="text-[10px] text-purple-300">AI is working...</span>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
          <span className="text-[10px] text-red-300 flex-1">{aiError}</span>
          <button onClick={clearAISuggestions} className="text-[10px] text-red-400 hover:text-red-300 shrink-0">Dismiss</button>
        </div>
      )}

      {/* Stakeholder Suggestions */}
      {aiSuggestions.stakeholders && aiSuggestions.stakeholders.length > 0 && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-purple-500/20">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-purple-300">
              <Sparkles size={10} /> {aiSuggestions.stakeholders.length} Suggested Stakeholders
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={acceptAllStakeholderSuggestions}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium bg-purple-500 text-white rounded hover:bg-purple-600 transition"
              >
                <CheckCircle2 size={8} /> Accept All
              </button>
              <button
                onClick={clearAISuggestions}
                className="p-0.5 text-[var(--text-tertiary)] hover:text-red-400 transition"
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <div className="p-2 space-y-1.5">
            {aiSuggestions.stakeholders.map((s) => (
              <StakeholderSuggestionCard key={s.name} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Stakeholder List */}
      <div className="space-y-1.5">
        {stakeholders.map((sh) => (
          <div key={sh.id}>
            {editingId === sh.id ? (
              <StakeholderForm
                stakeholder={sh}
                onChange={(patch) => updateStakeholder(sh.id, patch)}
                onSave={handleSave}
                onRemove={() => handleRemove(sh.id)}
              />
            ) : (
              <StakeholderCard
                stakeholder={sh}
                onEdit={() => setEditingId(sh.id)}
                onRemove={() => handleRemove(sh.id)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add Button */}
      <button
        ref={addBtnRef}
        onClick={handleAdd}
        className={`flex items-center gap-1.5 w-full px-3 py-2 text-xs text-[var(--text-secondary)] border border-dashed rounded-lg hover:border-[var(--accent-default)] hover:text-[var(--accent-default)] transition ${
          highlightField === 'stakeholders'
            ? 'border-[#22c55e] text-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse'
            : 'border-[var(--border-subtle)]'
        }`}
      >
        <Plus size={14} /> Add Stakeholder
      </button>

      {/* Stakeholder Matrix */}
      {stakeholders.length >= 2 && <StakeholderMatrix stakeholders={stakeholders} />}

      {/* Export as MiroFish Personas + Sync to 3D Explorer */}
      {stakeholders.length >= 1 && <ExportAsPersonasButton />}
      {stakeholders.length >= 1 && <SyncToExplorerButton />}

      {/* Conflict Detection */}
      {stakeholders.length >= 2 && (
        <div className="space-y-2">
          <button
            onClick={detectConflicts}
            disabled={isGenerating}
            className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-[var(--text-secondary)] border border-dashed border-amber-500/30 rounded-lg hover:border-amber-500/50 hover:text-amber-400 transition disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            Detect Conflicts
          </button>

          {/* Conflict Insights */}
          {aiSuggestions.conflicts && aiSuggestions.conflicts.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                {aiSuggestions.conflicts.length} Insight{aiSuggestions.conflicts.length > 1 ? 's' : ''} Found
              </span>
              {aiSuggestions.conflicts.map((c, i) => (
                <ConflictInsightCard key={i} conflict={c} />
              ))}
            </div>
          )}
          {aiSuggestions.conflicts && aiSuggestions.conflicts.length === 0 && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-400">No conflicts detected — stakeholder coverage looks good.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stakeholder Suggestion Card ─────────────────────
function StakeholderSuggestionCard({ suggestion: s }: { suggestion: AIStakeholderSuggestion }) {
  const { acceptStakeholderSuggestion } = useEnvisionStore();

  return (
    <div className="px-3 py-2.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] space-y-2">
      {/* Header: Name + Badges + Add Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{s.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${INFLUENCE_COLORS[s.influence]}`}>
            {s.influence}
          </span>
          <span className={`text-[9px] shrink-0 ${ATTITUDE_COLORS[s.attitude]}`}>{s.attitude}</span>
        </div>
        <button
          onClick={() => acceptStakeholderSuggestion(s)}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition"
        >
          <Plus size={10} /> Add
        </button>
      </div>

      {/* Role */}
      <p className="text-[11px] text-[var(--text-secondary)]">{s.role}</p>

      {/* Interests */}
      {s.interests.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.interests.map((int) => (
            <span key={int} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
              {int}
            </span>
          ))}
        </div>
      )}

      {/* Rationale */}
      {s.rationale && (
        <p className="text-[11px] text-purple-300/80 italic border-l-2 border-purple-500/30 pl-2">
          {s.rationale}
        </p>
      )}
    </div>
  );
}

// ─── Conflict Insight Card ───────────────────────────
function ConflictInsightCard({ conflict: c }: { conflict: AIConflictInsight }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border px-3 py-2 ${SEVERITY_COLORS[c.severity]}`}>
      <div className="flex items-start gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <AlertTriangle size={12} className={`shrink-0 mt-0.5 ${SEVERITY_TEXT[c.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] uppercase font-bold ${SEVERITY_TEXT[c.severity]}`}>{c.severity}</span>
            <span className="text-[8px] text-[var(--text-tertiary)]">{c.conflictType.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{c.description}</p>
        </div>
        {expanded ? <ChevronUp size={10} className="text-[var(--text-tertiary)] shrink-0" /> : <ChevronDown size={10} className="text-[var(--text-tertiary)] shrink-0" />}
      </div>
      {expanded && (
        <div className="mt-2 ml-5 space-y-1">
          {c.stakeholderNames.length > 0 && c.stakeholderNames[0] !== 'N/A' && (
            <p className="text-[9px] text-[var(--text-tertiary)]">
              Involved: {c.stakeholderNames.join(', ')}
            </p>
          )}
          <p className="text-[9px] text-[var(--text-secondary)]">
            <span className="font-medium">Recommendation:</span> {c.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

function StakeholderCard({ stakeholder: sh, onEdit, onRemove }: {
  stakeholder: Stakeholder;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const elements = useArchitectureStore((s) => s.elements);
  const isSynced = elements.some(
    (el) => el.type === 'stakeholder' &&
      (el.metadata?.envisionStakeholderId === sh.id || el.name.trim().toLowerCase() === sh.name.trim().toLowerCase()),
  );

  return (
    <div className="rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition">
      {/* Header — always visible, click to expand */}
      <div
        className="group flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronDown size={10} className="text-[var(--text-tertiary)] shrink-0" /> : <ChevronUp size={10} className="text-[var(--text-tertiary)] shrink-0" />}
        <span className="text-xs font-medium text-[var(--text-primary)] truncate flex-1">{sh.name || 'Unnamed'}</span>
        {isSynced && <span title="Synced to 3D Explorer"><Layers size={10} className="text-cyan-400 shrink-0" /></span>}
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${INFLUENCE_COLORS[sh.influence]}`}>
          {sh.influence}
        </span>
        <span className={`text-[9px] shrink-0 ${ATTITUDE_COLORS[sh.attitude]}`}>{sh.attitude}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1 hover:bg-[var(--surface-raised)] rounded" title="Edit">
            <Pencil size={10} className="text-[var(--text-tertiary)]" />
          </button>
          <button onClick={onRemove} className="p-1 hover:bg-red-500/10 rounded" title="Remove">
            <Trash2 size={10} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-[var(--text-tertiary)]">{sh.role || 'No role'}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
              {STAKEHOLDER_TYPES.find((t) => t.value === sh.stakeholderType)?.label || sh.stakeholderType}
            </span>
          </div>
          {sh.interests.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sh.interests.map((interest, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StakeholderForm({ stakeholder: sh, onChange, onSave, onRemove }: {
  stakeholder: Stakeholder;
  onChange: (patch: Partial<Stakeholder>) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const [interestInput, setInterestInput] = useState('');
  const { isGenerating, aiSuggestions, suggestInterests, acceptInterest } = useEnvisionStore();

  const addInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !sh.interests.includes(trimmed)) {
      onChange({ interests: [...sh.interests, trimmed] });
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    onChange({ interests: sh.interests.filter((i) => i !== interest) });
  };

  const handleAcceptInterest = (interest: string) => {
    if (!sh.interests.includes(interest)) {
      onChange({ interests: [...sh.interests, interest] });
    }
    acceptInterest(interest);
  };

  return (
    <div className="p-3 rounded-lg bg-[var(--surface-base)] border border-[var(--accent-default)] space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={sh.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name"
          className="col-span-2 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none"
          autoFocus
        />
        <input
          value={sh.role}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="Role (e.g., CTO)"
          className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none"
        />
        <select
          value={sh.stakeholderType}
          onChange={(e) => onChange({ stakeholderType: e.target.value as Stakeholder['stakeholderType'] })}
          className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-default)] focus:outline-none"
        >
          {STAKEHOLDER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={sh.influence}
          onChange={(e) => onChange({ influence: e.target.value as Stakeholder['influence'] })}
          className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-default)] focus:outline-none"
        >
          {INFLUENCE_LEVELS.map((l) => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)} Influence</option>
          ))}
        </select>
        <select
          value={sh.attitude}
          onChange={(e) => onChange({ attitude: e.target.value as Stakeholder['attitude'] })}
          className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-default)] focus:outline-none"
        >
          {ATTITUDE_LEVELS.map((a) => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Interests tags with AI suggest */}
      <div>
        <div className="flex gap-1.5 mb-1">
          <input
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
            placeholder="Add interest (Enter)"
            className="flex-1 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none"
          />
          <button onClick={addInterest} className="px-2 py-1 bg-[var(--accent-default)] text-white rounded text-[10px] hover:opacity-90">
            <Plus size={10} />
          </button>
          <button
            onClick={() => suggestInterests(sh.stakeholderType)}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[10px] hover:bg-purple-500/20 transition disabled:opacity-50"
            title="AI suggest interests"
          >
            {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          </button>
        </div>

        {/* AI Interest suggestions */}
        {aiSuggestions.interests && aiSuggestions.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {aiSuggestions.interests.map((interest) => (
              <button
                key={interest}
                onClick={() => handleAcceptInterest(interest)}
                className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition"
              >
                <Plus size={7} /> {interest}
              </button>
            ))}
          </div>
        )}

        {sh.interests.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sh.interests.map((interest, i) => (
              <span key={i} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-default)]/10 text-[var(--accent-default)]">
                {interest}
                <button onClick={() => removeInterest(interest)} className="hover:text-red-400">
                  <X size={8} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-300">
          Remove
        </button>
        <button
          onClick={onSave}
          disabled={!sh.name.trim()}
          className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-[var(--accent-default)] text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          <Save size={10} /> Done
        </button>
      </div>
    </div>
  );
}

// ─── Export Stakeholders as MiroFish Personas ────────
function ExportAsPersonasButton() {
  const { stakeholders } = useEnvisionStore();
  const projectId = useArchitectureStore((s) => s.projectId);
  const { syncStakeholdersAsPersonas } = useSimulationStore();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!projectId || stakeholders.length === 0) return;
    setExporting(true);
    try {
      await syncStakeholdersAsPersonas(projectId, stakeholders);
      toast.success('MiroFish Personas synced');
    } catch {
      toast.error('Failed to sync personas');
    }
    setExporting(false);
  };

  return (
    <div className="group relative">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-purple-300 bg-purple-500/10 border border-purple-500/25 rounded-lg hover:bg-purple-500/20 transition disabled:opacity-50"
      >
        {exporting ? (
          <><Loader2 size={14} className="animate-spin" /> Syncing...</>
        ) : (
          <><Users size={14} /> Sync MiroFish Personas</>
        )}
      </button>
      <div className="absolute left-0 right-0 bottom-full mb-2 px-3 py-2 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border-subtle)] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Stakeholders are auto-synced to MiroFish personas. Use this button to manually re-sync if needed. Each persona evaluates architecture changes from their unique perspective.
        </p>
      </div>
    </div>
  );
}

// ─── Sync Stakeholders to 3D Explorer ──────────────────
function SyncToExplorerButton() {
  const { stakeholders } = useEnvisionStore();
  const projectId = useArchitectureStore((s) => s.projectId);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (stakeholders.length === 0 || !projectId) return;
    setSyncing(true);

    try {
      // Fetch fresh elements from server to ensure we have all Neo4j nodes (incl. policy tiles)
      const [elemRes, connRes] = await Promise.all([
        architectureAPI.getElements(projectId),
        architectureAPI.getConnections(projectId),
      ]);
      const serverElements: ArchitectureElement[] = elemRes.data.data || elemRes.data || [];
      const serverConnections: Connection[] = connRes.data.data || connRes.data || [];
      useArchitectureStore.setState({ elements: serverElements, connections: serverConnections });

      const existingMotivationCount = serverElements.filter((el) => el.layer === 'motivation').length;

      let created = 0;
      let skipped = 0;
      const createdElements: { id: string }[] = [];

      // Phase 1: Create elements — await each to ensure Neo4j persistence
      for (let i = 0; i < stakeholders.length; i++) {
        const sh = stakeholders[i];
        if (isDuplicate(sh, serverElements)) {
          skipped++;
          continue;
        }
        const element = buildStakeholderElement(sh, created, existingMotivationCount);
        try {
          await architectureAPI.createElement(projectId, { ...element } as Record<string, unknown>);
          serverElements.push(element);
          createdElements.push({ id: element.id });
          created++;
        } catch (err) {
          if (import.meta.env.DEV) console.warn(`[SyncToExplorer] Failed to create ${sh.name}:`, err);
        }
      }

      // Update local store with all elements
      useArchitectureStore.setState({ elements: [...serverElements] });

      // Phase 2: Create connections — elements are now persisted in Neo4j
      let connectionsCreated = 0;
      const targets = getAutoConnectionTargets(serverElements);
      const existingConnIds = new Set(serverConnections.map((c) => c.id));
      for (const src of createdElements) {
        for (const target of targets) {
          const conn = buildConnection(src.id, target);
          if (existingConnIds.has(conn.id)) continue;
          try {
            await architectureAPI.createConnection(projectId, { ...conn } as Record<string, unknown>);
            serverConnections.push(conn);
            connectionsCreated++;
          } catch (err) {
            if (import.meta.env.DEV) console.warn(`[SyncToExplorer] Failed to create connection:`, err);
          }
        }
      }

      // Update local store with all connections
      useArchitectureStore.setState({ connections: [...serverConnections] });

      if (created > 0) {
        const parts = [`${created} element${created > 1 ? 's' : ''} synced`];
        if (skipped > 0) parts.push(`${skipped} already existed`);
        if (connectionsCreated > 0) parts.push(`${connectionsCreated} connection${connectionsCreated > 1 ? 's' : ''} created`);
        else if (targets.length === 0) parts.push('no motivation targets for connections yet');
        toast.success(parts.join(', '));
      } else if (skipped > 0) {
        toast('All stakeholders already exist in the Explorer', { icon: 'ℹ️' });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[SyncToExplorer] Failed:', err);
      toast.error('Failed to sync stakeholders.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="group relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-lg hover:bg-cyan-500/20 transition disabled:opacity-50"
      >
        {syncing ? (
          <><Loader2 size={14} className="animate-spin" /> Syncing to Explorer...</>
        ) : (
          <><Layers size={14} /> Sync to 3D Explorer</>
        )}
      </button>
      <div className="absolute left-0 right-0 bottom-full mb-2 px-3 py-2 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border-subtle)] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Creates ArchiMate Stakeholder elements in the 3D Explorer at the Motivation layer. Influence, attitude, and interests are preserved as metadata. Connections to existing Goals, Drivers, and Principles are created automatically. Duplicate stakeholders are skipped.
        </p>
      </div>
    </div>
  );
}

// ─── Stakeholder Matrix (Influence x Attitude) ───────
function StakeholderMatrix({ stakeholders }: { stakeholders: Stakeholder[] }) {
  const influenceOrder = { high: 2, medium: 1, low: 0 };
  const attitudeOrder = { champion: 3, supporter: 2, neutral: 1, critic: 0 };

  return (
    <div className="mt-3">
      <p className="text-[10px] font-medium text-[var(--text-secondary)] mb-2">Stakeholder Map</p>
      <div className="relative bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg p-3 h-32">
        {/* Axis labels */}
        <span className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[8px] text-[var(--text-tertiary)]">
          Influence
        </span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-[var(--text-tertiary)]">
          Attitude
        </span>
        {/* Quadrant lines */}
        <div className="absolute left-1/2 top-2 bottom-4 w-px bg-[var(--border-subtle)]" />
        <div className="absolute left-6 right-2 top-1/2 h-px bg-[var(--border-subtle)]" />
        {/* Dots */}
        {stakeholders.map((sh) => {
          const x = 12 + (attitudeOrder[sh.attitude] / 3) * 80;
          const y = 8 + ((2 - influenceOrder[sh.influence]) / 2) * 80;
          return (
            <div
              key={sh.id}
              className="absolute w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-[var(--accent-default)] border border-white/20 shadow-sm"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
              title={`${sh.name} (${sh.influence} influence, ${sh.attitude})`}
            >
              {sh.name.charAt(0).toUpperCase()}
            </div>
          );
        })}
        {/* Quadrant labels */}
        <span className="absolute left-8 top-2 text-[7px] text-[var(--text-tertiary)]">Monitor</span>
        <span className="absolute right-3 top-2 text-[7px] text-[var(--text-tertiary)]">Manage closely</span>
        <span className="absolute left-8 bottom-5 text-[7px] text-[var(--text-tertiary)]">Keep informed</span>
        <span className="absolute right-3 bottom-5 text-[7px] text-[var(--text-tertiary)]">Keep satisfied</span>
      </div>
    </div>
  );
}

// ─── Readiness Check ──────────────────────────────────
function ReadinessSection() {
  const { vision, stakeholders, isGenerating, aiSuggestions, assessReadiness, clearAISuggestions, aiError } = useEnvisionStore();
  const projectId = useArchitectureStore((s) => s.projectId);

  const checks = [
    { label: 'Scope defined', done: !!vision.scope.trim() },
    { label: 'Vision statement written', done: !!vision.visionStatement.trim() },
    { label: '3+ stakeholders identified', done: stakeholders.length >= 3 },
    { label: '2+ principles established', done: vision.principles.length >= 2 },
    { label: 'Business drivers documented', done: vision.drivers.length >= 1 },
    { label: 'Strategic goals set', done: vision.goals.length >= 1 },
  ];

  const completed = checks.filter((c) => c.done).length;
  const total = checks.length;
  const pct = Math.round((completed / total) * 100);
  const coreComplete = checks[0].done && checks[1].done && checks[2].done && checks[3].done;

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed flex-1">
          Complete these items to finish TOGAF Phase A and unlock Architecture Definition (Phases B-D).
        </p>
        <button
          onClick={assessReadiness}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md hover:bg-purple-500/20 transition disabled:opacity-50 shrink-0"
        >
          {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <BarChart3 size={10} />}
          AI Assessment
        </button>
      </div>

      {/* AI loading */}
      {isGenerating && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <Loader2 size={12} className="animate-spin text-purple-400" />
          <span className="text-[10px] text-purple-300">AI is assessing your architecture vision...</span>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
          <span className="text-[10px] text-red-300 flex-1">{aiError}</span>
          <button onClick={clearAISuggestions} className="text-[10px] text-red-400 hover:text-red-300 shrink-0">Dismiss</button>
        </div>
      )}

      {/* AI Assessment */}
      {aiSuggestions.readiness && <ReadinessAssessmentCard assessment={aiSuggestions.readiness} />}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Phase A Readiness</span>
          <span className="text-xs font-medium text-[var(--accent-default)]">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-base)] border border-[var(--border-subtle)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent-default)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)]">
            {check.done ? (
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            ) : (
              <Circle size={14} className="text-[var(--text-tertiary)] shrink-0" />
            )}
            <span className={`text-xs ${check.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
              {check.label}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      {coreComplete ? (
        <div className="px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Phase A complete!
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            You can now start modeling your architecture in the Explorer.
          </p>
        </div>
      ) : (
        <div className="px-3 py-2.5 rounded-lg bg-[var(--accent-default)]/5 border border-[var(--accent-default)]/20">
          <p className="text-xs text-[var(--text-secondary)]">
            Complete the core items above to unlock Phase B-D: Architecture Definition
          </p>
        </div>
      )}
    </div>
  );
}

// ─── AI Readiness Assessment Card ────────────────────
function ReadinessAssessmentCard({ assessment }: { assessment: AIReadinessAssessment }) {
  const { clearAISuggestions } = useEnvisionStore();
  const [expanded, setExpanded] = useState(true);

  const scoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400 bg-emerald-500';
    if (score >= 40) return 'text-amber-400 bg-amber-500';
    return 'text-red-400 bg-red-500';
  };

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-purple-500/20 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-purple-300">
          <BarChart3 size={10} /> AI Readiness Assessment
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${scoreColor(assessment.overallScore).split(' ')[0]}`}>
            {assessment.overallScore}/100
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); clearAISuggestions(); }}
            className="p-0.5 text-[var(--text-tertiary)] hover:text-red-400 transition"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Category scores */}
          <div className="space-y-2">
            {assessment.categories.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">{cat.name}</span>
                  <span className={`text-[10px] font-medium ${scoreColor(cat.score).split(' ')[0]}`}>{cat.score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-base)] border border-[var(--border-subtle)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreColor(cat.score).split(' ')[1]}`}
                    style={{ width: `${cat.score}%` }}
                  />
                </div>
                <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5">{cat.feedback}</p>
                {cat.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cat.suggestions.map((s, i) => (
                      <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Top Improvements */}
          {assessment.topImprovements.length > 0 && (
            <div>
              <span className="text-[9px] font-medium text-purple-300 uppercase tracking-wider">Top Improvements</span>
              <div className="mt-1 space-y-1">
                {assessment.topImprovements.map((imp, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-[9px] font-bold text-purple-400 shrink-0">{i + 1}.</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{imp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────
function FieldBlock({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">{label}</label>
      <p className="text-[9px] text-[var(--text-tertiary)] mb-1.5">{hint}</p>
      {children}
    </div>
  );
}

function TagListField({ label, hint, items, onChange, placeholder, aiAction }: {
  label: string;
  hint: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  aiAction?: { onClick: () => void; loading: boolean; label?: string };
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInput('');
    }
  };

  const remove = (item: string) => {
    onChange(items.filter((i) => i !== item));
  };

  return (
    <FieldBlock label={label} hint={hint}>
      <div className="flex gap-1.5 mb-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-default)] focus:outline-none"
        />
        <button
          onClick={add}
          className="px-2 py-1.5 bg-[var(--accent-default)] text-white rounded text-xs hover:opacity-90 transition"
        >
          <Plus size={12} />
        </button>
        {aiAction && (
          <button
            onClick={aiAction.onClick}
            disabled={aiAction.loading}
            className="flex items-center gap-1 px-2 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[10px] hover:bg-purple-500/20 transition disabled:opacity-50"
            title={`AI ${aiAction.label || 'Suggest'}`}
          >
            {aiAction.loading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-default)]/10 text-[var(--accent-default)] border border-[var(--accent-default)]/20">
              {item}
              <button onClick={() => remove(item)} className="hover:text-red-400 transition">
                <X size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
    </FieldBlock>
  );
}
