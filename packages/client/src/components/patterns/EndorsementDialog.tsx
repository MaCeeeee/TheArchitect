import { useEffect, useRef, useState } from 'react';
import { Star, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  patternSlug: string | null;
  patternName?: string;
  onClose: () => void;
  onSubmit: (slug: string, reason: string) => Promise<void>;
}

const MIN_LENGTH = 30;
const MAX_LENGTH = 500;

export function EndorsementDialog({
  isOpen,
  patternSlug,
  patternName,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, submitting]);

  if (!isOpen || !patternSlug) return null;

  const trimmed = reason.trim();
  const remaining = MIN_LENGTH - trimmed.length;
  const valid = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(patternSlug, trimmed);
      toast.success('Endorsement submitted');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Endorse failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
        data-testid="endorsement-dialog"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Star className="w-5 h-5 text-purple-300 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">
                Endorse as Architect
              </h2>
              {patternName && (
                <p className="text-xs text-slate-400 truncate" title={patternName}>
                  {patternName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
            disabled={submitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs text-slate-400 mb-1">
          Why do you recommend this pattern? (min. {MIN_LENGTH} chars)
        </label>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#7c3aed] resize-none"
          rows={4}
          placeholder="E.g. 'Compliant with NIS2 out of the box, used successfully in 3 supplier-onboarding workflows...'"
          maxLength={MAX_LENGTH}
          disabled={submitting}
          data-testid="endorsement-reason"
        />

        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span
            className={
              valid
                ? 'text-emerald-300'
                : trimmed.length > 0
                  ? 'text-yellow-300'
                  : 'text-slate-500'
            }
          >
            {!valid && remaining > 0 ? (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {remaining} more character{remaining === 1 ? '' : 's'} needed
              </span>
            ) : valid ? (
              <span>Ready to submit</span>
            ) : (
              <span>Type at least {MIN_LENGTH} characters</span>
            )}
          </span>
          <span className="text-slate-500">
            {trimmed.length} / {MAX_LENGTH}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="flex-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="flex-1 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            data-testid="endorsement-submit"
          >
            {submitting ? 'Submitting…' : 'Submit Endorsement'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EndorsementDialog;
