/**
 * SavePatternDialog — Lightweight modal for naming a custom pattern.
 */
import { useState, useEffect, useRef } from 'react';
import { X, Save, Boxes } from 'lucide-react';

interface SavePatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  elementCount: number;
  connectionCount: number;
}

export default function SavePatternDialog({
  isOpen,
  onClose,
  onSave,
  elementCount,
  connectionCount,
}: SavePatternDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset and focus on open
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <form
        onSubmit={handleSubmit}
        className="relative w-80 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <Boxes size={14} className="text-[var(--accent-text)]" />
          <h3 className="text-xs font-semibold text-white flex-1">Save as Pattern</h3>
          <button type="button" onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Preview */}
          <div className="flex items-center gap-3 rounded-lg bg-[var(--surface-base)] px-3 py-2">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {elementCount} element{elementCount !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-[var(--text-disabled)]">&bull;</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {connectionCount} connection{connectionCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Pattern Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Microservice Stack"
              maxLength={60}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-xs text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#00ff41] transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Description <span className="text-[var(--text-disabled)]">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this pattern represent?"
              rows={2}
              maxLength={200}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-xs text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#00ff41] resize-none transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent-default)] px-3 py-1.5 text-xs font-medium text-black hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={12} />
            Save Pattern
          </button>
        </div>
      </form>
    </div>
  );
}
