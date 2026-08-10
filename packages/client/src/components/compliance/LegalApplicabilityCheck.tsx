/**
 * LegalApplicabilityCheck (THE-548/THE-555) — "Does this law bind US?"
 *
 * The company-side answer to question 1: the project's legal profile
 * (roles, jurisdictions, sectors, size) against the corpus typing — four
 * states per law instead of yes/no:
 *
 *   applicable      binds a profile role — "N of M typed provisions"
 *   displaced       WOULD bind, but a lex specialis pushes it aside (citation)
 *   not_applicable  binds none of the profile's roles (they are listed)
 *   undetermined    profile or norm-side typing missing — unknown, not "no"
 *
 * Sibling of ApplicabilityCheck (element signals); this one is profile-based.
 * Decision support, not legal advice — the disclaimer comes from the server
 * and is always shown.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Scale,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Pencil,
  Save,
  X,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PARTY_ROLE_IDS, JURISDICTION_IDS, deriveNormWorkId, type LegalProfile } from '@thearchitect/shared';
import { normsAPI, projectAPI } from '../../services/api';

type LawState = 'applicable' | 'displaced' | 'not_applicable' | 'undetermined';

interface LawRow {
  law: string;
  expression: string;
  state: LawState;
  reason: string;
  prevailingSource?: string;
  citations?: string[];
  missingRoles?: string[];
  matchedRoles?: string[];
  provisionsBinding?: number;
  /**
   * WELCHE Artikel binden (THE-573) — gekürzt auf die ersten N. Die volle Zahl
   * steht in `provisionsBinding`; die Differenz ist der Rest und wird
   * ausgewiesen, nie verschwiegen.
   *
   * NICHT `citations`: das sind die Belege der VERDRÄNGUNGS-Kante („warum gilt
   * DORA statt NIS2"). Zwei Listen, zwei Fragen.
   */
  bindingProvisionEIds?: string[];
  provisionsTyped: number;
  provisionsTotal: number;
}

interface LegalApplicabilityData {
  profilePresent: boolean;
  corpus: 'ok' | 'unavailable';
  laws: LawRow[];
  disclaimer: string;
}

const STATE_META: Record<LawState, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  applicable: { label: 'Applicable', icon: ShieldCheck, cls: 'text-emerald-400 border-emerald-700/50 bg-emerald-900/20' },
  displaced: { label: 'Displaced', icon: ShieldOff, cls: 'text-amber-400 border-amber-700/50 bg-amber-900/20' },
  not_applicable: { label: 'Not applicable', icon: ShieldAlert, cls: 'text-slate-400 border-[#334155] bg-[#0f172a]' },
  undetermined: { label: 'Undetermined', icon: ShieldQuestion, cls: 'text-sky-400 border-sky-700/50 bg-sky-900/20' },
};

export default function LegalApplicabilityCheck() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<LegalApplicabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<LegalProfile>({});
  const [sectorsText, setSectorsText] = useState('');
  /** Der gerade nachgeschlagene Artikeltext (THE-573). */
  const [article, setArticle] = useState<{
    eId: string;
    heading: string;
    text: string;
    loading: boolean;
    failed?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [{ data: la }, { data: project }] = await Promise.all([
        normsAPI.legalApplicability(projectId),
        projectAPI.get(projectId),
      ]);
      setData(la.data);
      const lp: LegalProfile = project?.legalProfile ?? {};
      setProfile(lp);
      setSectorsText((lp.sectors ?? []).join(', '));
    } catch {
      toast.error('Failed to load legal applicability');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Der Artikeltext zu einer bindenden Provision (THE-573 / REQ-573.2).
   *
   * Die `workId` ergibt sich aus der Fassung der Zeile: `dsgvo` → `corpus:dsgvo`.
   * Die Route stammt aus THE-570 — dieselbe, die der Generator für die
   * Vorschau nutzt. Eine Kennung, die man nicht nachlesen kann, ist nur eine
   * hübschere Zahl.
   */
  const openArticle = useCallback(
    async (expression: string, eId: string) => {
      if (!projectId) return;
      setArticle({ eId, heading: '', text: '', loading: true });
      try {
        // Kanonisch statt handgebaut (THE-653): der workId entsteht über
        // deriveNormWorkId — dieselbe Funktion, die auch der Server benutzt.
        const res = await normsAPI.getSection(projectId, deriveNormWorkId('corpus', expression), eId);
        const s = res.data?.data as { heading?: string; number?: string; text?: string } | undefined;
        setArticle({
          eId,
          heading: [s?.number, s?.heading].filter(Boolean).join(' — '),
          text: s?.text ?? '',
          loading: false,
        });
      } catch {
        // Kein stiller Abbruch: der Nutzer hat geklickt und erwartet eine Antwort.
        setArticle({ eId, heading: '', text: '', loading: false, failed: true });
      }
    },
    [projectId],
  );

  const toggleRole = (role: string) => {
    setProfile((p) => {
      const roles = new Set(p.addresseeClasses ?? []);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      return { ...p, addresseeClasses: [...roles] };
    });
  };

  const toggleJurisdiction = (j: string) => {
    setProfile((p) => {
      const js = new Set(p.jurisdictions ?? []);
      if (js.has(j)) js.delete(j);
      else js.add(j);
      return { ...p, jurisdictions: [...js] };
    });
  };

  const saveProfile = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const sectors = sectorsText.split(',').map((s) => s.trim()).filter(Boolean);
      await projectAPI.update(projectId, { legalProfile: { ...profile, sectors } });
      toast.success('Legal profile saved');
      setEditing(false);
      await load();
    } catch {
      toast.error('Failed to save legal profile — values must come from the ontology');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6 flex items-center gap-3 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking legal applicability…
      </div>
    );
  }
  if (!data) return null;

  const roles = profile.addresseeClasses ?? [];

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-[#7c3aed]" />
          <div>
            <h3 className="text-slate-100 font-semibold">Does this law bind us?</h3>
            <p className="text-xs text-slate-400">
              Legal profile × corpus typing — four states per law, with citations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((e) => !e)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#334155] text-slate-300 hover:bg-[#0f172a]"
          >
            {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? 'Cancel' : 'Edit profile'}
          </button>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#334155] text-slate-300 hover:bg-[#0f172a]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Profile editor */}
      {editing && (
        <div className="px-5 py-4 border-b border-[#334155] space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-300 mb-2">
              Addressee roles — a company usually holds SEVERAL (e.g. controller for customer
              data and processor for client data)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PARTY_ROLE_IDS.map((r) => (
                <button
                  key={r}
                  onClick={() => toggleRole(r)}
                  className={`text-xs px-2 py-1 rounded border ${
                    roles.includes(r)
                      ? 'border-[#7c3aed] bg-[#7c3aed]/20 text-violet-200'
                      : 'border-[#334155] text-slate-400 hover:bg-[#0f172a]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">Jurisdictions</div>
              <div className="flex gap-1.5">
                {JURISDICTION_IDS.map((j) => (
                  <button
                    key={j}
                    onClick={() => toggleJurisdiction(j)}
                    className={`text-xs px-2 py-1 rounded border ${
                      (profile.jurisdictions ?? []).includes(j)
                        ? 'border-[#7c3aed] bg-[#7c3aed]/20 text-violet-200'
                        : 'border-[#334155] text-slate-400 hover:bg-[#0f172a]'
                    }`}
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Sectors (free text, comma-separated) — the NIS2 Annex assignment is a legal
                question, so nothing is forced here
              </div>
              <input
                value={sectorsText}
                onChange={(e) => setSectorsText(e.target.value)}
                placeholder="banking, energy, …"
                className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-1.5 text-sm text-slate-200"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void saveProfile()}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save profile
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4 space-y-2">
        {data.corpus === 'unavailable' && (
          <div className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/50 rounded px-3 py-2">
            The norm corpus is currently unavailable — applicability cannot be assessed right
            now. This is an outage, <b>not</b> “no law applies”.
          </div>
        )}

        {data.corpus === 'ok' && !data.profilePresent && (
          <div className="text-sm text-sky-300 bg-sky-900/20 border border-sky-700/50 rounded px-3 py-2">
            No legal profile yet — every law is <b>undetermined</b>. Unknown is not “does not
            apply”: add your roles above to get a real answer.
          </div>
        )}

        {data.laws.map((law) => {
          const meta = STATE_META[law.state];
          const Icon = meta.icon;
          const open = expanded[law.law] ?? false;
          const thin = law.state === 'applicable' && (law.provisionsBinding ?? 0) <= 2;
          return (
            <div key={law.law} className={`border rounded ${meta.cls}`}>
              <button
                onClick={() => setExpanded((e) => ({ ...e, [law.law]: !open }))}
                className="w-full flex items-center gap-3 px-3 py-2 text-left"
              >
                {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-mono text-sm uppercase">{law.law}</span>
                <span className="text-xs opacity-80">{meta.label}</span>
                {law.state === 'applicable' && (
                  <span className="text-xs opacity-80">
                    — binds {law.provisionsBinding}/{law.provisionsTyped} typed provisions
                    {thin && <span className="ml-1 text-amber-300">(thin evidence)</span>}
                  </span>
                )}
                {law.state === 'displaced' && law.prevailingSource && (
                  <span className="text-xs opacity-80">— by {law.prevailingSource.toUpperCase()}</span>
                )}
              </button>
              {open && (
                <div className="px-10 pb-3 text-xs text-slate-300 space-y-1">
                  <div>{law.reason}</div>

                  {/* THE-573: WELCHE Artikel binden. Der Nutzer sah bisher nur
                      eine Zahl — „3/35" beantwortet nicht, wo er nachlesen muss.
                      Die Kennungen SIND die Section-eIds der Norm (gemessen
                      46/46), deshalb ohne Umweg bis zum Gesetzestext auflösbar. */}
                  {law.bindingProvisionEIds && law.bindingProvisionEIds.length > 0 && (
                    <div data-testid="binding-provisions" className="pt-1">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        Binding articles
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {law.bindingProvisionEIds.map((eId) => (
                          <button
                            key={eId}
                            type="button"
                            onClick={() => void openArticle(law.expression, eId)}
                            className="rounded border border-[#334155] px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:border-[#7c3aed] hover:text-white"
                          >
                            {eId}
                          </button>
                        ))}
                      </div>
                      {/* Gekürzt wird sichtbar. Eine stille Kappung liest sich
                          wie Vollständigkeit — das ist der eigentliche Fehler. */}
                      {typeof law.provisionsBinding === 'number' &&
                        law.provisionsBinding > law.bindingProvisionEIds.length && (
                          <div className="mt-1 text-slate-500">
                            … and {law.provisionsBinding - law.bindingProvisionEIds.length} more
                          </div>
                        )}
                    </div>
                  )}

                  {/* Die Belege der VERDRÄNGUNG — eine andere Aussage als oben. */}
                  {law.citations && law.citations.length > 0 && (
                    <div data-testid="displacement-citations" className="text-slate-400">
                      {law.citations.map((c, i) => (
                        <div key={i}>§ {c}</div>
                      ))}
                    </div>
                  )}
                  {law.missingRoles && law.missingRoles.length > 0 && (
                    <div className="text-slate-400">
                      Binds only: {law.missingRoles.join(', ')} — none of these are in your profile.
                    </div>
                  )}
                  <div className="text-slate-500">
                    Expression: {law.expression} · typed {law.provisionsTyped}/{law.provisionsTotal} provisions
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {article && (
        <div data-testid="article-preview" className="mx-5 mb-3 rounded border border-[#334155] bg-[#0f172a] p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {article.heading || article.eId} — from corpus, read only
            </div>
            <button type="button" onClick={() => setArticle(null)} className="text-slate-500 hover:text-white text-xs">
              ✕
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] text-slate-300">
            {article.loading
              ? 'Loading article text…'
              : article.failed
                ? 'Could not load the article text from the corpus.'
                : article.text}
          </div>
        </div>
      )}

      <div className="px-5 py-3 border-t border-[#334155] text-[11px] text-slate-500">
        {data.disclaimer}
      </div>
    </div>
  );
}
