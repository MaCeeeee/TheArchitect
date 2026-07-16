// packages/client/src/components/journey/CommandMenu.tsx
// The ⌘K command menu (THE-493, Slice 3b): fuzzy-searches the safe command
// registry (THE-492) and executes on Enter. Focus stays in the search input for
// the menu's whole lifetime (list selection via aria-activedescendant) — since
// ViewModeCamera's global keydown early-returns on INPUT targets, the camera's
// f/arrow/number shortcuts are structurally silent while the menu is open.
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { buildCommandRegistry, type Command, type CommandContext } from './commands';
import { filterCommands } from './commandFilter';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  projectId: string;
}

export default function CommandMenu({ projectId }: Props) {
  const navigate = useNavigate();
  const isOpen = useUIStore((s) => s.isCommandMenuOpen);
  const setOpen = useUIStore((s) => s.setCommandMenuOpen);
  const phase = useJourneyStore((s) => s.currentPhase);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Stable callback: useFocusTrap's effect depends on onEscape — an inline arrow
  // would re-subscribe (and re-focus) on every keystroke.
  const close = useCallback(() => setOpen(false), [setOpen]);
  const containerRef = useFocusTrap(isOpen, close);

  const ctx: CommandContext = useMemo(
    () => ({ projectId, navigate, phase }),
    [projectId, navigate, phase],
  );

  const visible: Command[] = useMemo(() => {
    if (!isOpen) return [];
    const all = Object.values(buildCommandRegistry(ctx)).filter(
      (c) => !c.available || c.available(ctx),
    );
    return filterCommands(all, query);
  }, [isOpen, ctx, query]);

  // Reset transient state whenever the menu (re)opens; reset the highlight to the
  // top match on every query change (standard palette behaviour).
  useEffect(() => {
    if (isOpen) { setQuery(''); setActiveIndex(0); }
  }, [isOpen]);
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const runActive = () => {
    const cmd = visible[activeIndex];
    if (!cmd) return;
    setOpen(false);
    cmd.run(ctx);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keep every key inside the menu — nothing may reach the camera shortcuts.
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    // Tab/Shift+Tab would break the focus-stays-in-input invariant: useFocusTrap's
    // wrap focuses the last FOCUSABLE (an option button, tabIndex=-1 notwithstanding),
    // and plain Tab would leave the overlay. The menu has exactly one focus stop.
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  // Group headers: render in registry order, header when the group changes.
  let lastGroup = '';

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        // Clicking anywhere in the panel must not steal focus from the input
        // (mousedown moves focus before click) — click handlers still fire.
        onMouseDown={(e) => e.preventDefault()}
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search size={14} className="text-[var(--text-tertiary)]" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-menu-list"
            aria-activedescendant={visible[activeIndex] ? `cmd-${visible[activeIndex].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to any tool…"
            className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">esc</kbd>
        </div>
        <ul id="command-menu-list" role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto py-1">
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">No matching commands</li>
          )}
          {visible.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <li key={cmd.id}>
                {header && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    {header}
                  </div>
                )}
                <button
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={runActive}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                    i === activeIndex
                      ? 'bg-[#7c3aed]/15 text-white'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  {cmd.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
