import { useState } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AgentPersona, PersonaScope } from '@thearchitect/shared/src/types/simulation.types';

const LAYERS = ['strategy', 'business', 'information', 'application', 'technology'] as const;
const DOMAINS = ['business', 'data', 'application', 'technology'] as const;
const STAKEHOLDER_TYPES = [
  { value: 'c_level', label: 'C-Level' },
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'it_ops', label: 'IT Operations' },
  { value: 'data_team', label: 'Data Team' },
  { value: 'external', label: 'External' },
] as const;
const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  basePersona: AgentPersona;
  isEditing?: boolean;
  existingCustomId?: string;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export default function PersonaEditor({
  isOpen,
  onClose,
  basePersona,
  isEditing = false,
  existingCustomId,
  onSave,
}: Props) {
  const [name, setName] = useState(isEditing ? basePersona.name : `${basePersona.name} (Custom)`);
  const [scope, setScope] = useState<PersonaScope>('project');
  const [stakeholderType, setStakeholderType] = useState(basePersona.stakeholderType);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([...basePersona.visibleLayers]);
  const [visibleDomains, setVisibleDomains] = useState<string[]>([...basePersona.visibleDomains]);
  const [budgetConstraint, setBudgetConstraint] = useState(basePersona.budgetConstraint || 0);
  const [riskThreshold, setRiskThreshold] = useState(basePersona.riskThreshold || 'medium');
  const [expectedCapacity, setExpectedCapacity] = useState(basePersona.expectedCapacity);
  const [priorities, setPriorities] = useState<string[]>([...basePersona.priorities]);
  const [systemPromptSuffix, setSystemPromptSuffix] = useState(basePersona.systemPromptSuffix);
  const [description, setDescription] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const toggleItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  };

  const addPriority = () => {
    const trimmed = newPriority.trim();
    if (trimmed && !priorities.includes(trimmed)) {
      setPriorities([...priorities, trimmed]);
      setNewPriority('');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (visibleLayers.length === 0) {
      toast.error('At least one layer must be visible');
      return;
    }
    if (visibleDomains.length === 0) {
      toast.error('At least one domain must be visible');
      return;
    }
    if (priorities.length === 0) {
      toast.error('At least one priority is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        basedOnPresetId: isEditing ? undefined : basePersona.id,
        scope,
        name: name.trim(),
        stakeholderType,
        visibleLayers,
        visibleDomains,
        maxGraphDepth: 5,
        budgetConstraint: budgetConstraint || undefined,
        riskThreshold,
        expectedCapacity,
        priorities,
        systemPromptSuffix,
        description: description.trim() || undefined,
      });
      toast.success(isEditing ? 'Persona updated' : 'Custom persona created');
      onClose();
    } catch {
      toast.error('Failed to save persona');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ animation: 'fadeIn 150ms ease-out' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#0a0a0a] border border-[#1a2a1a] rounded-lg shadow-2xl"
        style={{ animation: 'scaleIn 200ms ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2a1a]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Persona' : 'Clone & Customize'}
            </h2>
            {!isEditing && (
              <p className="text-sm text-[#7a8a7a]">Based on: {basePersona.name}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-[#7a8a7a] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-5">
          {/* Name + Scope Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#7a8a7a] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white focus:border-[#00ff41]/50 focus:outline-none"
              />
            </div>
            {!isEditing && (
              <div>
                <label className="block text-sm text-[#7a8a7a] mb-1">Scope</label>
                <div className="flex gap-3 mt-2">
                  {(['project', 'user'] as PersonaScope[]).map((s) => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        value={s}
                        checked={scope === s}
                        onChange={() => setScope(s)}
                        className="accent-[#00ff41]"
                      />
                      <span className="text-sm text-white capitalize">{s === 'project' ? 'Project (shared)' : 'Personal (portable)'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stakeholder Type */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-1">Stakeholder Type</label>
            <select
              value={stakeholderType}
              onChange={(e) => setStakeholderType(e.target.value as AgentPersona['stakeholderType'])}
              className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white focus:border-[#00ff41]/50 focus:outline-none"
            >
              {STAKEHOLDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Visible Layers */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-2">Visible Layers</label>
            <div className="flex flex-wrap gap-2">
              {LAYERS.map((layer) => (
                <button
                  key={layer}
                  onClick={() => toggleItem(visibleLayers, layer, setVisibleLayers)}
                  className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                    visibleLayers.includes(layer)
                      ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/40'
                      : 'bg-[#111111] text-[#7a8a7a] border border-[#1a2a1a] hover:border-[#00ff41]/30'
                  }`}
                >
                  {layer}
                </button>
              ))}
            </div>
          </div>

          {/* Visible Domains */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-2">Visible Domains</label>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((domain) => (
                <button
                  key={domain}
                  onClick={() => toggleItem(visibleDomains, domain, setVisibleDomains)}
                  className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                    visibleDomains.includes(domain)
                      ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/40'
                      : 'bg-[#111111] text-[#7a8a7a] border border-[#1a2a1a] hover:border-[#00ff41]/30'
                  }`}
                >
                  {domain}
                </button>
              ))}
            </div>
          </div>

          {/* Budget + Risk + Capacity Row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[#7a8a7a] mb-1">Budget ($)</label>
              <input
                type="number"
                value={budgetConstraint}
                onChange={(e) => setBudgetConstraint(Number(e.target.value))}
                min={0}
                step={10000}
                className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white focus:border-[#00ff41]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-[#7a8a7a] mb-1">Risk Threshold</label>
              <select
                value={riskThreshold}
                onChange={(e) => setRiskThreshold(e.target.value as typeof RISK_LEVELS[number])}
                className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white focus:border-[#00ff41]/50 focus:outline-none"
              >
                {RISK_LEVELS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#7a8a7a] mb-1">Capacity (1-20)</label>
              <input
                type="number"
                value={expectedCapacity}
                onChange={(e) => setExpectedCapacity(Math.min(20, Math.max(1, Number(e.target.value))))}
                min={1}
                max={20}
                className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white focus:border-[#00ff41]/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Priorities */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-2">Priorities</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {priorities.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/30"
                >
                  {p}
                  <button
                    onClick={() => setPriorities(priorities.filter((x) => x !== p))}
                    className="hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPriority())}
                placeholder="Add priority..."
                className="flex-1 px-3 py-1.5 bg-[#111111] border border-[#1a2a1a] rounded text-white text-sm focus:border-[#00ff41]/50 focus:outline-none"
              />
              <button
                onClick={addPriority}
                className="px-3 py-1.5 bg-[#111111] border border-[#1a2a1a] rounded text-[#00ff41] hover:bg-[#00ff41]/10 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* System Prompt Suffix */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-1">Persona Behavior (LLM Instructions)</label>
            <textarea
              value={systemPromptSuffix}
              onChange={(e) => setSystemPromptSuffix(e.target.value)}
              rows={4}
              placeholder="Describe how this stakeholder thinks and acts..."
              className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white text-sm resize-none focus:border-[#00ff41]/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Why was this persona customized?"
              className="w-full px-3 py-2 bg-[#111111] border border-[#1a2a1a] rounded text-white text-sm focus:border-[#00ff41]/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1a2a1a]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#7a8a7a] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-[#00ff41] rounded hover:bg-[#00cc33] disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Create Persona'}
          </button>
        </div>
      </div>
    </div>
  );
}
