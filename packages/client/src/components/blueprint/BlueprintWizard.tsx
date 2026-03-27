import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Wand2, Eye, Settings2, Upload } from 'lucide-react';
import PageShell from '../../design-system/layout/PageShell';
import Stepper from '../../design-system/patterns/Stepper';
import BlueprintQuestionnaire from './BlueprintQuestionnaire';
import BlueprintProgress from './BlueprintProgress';
import BlueprintPreview from './BlueprintPreview';
import BlueprintEditor from './BlueprintEditor';
import BlueprintImport from './BlueprintImport';
import { useBlueprintStore } from '../../stores/blueprintStore';

const STEPS = [
  { id: 'questionnaire', label: 'Questionnaire', icon: <FileText size={12} /> },
  { id: 'generate', label: 'Generate', icon: <Wand2 size={12} /> },
  { id: 'preview', label: 'Preview', icon: <Eye size={12} /> },
  { id: 'edit', label: 'Customize', icon: <Settings2 size={12} /> },
  { id: 'import', label: 'Import', icon: <Upload size={12} /> },
];

export default function BlueprintWizard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const step = useBlueprintStore((s) => s.step);
  const setStep = useBlueprintStore((s) => s.setStep);
  const generate = useBlueprintStore((s) => s.generate);
  const isGenerating = useBlueprintStore((s) => s.isGenerating);
  const error = useBlueprintStore((s) => s.error);
  const reset = useBlueprintStore((s) => s.reset);

  // Determine the highest completed step for stepper navigation
  const result = useBlueprintStore((s) => s.result);
  const completedIndex = result ? 2 : step > 0 ? step - 1 : -1;

  const handleBack = () => {
    reset();
    navigate(`/project/${projectId}`);
  };

  const handleGenerate = () => {
    if (projectId) generate(projectId);
  };

  const handleStepClick = (index: number) => {
    // Don't allow navigating away from generation
    if (isGenerating) return;
    // Don't allow skipping ahead
    if (index > completedIndex + 1) return;
    setStep(index as 0 | 1 | 2 | 3 | 4);
  };

  // Allow retrying from progress step on error
  const handleRetry = () => {
    if (projectId) generate(projectId);
  };

  return (
    <PageShell onBack={handleBack} backLabel="Back to Project">
      {/* Stepper */}
      <div className="mb-8">
        <Stepper
          steps={STEPS}
          currentIndex={step}
          completedIndex={completedIndex}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Step content */}
      <div className="max-w-2xl mx-auto">
        {step === 0 && <BlueprintQuestionnaire onGenerate={handleGenerate} />}
        {step === 1 && (
          <>
            <BlueprintProgress />
            {error && !isGenerating && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition"
                >
                  Try Again
                </button>
              </div>
            )}
          </>
        )}
        {step === 2 && <BlueprintPreview />}
        {step === 3 && <BlueprintEditor />}
        {step === 4 && <BlueprintImport />}
      </div>
    </PageShell>
  );
}
