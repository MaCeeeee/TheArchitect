import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Focus trap: focus first interactive element on open
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const first = dialogRef.current.querySelector<HTMLElement>('button, input, textarea, select, [tabindex]');
    first?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${SIZE_CLASSES[size]} rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-modal)] animate-[scaleIn_150ms_ease-out]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white transition" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="p-5 space-y-4">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
