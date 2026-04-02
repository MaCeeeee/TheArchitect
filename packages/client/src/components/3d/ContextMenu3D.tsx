import { useEffect, useRef, useState } from 'react';
import { Trash2, Copy, Link, Eye, Edit3, GitBranch, Boxes } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import SavePatternDialog from '../ui/SavePatternDialog';
import { extractPattern, saveCustomPattern } from '../../utils/patternUtils';
import toast from 'react-hot-toast';

export default function ContextMenu3D() {
  const contextMenu = useArchitectureStore((s) => s.contextMenu);
  const closeContextMenu = useArchitectureStore((s) => s.closeContextMenu);
  const removeElement = useArchitectureStore((s) => s.removeElement);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const selectedElementIds = useArchitectureStore((s) => s.selectedElementIds);
  const addElement = useArchitectureStore((s) => s.addElement);
  const ref = useRef<HTMLDivElement>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const element = elements.find((el) => el.id === contextMenu.elementId);
  if (!element) return null;

  const handleDuplicate = () => {
    const newElement = {
      ...element,
      id: `${element.id}-copy-${Date.now()}`,
      name: `${element.name} (Copy)`,
      position3D: {
        x: element.position3D.x + 2,
        y: element.position3D.y,
        z: element.position3D.z + 2,
      },
    };
    addElement(newElement);
    selectElement(newElement.id);
    closeContextMenu();
  };

  const handleDelete = () => {
    removeElement(contextMenu.elementId);
    closeContextMenu();
  };

  const handleSelect = () => {
    selectElement(contextMenu.elementId);
    closeContextMenu();
  };

  const hasMultiSelect = selectedElementIds.size >= 2;

  const handleSavePattern = (name: string, description: string) => {
    try {
      const pattern = extractPattern(selectedElementIds, elements, connections, name, description);
      saveCustomPattern(pattern);
      setShowSaveDialog(false);
      closeContextMenu();
      toast.success(`Pattern "${name}" saved`);
    } catch {
      toast.error('Failed to save pattern');
    }
  };

  // Count connections within selection for the dialog
  const selectionConnectionCount = hasMultiSelect
    ? connections.filter(c => selectedElementIds.has(c.sourceId) && selectedElementIds.has(c.targetId)).length
    : 0;

  const items = [
    { icon: Eye, label: 'Focus', onClick: handleSelect },
    { icon: Edit3, label: 'Edit Properties', onClick: handleSelect },
    { icon: Copy, label: 'Duplicate', onClick: handleDuplicate },
    { icon: Link, label: 'Connect from here', onClick: () => {
      const ui = useUIStore.getState();
      ui.enterConnectionMode();
      ui.setConnectionSource(contextMenu.elementId);
      selectElement(contextMenu.elementId);
      closeContextMenu();
    }},
    { icon: GitBranch, label: 'Show Dependencies', onClick: () => closeContextMenu() },
    ...(hasMultiSelect ? [
      { icon: Boxes, label: `Save Selection as Pattern (${selectedElementIds.size})`, onClick: () => setShowSaveDialog(true) },
    ] : []),
    { divider: true as const },
    { icon: Trash2, label: 'Delete', onClick: handleDelete, danger: true },
  ];

  return (
    <div
      ref={ref}
      className="absolute z-50 min-w-[180px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1 shadow-xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <div className="px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <p className="text-xs font-medium text-white truncate">{element.name}</p>
        <p className="text-[10px] text-[var(--text-tertiary)]">{element.type.replace(/_/g, ' ')}</p>
      </div>
      {items.map((item, i) => {
        if ('divider' in item) {
          return <div key={i} className="my-1 border-t border-[var(--border-subtle)]" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={item.onClick}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-[var(--text-secondary)] hover:bg-[#1a2a1a] hover:text-white'
            }`}
          >
            <Icon size={14} />
            {item.label}
          </button>
        );
      })}

      <SavePatternDialog
        isOpen={showSaveDialog}
        onClose={() => { setShowSaveDialog(false); closeContextMenu(); }}
        onSave={handleSavePattern}
        elementCount={selectedElementIds.size}
        connectionCount={selectionConnectionCount}
      />
    </div>
  );
}
