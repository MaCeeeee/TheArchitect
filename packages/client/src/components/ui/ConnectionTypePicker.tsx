/**
 * ConnectionTypePicker — Quick Linker floating dialog
 *
 * Appears near the target element after clicking source → target in connection mode.
 * Shows only valid ArchiMate relationship types for the given element pair.
 * Pre-selects the smartest default. Enter to confirm, Escape to cancel.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { ArrowRight, X, Info } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import {
  getValidRelationships,
  getDefaultRelationship,
  RELATIONSHIP_DESCRIPTIONS,
  type StandardConnectionType,
} from '@thearchitect/shared/src/constants/archimate-rules';
import { CONNECTION_TYPES } from '@thearchitect/shared/src/constants/togaf.constants';
import { VIEWPOINT_BY_ID } from '@thearchitect/shared/src/constants/archimate-viewpoints';
import type { ElementType } from '@thearchitect/shared/src/types/architecture.types';

// ──────────────────────────────────────────────────────────
// Relationship arrow notation for ArchiMate
// ──────────────────────────────────────────────────────────
const ARROW_STYLE: Record<StandardConnectionType, string> = {
  composition: '\u25C6\u2500\u2500\u2500',     // filled diamond
  aggregation: '\u25C7\u2500\u2500\u2500',     // open diamond
  assignment: '\u25CB\u2500\u2500\u25B6',      // circle to arrow
  realization: '\u2500 \u2500 \u25B7',         // dashed open arrow
  serving: '\u2500\u2500\u2500\u25B6',         // solid arrow
  access: '\u2500 \u2500 \u25B6',             // dashed arrow
  influence: '\u2500 \u2500 \u25B7',           // dashed open (dotted)
  triggering: '\u2500\u2500\u25B6',            // solid arrow (thin)
  flow: '\u2500 - \u25B6',                    // dashed with arrow
  specialization: '\u2500\u2500\u25B7',        // open triangle
  association: '\u2500\u2500\u2500',           // plain line
};

export default function ConnectionTypePicker() {
  const containerRef = useRef<HTMLDivElement>(null);
  const showPicker = useUIStore(s => s.showConnectionPicker);
  const position = useUIStore(s => s.connectionPickerPosition);
  const sourceId = useUIStore(s => s.connectionSourceId);
  const targetId = useUIStore(s => s.connectionTargetId);
  const closePicker = useUIStore(s => s.closeConnectionPicker);
  const exitConnectionMode = useUIStore(s => s.exitConnectionMode);
  const elements = useArchitectureStore(s => s.elements);
  const addConnection = useArchitectureStore(s => s.addConnection);
  const selectElement = useArchitectureStore(s => s.selectElement);

  const activeViewpoint = useUIStore(s => s.activeViewpoint);

  const sourceEl = elements.find(el => el.id === sourceId);
  const targetEl = elements.find(el => el.id === targetId);

  const validTypes = (() => {
    if (!sourceEl || !targetEl) return [];
    let types = getValidRelationships(sourceEl.type as ElementType, targetEl.type as ElementType);
    // Filter by active viewpoint's allowed connection types
    if (activeViewpoint) {
      const vp = VIEWPOINT_BY_ID.get(activeViewpoint);
      if (vp) {
        const allowed = new Set(vp.allowedConnectionTypes);
        types = types.filter(t => allowed.has(t));
        // Always keep association as fallback
        if (types.length === 0) types = ['association'];
      }
    }
    return types;
  })();

  const defaultType = sourceEl && targetEl
    ? (() => {
        const def = getDefaultRelationship(sourceEl.type as ElementType, targetEl.type as ElementType);
        return validTypes.includes(def) ? def : validTypes[0] || 'association';
      })()
    : 'association';

  const [selectedType, setSelectedType] = useState<StandardConnectionType>(defaultType);
  const [hoveredType, setHoveredType] = useState<StandardConnectionType | null>(null);

  // Reset selection when picker opens with new pair
  useEffect(() => {
    if (showPicker) setSelectedType(defaultType);
  }, [showPicker, defaultType]);

  // Keyboard: Enter = confirm, Escape = cancel, arrows = navigate
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm(selectedType);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = validTypes.indexOf(selectedType);
        if (idx < validTypes.length - 1) setSelectedType(validTypes[idx + 1]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = validTypes.indexOf(selectedType);
        if (idx > 0) setSelectedType(validTypes[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showPicker, selectedType, validTypes]);

  // Click outside → cancel
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    // Delay to avoid catching the click that opened the picker
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [showPicker]);

  const handleConfirm = useCallback((type: StandardConnectionType) => {
    if (!sourceId || !targetId) return;
    const connId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addConnection({
      id: connId,
      sourceId,
      targetId,
      type,
    });
    selectElement(targetId);
    closePicker();
    // Reset source for next connection (stay in connection mode)
    useUIStore.getState().setConnectionSource(null);
  }, [sourceId, targetId, addConnection, selectElement, closePicker]);

  const handleCancel = useCallback(() => {
    closePicker();
    // Reset source, stay in connection mode
    useUIStore.getState().setConnectionSource(null);
  }, [closePicker]);

  if (!showPicker || !position || !sourceEl || !targetEl) return null;

  // Position the picker near the target, clamped to viewport
  const style = getPickerPosition(position);
  const descType = hoveredType || selectedType;

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">{sourceEl.name}</span>
        <ArrowRight size={10} className="text-[var(--text-tertiary)] shrink-0" />
        <span className="text-[10px] font-medium text-white truncate">{targetEl.name}</span>
        <button onClick={handleCancel} className="ml-auto text-[var(--text-tertiary)] hover:text-white shrink-0">
          <X size={12} />
        </button>
      </div>

      {/* Relationship Types List */}
      <div className="max-h-56 overflow-y-auto py-1">
        {validTypes.map(type => {
          const connDef = CONNECTION_TYPES.find(c => c.type === type);
          const isSelected = type === selectedType;
          const isDefault = type === defaultType;

          return (
            <button
              key={type}
              onClick={() => handleConfirm(type)}
              onMouseEnter={() => { setHoveredType(type); setSelectedType(type); }}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition ${
                isSelected
                  ? 'bg-[var(--accent-default)]/10 text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-base)]'
              }`}
            >
              {/* Color dot */}
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: connDef?.color || '#64748b' }}
              />
              {/* Arrow notation */}
              <span className="text-[10px] font-mono text-[var(--text-disabled)] w-10 shrink-0">
                {ARROW_STYLE[type]}
              </span>
              {/* Name */}
              <span className="text-[11px] flex-1 truncate">
                {connDef?.label || type}
              </span>
              {/* Default badge */}
              {isDefault && (
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--accent-text)] bg-[var(--accent-default)]/20 px-1.5 py-0.5 rounded-full shrink-0">
                  default
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Description footer */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-2 flex items-start gap-1.5">
        <Info size={10} className="text-[var(--text-disabled)] shrink-0 mt-0.5" />
        <p className="text-[10px] text-[var(--text-tertiary)] leading-tight">
          {RELATIONSHIP_DESCRIPTIONS[descType]}
        </p>
      </div>

      {/* Keyboard hint */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 flex items-center gap-3 text-[9px] text-[var(--text-disabled)]">
        <span><kbd className="px-1 py-0.5 rounded bg-[var(--surface-base)] font-mono">Enter</kbd> confirm</span>
        <span><kbd className="px-1 py-0.5 rounded bg-[var(--surface-base)] font-mono">Esc</kbd> cancel</span>
        <span><kbd className="px-1 py-0.5 rounded bg-[var(--surface-base)] font-mono">&uarr;&darr;</kbd> navigate</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Position helper: clamp to viewport
// ──────────────────────────────────────────────────────────
function getPickerPosition(pos: { x: number; y: number }): React.CSSProperties {
  const PICKER_W = 288;
  const PICKER_H = 320;
  const MARGIN = 12;

  let left = pos.x + 16;
  let top = pos.y - 40;

  // Clamp to viewport
  if (typeof window !== 'undefined') {
    if (left + PICKER_W > window.innerWidth - MARGIN) {
      left = pos.x - PICKER_W - 16;
    }
    if (top + PICKER_H > window.innerHeight - MARGIN) {
      top = window.innerHeight - PICKER_H - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;
    if (left < MARGIN) left = MARGIN;
  }

  return { left, top };
}
