import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react';

const STEPS = [
  {
    title: 'Welcome to TheArchitect',
    description: 'TheArchitect is a 3D Enterprise Architecture platform based on the TOGAF 10 framework. Let\'s take a quick tour of the key features.',
    position: 'center' as const,
  },
  {
    title: '3D Architecture View',
    description: 'The main canvas shows your architecture in 3D. Elements are organized across 5 layers: Strategy, Business, Information, Application, and Technology. Drag elements to reposition them.',
    position: 'center' as const,
  },
  {
    title: 'Layer Navigation',
    description: 'Use the Explorer tab in the sidebar to browse elements by layer. Toggle layer visibility using the eye icon, and click elements to select and view their properties.',
    position: 'left' as const,
  },
  {
    title: 'Element Interaction',
    description: 'Click to select, Shift+Click for multi-select, drag to move elements. Right-click for context menu with options like duplicate, delete, and show dependencies.',
    position: 'center' as const,
  },
  {
    title: 'BPMN Import',
    description: 'Import existing BPMN 2.0 files to automatically create architecture elements and connections. Use the import button in the toolbar or sidebar.',
    position: 'right' as const,
  },
  {
    title: 'Keyboard Shortcuts',
    description: 'F = Focus/Fit to screen, Ctrl+Z = Undo, Ctrl+Shift+Z = Redo, Delete = Remove selected element. More shortcuts available in Settings.',
    position: 'center' as const,
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Walkthrough({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-[#1a2a1a] bg-[#111111] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a2a1a] px-5 py-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-[#eab308]" />
            <span className="text-xs text-[#7a8a7a]">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <button onClick={onClose} className="text-[#7a8a7a] hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-3">{currentStep.title}</h3>
          <p className="text-sm text-[#7a8a7a] leading-relaxed">{currentStep.description}</p>
        </div>

        {/* Progress */}
        <div className="px-6 pb-2">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition ${
                  i <= step ? 'bg-[#00ff41]' : 'bg-[#1a2a1a]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1a2a1a] px-5 py-3">
          <button
            onClick={onClose}
            className="text-xs text-[#4a5a4a] hover:text-[#7a8a7a] transition"
          >
            Skip Tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-[#7a8a7a] hover:bg-[#1a2a1a] transition"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) onClose();
                else setStep(step + 1);
              }}
              className="flex items-center gap-1 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
