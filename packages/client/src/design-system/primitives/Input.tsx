import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none transition ${
            error
              ? 'border-[var(--status-danger)] focus:border-[var(--status-danger)]'
              : 'border-[var(--border-subtle)] focus:border-[var(--accent-default)]'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-[10px] text-[var(--status-danger)]">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
