import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outlined';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:  'bg-[var(--accent-default)] text-black hover:bg-[var(--accent-hover)] font-medium',
  ghost:    'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-white',
  danger:   'bg-red-600 text-white hover:bg-red-700 font-medium',
  outlined: 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent-default)] hover:text-white',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs gap-1 rounded',
  md: 'px-3 py-1.5 text-sm gap-1.5 rounded-md',
  lg: 'px-4 py-2 text-sm gap-2 rounded-md',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', icon, children, className = '', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
export default Button;
