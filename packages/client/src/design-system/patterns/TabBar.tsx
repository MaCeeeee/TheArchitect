import type { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

type TabBarVariant = 'text' | 'icon' | 'pill';

interface TabBarProps {
  tabs: Tab[];
  activeId: string;
  onTabChange: (id: string) => void;
  variant?: TabBarVariant;
  className?: string;
}

export default function TabBar({ tabs, activeId, onTabChange, variant = 'text', className = '' }: TabBarProps) {
  if (variant === 'icon') {
    return (
      <div className={`flex border-b border-[var(--border-subtle)] ${className}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center p-2.5 transition ${
              activeId === tab.id
                ? 'text-[var(--accent-default)] border-b-2 border-[var(--accent-default)]'
                : 'text-[var(--text-tertiary)] hover:text-white'
            }`}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={`flex gap-1 p-1 bg-[var(--surface-base)] rounded-lg ${className}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
              activeId === tab.id
                ? 'bg-[var(--surface-overlay)] text-white'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  // Default: text variant
  return (
    <div className={`flex border-b border-[var(--border-subtle)] ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition ${
            activeId === tab.id
              ? 'text-white border-b-2 border-[var(--accent-default)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
