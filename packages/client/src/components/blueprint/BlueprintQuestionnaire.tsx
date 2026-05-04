import { useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2, Target, Lightbulb, Users, Cpu, ShieldCheck,
  ChevronDown, ChevronRight, Plus, X, Upload, FileText, Loader2, CheckCircle2,
} from 'lucide-react';
import { useBlueprintStore } from '../../stores/blueprintStore';
import { useEnvisionStore } from '../../stores/envisionStore';
import type { BlueprintQuestionnaire as QuestionnaireType } from '@thearchitect/shared';

// ─── Card Wrapper ───

function Card({
  icon: Icon,
  title,
  subtitle,
  color,
  required,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-base)]/50 transition"
      >
        <div className="p-1.5 rounded-md" style={{ backgroundColor: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{title}</span>
            {required && <span className="text-[10px] text-[#ef4444] font-medium">Required</span>}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] truncate">{subtitle}</p>
        </div>
        {open ? <ChevronDown size={16} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={16} className="text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-subtle)] pt-3">{children}</div>}
    </div>
  );
}

// ─── Field Components ───

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  // Auto-resize textarea when the value is long enough that a
  // single-line input would truncate it (auto-fill from PDF often
  // produces paragraphs). We ALWAYS render textarea — never swap the
  // element type mid-render, otherwise React unmounts/remounts on the
  // type change and the cleanup propagates onChange→update→parent
  // setState DURING the child render (setState-in-render warning).
  // rows=1 keeps the visual close to a single-line input when short.
  const isLong = (value || '').length > 80;
  const rows = (multiline || isLong)
    ? Math.min(8, Math.max(2, Math.ceil(value.length / 70)))
    : 1;
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">
        {label} {required && <span className="text-[#ef4444]">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#7c3aed] transition resize-y leading-relaxed"
      />
      {hint && <p className="text-[10px] text-[var(--text-disabled)] mt-1 italic">{hint}</p>}
    </div>
  );
}

function TagInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput('');
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-md bg-[#7c3aed]/20 border border-[#7c3aed]/30 px-2 py-0.5 text-xs text-[#a78bfa]">
            {tag}
            <button onClick={() => onChange(values.filter((t) => t !== tag))} className="hover:text-white transition">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#7c3aed] transition"
        />
        <button onClick={addTag} className="p-1.5 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-base)] transition">
          <Plus size={14} className="text-[var(--text-secondary)]" />
        </button>
      </div>
      {hint && <p className="text-[10px] text-[var(--text-disabled)] mt-1 italic">{hint}</p>}
    </div>
  );
}

function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border transition ${
              value === opt.value
                ? 'bg-[#7c3aed]/20 border-[#7c3aed] text-[#a78bfa]'
                : 'bg-[var(--surface-base)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChipSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border transition ${
              values.includes(opt.value)
                ? 'bg-[#7c3aed]/20 border-[#7c3aed] text-[#a78bfa]'
                : 'bg-[var(--surface-base)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed] transition"
      >
        <option value="">— Not specified —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Product Types ───

const PRODUCT_TYPES = [
  { value: 'web_app', label: 'Web App' },
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'api_platform', label: 'API / Platform' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'saas', label: 'SaaS' },
  { value: 'hardware_software', label: 'Hardware + Software' },
  { value: 'other', label: 'Other' },
];

const REGULATIONS = [
  { value: 'gdpr', label: 'GDPR' },
  { value: 'soc2', label: 'SOC 2' },
  { value: 'iso27001', label: 'ISO 27001' },
  { value: 'pci_dss', label: 'PCI DSS' },
  { value: 'hipaa', label: 'HIPAA' },
  { value: 'iso15288', label: 'ISO 15288' },
  { value: 'aspice', label: 'ASPICE' },
  { value: 'iso26262', label: 'ISO 26262' },
  { value: 'iso21434', label: 'ISO 21434' },
  { value: 'unece_r155', label: 'UNECE R155' },
  { value: 'unece_r156', label: 'UNECE R156' },
  { value: 'iec62443', label: 'IEC 62443' },
  { value: 'iso42001', label: 'ISO 42001' },
];

const TEAM_SIZES = [
  { value: '1-2', label: '1-2 people' },
  { value: '3-5', label: '3-5 people' },
  { value: '6-15', label: '6-15 people' },
  { value: '16-50', label: '16-50 people' },
  { value: '50+', label: '50+ people' },
];

const BUDGETS = [
  { value: '<500', label: '< $500' },
  { value: '500-2K', label: '$500 - $2,000' },
  { value: '2K-10K', label: '$2,000 - $10,000' },
  { value: '10K-50K', label: '$10,000 - $50,000' },
  { value: '50K+', label: '> $50,000' },
];

const COMPLEXITY_OPTIONS = [
  { value: 'minimal', label: 'Compact (~30 elements)', description: 'Ideal for MVPs and simple startups' },
  { value: 'standard', label: 'Standard (~50 elements)', description: 'Balanced architecture for most use cases' },
  { value: 'comprehensive', label: 'Comprehensive (~80 elements)', description: 'Full enterprise architecture' },
];

// ─── Main Component ───

interface BlueprintQuestionnaireProps {
  onGenerate: () => void;
}

export default function BlueprintQuestionnaire({ onGenerate }: BlueprintQuestionnaireProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const q = useBlueprintStore((s) => s.questionnaire);
  const complexityHint = useBlueprintStore((s) => s.complexityHint);
  const industryHint = useBlueprintStore((s) => s.industryHint);
  const update = useBlueprintStore((s) => s.updateQuestionnaire);
  const setComplexity = useBlueprintStore((s) => s.setComplexityHint);
  const setIndustry = useBlueprintStore((s) => s.setIndustryHint);
  const autofill = useBlueprintStore((s) => s.autofill);
  const isAutofilling = useBlueprintStore((s) => s.isAutofilling);
  const autofillDocumentName = useBlueprintStore((s) => s.autofillDocumentName);
  const error = useBlueprintStore((s) => s.error);

  const vision = useEnvisionStore((s) => s.vision);
  const prefillFromVision = useBlueprintStore((s) => s.prefillFromVision);

  // Pre-fill from vision data if available (only once on mount)
  const prefilled = useRef(false);
  if (!prefilled.current && vision.scope) {
    prefilled.current = true;
    prefillFromVision(vision);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (projectId) autofill(projectId, file);
  }, [projectId, autofill]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const canGenerate = q.businessDescription.trim() && q.targetUsers.trim() && q.problemSolved.trim() && q.goals.some((g) => g.trim()) && q.capabilities.trim();

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Describe Your Business</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Answer the questions as best you can — the AI will intelligently fill in any gaps.
          The more you describe, the better the architecture proposal.
        </p>
      </div>

      {/* Auto-fill from document */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition ${
          dragOver
            ? 'border-[#7c3aed] bg-[#7c3aed]/10'
            : isAutofilling
            ? 'border-[#7c3aed]/50 bg-[#7c3aed]/5'
            : 'border-[var(--border-subtle)] hover:border-[var(--text-tertiary)]'
        }`}
      >
        {isAutofilling ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <Loader2 size={18} className="animate-spin text-[#7c3aed]" />
            <div className="text-left">
              <p className="text-xs font-medium text-white">Analyzing {autofillDocumentName}...</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Extracting business information with AI</p>
            </div>
          </div>
        ) : autofillDocumentName && !error ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <CheckCircle2 size={18} className="text-[#22c55e]" />
            <div className="text-left">
              <p className="text-xs font-medium text-white">Auto-filled from {autofillDocumentName}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Review and adjust the extracted fields below</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="ml-auto text-[10px] text-[var(--text-secondary)] hover:text-white transition"
            >
              Upload another
            </button>
          </div>
        ) : (
          <div className="py-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Upload size={16} className="text-[var(--text-tertiary)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Auto-fill from document</span>
            </div>
            <p className="text-[10px] text-[var(--text-disabled)] mb-3">
              Drop a pitch deck, business plan, or strategy document here — AI will extract the answers.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white hover:border-[var(--text-tertiary)] transition"
            >
              <FileText size={12} /> Choose File
            </button>
            <p className="text-[10px] text-[var(--text-disabled)] mt-2">
              PDF, Excel (.xlsx), PowerPoint (.pptx) — max 20MB
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.pptx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Card 1: Your Business */}
      <Card icon={Building2} title="Your Business" subtitle="What does your company do?" color="#3b82f6" required>
        <TextField
          label="What does your business do in one sentence?"
          value={q.businessDescription}
          onChange={(v) => update({ businessDescription: v })}
          placeholder="e.g. We build a platform for sustainable fashion"
          required
        />
        <TextField
          label="Who are your main users or customers?"
          value={q.targetUsers}
          onChange={(v) => update({ targetUsers: v })}
          placeholder="e.g. Eco-conscious 25-35 year olds who shop online"
          required
        />
        <TextField
          label="What problem are you solving?"
          value={q.problemSolved}
          onChange={(v) => update({ problemSolved: v })}
          placeholder="e.g. There is no transparent marketplace for sustainable fashion"
          required
        />
        <TextField
          label="Why now? What's driving the urgency?"
          value={q.urgencyDriver || ''}
          onChange={(v) => update({ urgencyDriver: v })}
          placeholder="e.g. Growing market, increasing demand for sustainability"
          hint="Optional — helps the AI understand the context"
        />
      </Card>

      {/* Card 2: Your Goals */}
      <Card icon={Target} title="Your Goals" subtitle="What do you want to achieve?" color="#22c55e" required>
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)] block">
            Your Top 3 Business Goals <span className="text-[#ef4444]">*</span>
          </label>
          {q.goals.map((goal, i) => {
            const isLong = (goal || '').length > 80;
            // Always render textarea — see TextField comment above for why.
            const rows = isLong ? Math.min(6, Math.max(2, Math.ceil(goal.length / 70))) : 1;
            return (
              <textarea
                key={i}
                value={goal}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  const newGoals = [...q.goals] as [string, string, string];
                  newGoals[i] = e.target.value;
                  update({ goals: newGoals });
                }}
                rows={rows}
                placeholder={[
                  'e.g. 10,000 active users in 6 months',
                  'e.g. Break-even within 18 months',
                  'e.g. Partnerships with 50 sustainable brands',
                ][i]}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#7c3aed] transition resize-y leading-relaxed"
              />
            );
          })}
        </div>
        <TextField
          label="What does success look like for you?"
          value={q.successVision || ''}
          onChange={(v) => update({ successVision: v })}
          placeholder="e.g. Market leader for sustainable fashion in Europe"
          hint="Optional"
        />
        <TextField
          label="Any non-negotiable principles?"
          value={q.principles || ''}
          onChange={(v) => update({ principles: v })}
          placeholder="e.g. Privacy first, Mobile-First, Open Source where possible"
          hint="Optional — guiding principles for your business"
        />
      </Card>

      {/* Card 3: Capabilities */}
      <Card icon={Lightbulb} title="Your Capabilities" subtitle="What must your business be able to do?" color="#f59e0b" required>
        <TextField
          label="What core capabilities does your business need?"
          value={q.capabilities}
          onChange={(v) => update({ capabilities: v })}
          placeholder="e.g. Process orders, handle payments, advise customers, recommend products"
          hint="Separate different capabilities with commas"
          required
          multiline
        />
        <TextField
          label="Describe the typical customer journey"
          value={q.customerJourney || ''}
          onChange={(v) => update({ customerJourney: v })}
          placeholder="e.g. User finds us via Google → signs up → creates profile → gets recommendations → orders → receives delivery"
          hint="Optional — from first contact to value delivery"
          multiline
        />
      </Card>

      {/* Card 4: Team & Processes */}
      <Card icon={Users} title="Team & Processes" subtitle="Who is involved and how do they work?" color="#f97316">
        <TextField
          label="Who is on your team and what do they do?"
          value={q.teamDescription || ''}
          onChange={(v) => update({ teamDescription: v })}
          placeholder="e.g. 2 developers (frontend + backend), 1 designer, 1 marketing, founder does everything else"
          multiline
        />
        <TextField
          label="What are the main work processes?"
          value={q.mainProcesses || ''}
          onChange={(v) => update({ mainProcesses: v })}
          placeholder="e.g. Product listing, order processing, customer support"
          hint="Optional"
          multiline
        />
      </Card>

      {/* Card 5: Technology */}
      <Card icon={Cpu} title="Technology" subtitle="What are you building and with what?" color="#a855f7">
        <ChipSelect
          label="What kind of product are you building?"
          options={PRODUCT_TYPES}
          value={q.productType}
          onChange={(v) => update({ productType: v as QuestionnaireType['productType'] })}
        />
        <TagInput
          label="What software/tools do you already use or plan to use?"
          values={q.existingTools || []}
          onChange={(v) => update({ existingTools: v })}
          placeholder="e.g. React, PostgreSQL, Stripe..."
          hint="Press Enter to add a tag"
        />
        <TextField
          label="Any technology decisions already made?"
          value={q.techDecisions || ''}
          onChange={(v) => update({ techDecisions: v })}
          placeholder="e.g. We use React + Node.js, hosting on AWS, payments via Stripe"
          hint="Optional"
          multiline
        />
      </Card>

      {/* Card 6: Constraints */}
      <Card icon={ShieldCheck} title="Constraints & Compliance" subtitle="What rules and limitations apply?" color="#ef4444">
        <TextField
          label="What constraints does your business have?"
          value={q.constraints || ''}
          onChange={(v) => update({ constraints: v })}
          placeholder="e.g. GDPR compliant, max budget $5,000/month, no vendor lock-in"
          hint="Optional"
          multiline
        />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Team Size" value={q.teamSize} onChange={(v) => update({ teamSize: v as QuestionnaireType['teamSize'] })} options={TEAM_SIZES} />
          <Select label="Monthly Tech Budget" value={q.monthlyBudget} onChange={(v) => update({ monthlyBudget: v as QuestionnaireType['monthlyBudget'] })} options={BUDGETS} />
        </div>
        <MultiChipSelect
          label="Regulatory Requirements"
          options={REGULATIONS}
          values={q.regulations || []}
          onChange={(v) => update({ regulations: v })}
        />
      </Card>

      {/* Complexity + Generate */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Architecture Scope</label>
          <div className="grid grid-cols-3 gap-2">
            {COMPLEXITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setComplexity(opt.value as any)}
                className={`rounded-lg p-3 text-left border transition ${
                  complexityHint === opt.value
                    ? 'bg-[#7c3aed]/15 border-[#7c3aed] ring-1 ring-[#7c3aed]/30'
                    : 'bg-[var(--surface-base)] border-[var(--border-subtle)] hover:border-[var(--text-tertiary)]'
                }`}
              >
                <div className="text-xs font-semibold text-white">{opt.label}</div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        <TextField
          label="Industry (optional — auto-detected)"
          value={industryHint}
          onChange={setIndustry}
          placeholder="e.g. FinTech, HealthTech, E-Commerce, EdTech..."
        />

        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="w-full py-3 rounded-lg text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-lg shadow-[#7c3aed]/20"
        >
          Generate Architecture
        </button>
        {!canGenerate && (
          <p className="text-[10px] text-[var(--text-disabled)] text-center">
            Please fill in at least the required fields (Business, Goals, Capabilities)
          </p>
        )}
      </div>
    </div>
  );
}
