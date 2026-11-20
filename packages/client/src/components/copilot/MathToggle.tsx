import { ChevronDown, ChevronRight } from 'lucide-react';
import { LADDER_TEXT } from './ladderText';

interface MathToggleProps {
  open: boolean;
  /** id of the element that holds the mathematical wording */
  controls: string;
  onToggle: () => void;
}

/** Small button that opens the mathematical wording of a step or of a finding; closed at first. */
export function MathToggle({ open, controls, onToggle }: MathToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex items-center gap-0.5 text-[8px] text-[var(--text-tertiary)] hover:text-white"
    >
      {open ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
      {LADDER_TEXT.mathButton}
    </button>
  );
}
