/**
 * useElementHealth — Computes a health score and actionable suggestions
 * for an architecture element based on modeling completeness and standards.
 */
import { useMemo } from 'react';
import { useArchitectureStore } from '../stores/architectureStore';
import { ARCHIMATE_STANDARD_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared/src/constants/togaf.constants';
import { CATEGORY_BY_TYPE } from '@thearchitect/shared/src/constants/archimate-categories';
import { isValidRelationship, type StandardConnectionType } from '@thearchitect/shared/src/constants/archimate-rules';
import type { ElementType } from '@thearchitect/shared/src/types/architecture.types';

export type HealthLevel = 'good' | 'warn' | 'bad';

export interface HealthIssue {
  level: HealthLevel;
  message: string;
  action?: string;
}

export interface ElementHealth {
  score: number;          // 0-100
  level: HealthLevel;     // worst issue level
  issues: HealthIssue[];
}

const CHECKS = [
  checkName,
  checkDescription,
  checkConnections,
  checkStandard,
  checkConnectionValidity,
];

export function useElementHealth(elementId: string | null): ElementHealth | null {
  const elements = useArchitectureStore(s => s.elements);
  const connections = useArchitectureStore(s => s.connections);

  return useMemo(() => {
    if (!elementId) return null;
    const el = elements.find(e => e.id === elementId);
    if (!el) return null;

    const relConns = connections.filter(c => c.sourceId === el.id || c.targetId === el.id);
    const issues: HealthIssue[] = [];

    for (const check of CHECKS) {
      const issue = check(el, relConns, elements);
      if (issue) issues.push(issue);
    }

    // Score: start at 100, deduct per issue
    let score = 100;
    for (const issue of issues) {
      score -= issue.level === 'bad' ? 25 : issue.level === 'warn' ? 10 : 0;
    }
    score = Math.max(0, score);

    const level: HealthLevel = issues.some(i => i.level === 'bad')
      ? 'bad'
      : issues.some(i => i.level === 'warn')
        ? 'warn'
        : 'good';

    return { score, level, issues };
  }, [elementId, elements, connections]);
}

// ──────────────────────────────────────────────────────────
// Individual checks
// ──────────────────────────────────────────────────────────

function checkName(el: { name: string; type: string }): HealthIssue | null {
  if (el.name.startsWith('New ') || el.name === el.type.replace(/_/g, ' ')) {
    return {
      level: 'warn',
      message: 'Default name — not yet customized',
      action: 'Give this element a meaningful name',
    };
  }
  return null;
}

function checkDescription(el: { description: string }): HealthIssue | null {
  if (!el.description || el.description.trim().length === 0) {
    return {
      level: 'warn',
      message: 'No description',
      action: 'Add a description to improve documentation',
    };
  }
  return null;
}

function checkConnections(
  el: { id: string; type: string },
  conns: { sourceId: string; targetId: string }[],
): HealthIssue | null {
  // Grouping and location don't need connections
  if (['grouping', 'location'].includes(el.type)) return null;

  if (conns.length === 0) {
    return {
      level: 'bad',
      message: 'Isolated element — no connections',
      action: 'Connect this element to related architecture (press C)',
    };
  }
  if (conns.length === 1) {
    return {
      level: 'warn',
      message: 'Only 1 connection — may be underconnected',
      action: 'Consider adding more relationships',
    };
  }
  return null;
}

function checkStandard(el: { type: string }): HealthIssue | null {
  const elType = el.type as ElementType;
  if (!ARCHIMATE_STANDARD_TYPES.has(elType)) {
    const replacement = LEGACY_TYPE_MAP[elType];
    if (replacement) {
      const cat = CATEGORY_BY_TYPE.get(replacement);
      return {
        level: 'warn',
        message: `Legacy type — not ArchiMate 3.2 standard`,
        action: `Migrate to "${cat?.description || replacement}"`,
      };
    }
    // Extension type (ai_agent, data_entity, etc.)
    return {
      level: 'warn',
      message: 'Extension type — not in ArchiMate 3.2 core',
    };
  }
  return null;
}

function checkConnectionValidity(
  el: { id: string; type: string },
  conns: { sourceId: string; targetId: string; type: string }[],
  allElements: { id: string; type: string }[],
): HealthIssue | null {
  const STANDARD_TYPES = new Set([
    'composition', 'aggregation', 'assignment', 'realization',
    'serving', 'access', 'influence', 'triggering', 'flow',
    'specialization', 'association',
  ]);

  let invalidCount = 0;
  for (const conn of conns) {
    // Skip legacy connection types entirely
    if (!STANDARD_TYPES.has(conn.type)) continue;

    const other = conn.sourceId === el.id
      ? allElements.find(e => e.id === conn.targetId)
      : allElements.find(e => e.id === conn.sourceId);
    if (!other) continue;

    const srcType = (conn.sourceId === el.id ? el.type : other.type) as ElementType;
    const tgtType = (conn.sourceId === el.id ? other.type : el.type) as ElementType;

    if (!isValidRelationship(srcType, tgtType, conn.type as StandardConnectionType)) {
      invalidCount++;
    }
  }

  if (invalidCount > 0) {
    return {
      level: 'bad',
      message: `${invalidCount} invalid relationship${invalidCount > 1 ? 's' : ''} per ArchiMate rules`,
      action: 'Review and fix relationship types',
    };
  }
  return null;
}
