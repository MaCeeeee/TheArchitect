import { useEffect, useRef } from 'react';
import { Trash2, Copy, Link, Eye, Edit3, GitBranch } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function ContextMenu3D() {
  const contextMenu = useArchitectureStore((s) => s.contextMenu);
  const closeContextMenu = useArchitectureStore((s) => s.closeContextMenu);
  const removeElement = useArchitectureStore((s) => s.removeElement);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const elements = useArchitectureStore((s) => s.elements);
  const addElement = useArchitectureStore((s) => s.addElement);
  const ref = useRef<HTMLDivElement>(null);

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

  const items = [
    { icon: Eye, label: 'Focus', onClick: handleSelect },
    { icon: Edit3, label: 'Edit Properties', onClick: handleSelect },
    { icon: Copy, label: 'Duplicate', onClick: handleDuplicate },
    { icon: Link, label: 'Add Connection', onClick: () => closeContextMenu() },
    { icon: GitBranch, label: 'Show Dependencies', onClick: () => closeContextMenu() },
    { divider: true as const },
    { icon: Trash2, label: 'Delete', onClick: handleDelete, danger: true },
  ];

  return (
    <div
      ref={ref}
      className="absolute z-50 min-w-[180px] rounded-lg border border-[#1a2a1a] bg-[#111111] py-1 shadow-xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <div className="px-3 py-1.5 border-b border-[#1a2a1a]">
        <p className="text-xs font-medium text-white truncate">{element.name}</p>
        <p className="text-[10px] text-[#4a5a4a]">{element.type.replace(/_/g, ' ')}</p>
      </div>
      {items.map((item, i) => {
        if ('divider' in item) {
          return <div key={i} className="my-1 border-t border-[#1a2a1a]" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={item.onClick}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-[#7a8a7a] hover:bg-[#1a2a1a] hover:text-white'
            }`}
          >
            <Icon size={14} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
