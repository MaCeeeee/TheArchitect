import { ChevronDown, ChevronRight } from 'lucide-react';
import { LADDER_TEXT } from './ladderText';

interface MathToggleProps {
  open: boolean;
  /** id of the element that holds the mathematical wording */
  controls: string;
  /** Accessible name: says which step or finding the button belongs to. It starts with the visible text. */
  label: string;
  onToggle: () => void;
}

/**
 * Small button that opens the mathematical wording of a step or of a finding; closed at first.
 * The text is 8 px; the padding makes the click target 16 px high or more, and the negative
 * margin keeps the lines around it where they were.
 */
export function MathToggle({ open, controls, label, onToggle }: MathToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      onClick={onToggle}
      className="flex items-center gap-0.5 min-h-4 py-1 -my-1 text-[8px] text-[var(--text-tertiary)] hover:text-white"
    >
      {open ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
      {LADDER_TEXT.mathButton}
    </button>
  );
}
