// ─── THE-576: die Fläche für das dritte Tor ─────────────────────────────
//
// Vor diesem Bauteil konnte man attestieren, aber nicht belegen: Die beiden
// Evidenz-Endpunkte hatten NULL Aufrufer im Client (gemessen THE-571). Ein
// attestiertes Tor ohne anhängbaren Nachweis ist die Behauptung ohne Deckung,
// gegen die die Trust-Spine gebaut wurde.
//
// ── DIE DATEI BLEIBT, WO SIE IST ──
//
// Das Evidenz-Objekt verlangt einen `sha256` des Inhalts und hält zugleich
// fest, dass es BEWUSST keinen Artefakt-Upload gibt (Aufbewahrungs- und
// Löschpflichten bleiben beim Quellsystem, solange THE-536 offen ist).
// Deshalb: Der Browser liest die Datei, bildet den Fingerabdruck, und nur
// dieser geht an den Server. Der Nutzer erfährt das ausdrücklich — es ist
// eine Zusage, keine Nebensache.
//
// ── WAS DIESES BAUTEIL NICHT TUT ──
//
// Es setzt KEIN Tor. Einen Nachweis anzuhängen attestiert nicht; attestieren
// bleibt der getrennte Notar-Akt (THE-557). Und es dupliziert die
// Credential-Regel nicht — die bleibt server-seitig, ihre Begründung ist die
// Botschaft (Muster `setGate`).
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { requirementsAPI, type EvidenceDoc } from '../../services/api';
import { sha256OfFile } from './evidenceHash';

/** Vorschläge, kein Werteraum — der kanonische Katalog kommt aus THE-553. */
const KIND_SUGGESTIONS = ['Meldung', 'Bericht', 'Register-Eintrag', 'Zertifikat', 'Protokoll'];

interface Props {
  projectId: string;
  requirementId: string;
  /** Nur zur Anzeige der Negativ-Kontrolle — dieses Bauteil setzt kein Tor. */
  attested: boolean;
}

export default function EvidencePanel({ projectId, requirementId, attested }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EvidenceDoc[]>([]);
  const [fresh, setFresh] = useState(0);
  const [kind, setKind] = useState('');
  const [ref, setRef] = useState('');
  const [hash, setHash] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await requirementsAPI.listEvidence(projectId, requirementId);
      setItems(res.data.data ?? []);
      setFresh(res.data.fresh ?? 0);
    } catch {
      // Lesen darf die Karte nicht sprengen — die Zahl bleibt dann bei 0.
      setItems([]);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Der Fingerabdruck entsteht HIER. Die Datei geht nirgendwohin. */
  const onPickFile = useCallback(async (file: File | undefined) => {
    if (!file) {
      setHash('');
      setFileName('');
      return;
    }
    setFileName(file.name);
    try {
      setHash(await sha256OfFile(file));
    } catch {
      setHash('');
      toast.error('Could not read that file — the fingerprint was not computed.');
    }
  }, []);

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      await requirementsAPI.addEvidence(projectId, requirementId, { kind: kind.trim(), ref: ref.trim(), sha256: hash });
      toast.success('Evidence attached');
      setKind('');
      setRef('');
      setHash('');
      setFileName('');
      await load();
    } catch (err: unknown) {
      // Die Server-Begründung IST die Botschaft — der Credential-Guard und die
      // Hash-Prüfung leben dort, nicht hier.
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error ?? 'Could not attach evidence');
    } finally {
      setSaving(false);
    }
  }, [projectId, requirementId, kind, ref, hash, load]);

  const canSubmit = kind.trim().length > 0 && ref.trim().length > 0 && hash.length === 64 && !saving;
  const staleCount = items.filter((i) => i.stale).length;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] hover:text-white"
      >
        Evidence ({fresh} fresh{staleCount > 0 ? `, ${staleCount} stale` : ''})
      </button>

      {/* REQ-576.3: Attestiert und unbelegt ist ein eigener, sichtbarer Zustand.
          „Nichts erfasst" und „alles veraltet" sind zwei verschiedene Aussagen. */}
      {attested && fresh === 0 && (
        <p data-testid="attested-unproven" className="mt-0.5 text-[9px] text-[#eab308]">
          {staleCount > 0
            ? `Attested, but all ${staleCount} evidence item${staleCount === 1 ? '' : 's'} are stale — the attestation is not currently backed.`
            : 'Attested, but none collected — the attestation is not currently backed.'}
        </p>
      )}

      {open && (
        <div className="mt-1 space-y-2 rounded border border-[var(--border-subtle)] p-2">
          {items.length === 0 ? (
            <p className="text-[9px] text-[var(--text-tertiary)]">No evidence attached yet.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((e) => (
                <li key={e._id} className="text-[9px] leading-snug">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-white">{e.kind}</span>
                    {e.stale && (
                      <span data-testid="evidence-stale" className="rounded bg-[#7f1d1d] px-1 text-[8px] text-[#fecaca]">
                        stale — no longer counts
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--text-tertiary)] break-all">{e.ref}</div>
                  <div data-testid="evidence-hash" className="font-mono text-[8px] text-[var(--text-tertiary)]">
                    {e.sha256.slice(0, 16)}…
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
            <label className="block text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Kind
              <input
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                list="evidence-kinds"
                className="mt-0.5 w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-white outline-none"
              />
            </label>
            <datalist id="evidence-kinds">
              {KIND_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>

            <label className="block text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Reference
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="https://register.example/… (no credentials)"
                className="mt-0.5 w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-white outline-none"
              />
            </label>

            <input
              data-testid="evidence-file"
              type="file"
              aria-label="File to fingerprint"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
              className="w-full text-[9px] text-[var(--text-tertiary)]"
            />
            {/* Die Zusage, sichtbar und nicht im Kleingedruckten. */}
            <p data-testid="no-upload-notice" className="text-[8px] text-[var(--text-tertiary)]">
              The file is <b>not uploaded</b> — it never leaves this machine. Only its SHA-256
              fingerprint is stored, so the document stays under your source system’s retention rules.
            </p>
            {hash && (
              <p data-testid="evidence-computed-hash" className="font-mono text-[8px] text-[#22c55e] break-all">
                {fileName}: {hash}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="w-full rounded border border-[var(--border-subtle)] px-2 py-1 text-[9px] text-slate-300 hover:border-[#7c3aed] disabled:opacity-40"
            >
              Attach evidence
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
