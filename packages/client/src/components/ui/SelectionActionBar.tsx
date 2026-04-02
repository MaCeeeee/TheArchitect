/**
 * SelectionActionBar — Floating bar when 2+ elements are selected.
 * Shows element count, "Save as Pattern" button, and "Clear" button.
 */
import { useState, useMemo } from 'react';
import { Boxes, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useArchitectureStore } from '../../stores/architectureStore';
import SavePatternDialog from './SavePatternDialog';
import { extractPattern, saveCustomPattern } from '../../utils/patternUtils';

export default function SelectionActionBar() {
  const selectedIds = useArchitectureStore(s => s.selectedElementIds);
  const elements = useArchitectureStore(s => s.elements);
  const connections = useArchitectureStore(s => s.connections);
  const selectElement = useArchitectureStore(s => s.selectElement);
  const [showDialog, setShowDialog] = useState(false);

  const count = selectedIds.size;

  // Count connections between selected elements
  const connectionCount = useMemo(() => {
    if (count < 2) return 0;
    return connections.filter(
      c => selectedIds.has(c.sourceId) && selectedIds.has(c.targetId),
    ).length;
  }, [selectedIds, connections, count]);

  if (count < 2) return null;

  const handleSave = (name: string, description: string) => {
    try {
      const pattern = extractPattern(selectedIds, elements, connections, name, description);
      saveCustomPattern(pattern);
      setShowDialog(false);
      toast.success(`Pattern "${name}" saved`);
    } catch (err) {
      toast.error('Failed to save pattern');
    }
  };

  const handleClear = () => {
    // Deselect all by selecting nothing
    selectElement('');
  };

  return (
    <>
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 backdrop-blur-sm px-4 py-2 shadow-xl">
        <span className="text-xs text-white font-medium">
          {count} elements
        </span>
        {connectionCount > 0 && (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            ({connectionCount} conn.)
          </span>
        )}
        <div className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-default)]/10 border border-[var(--accent-default)]/20 px-3 py-1 text-[11px] font-medium text-[var(--accent-text)] hover:bg-[var(--accent-default)]/20 transition"
        >
          <Boxes size={12} />
          Save as Pattern
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg p-1 text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--surface-base)] transition"
          title="Clear selection"
        >
          <X size={14} />
        </button>
      </div>

      <SavePatternDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onSave={handleSave}
        elementCount={count}
        connectionCount={connectionCount}
      />
    </>
  );
}
