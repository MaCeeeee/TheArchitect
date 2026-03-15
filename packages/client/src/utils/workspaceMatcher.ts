import type { ArchitectureElement, Connection } from '../stores/architectureStore';

/**
 * Finds shared elements between newly imported elements and existing elements
 * in other workspaces. Creates cross_architecture connections for matches.
 *
 * Match criteria: same name (case-insensitive, trimmed) AND same type
 */
export function findSharedElements(
  newElements: ArchitectureElement[],
  existingElements: ArchitectureElement[],
  _existingConnections: Connection[]
): Connection[] {
  const crossConnections: Connection[] = [];

  // Build lookup map from existing elements (excluding elements from the same workspace)
  const existingByKey = new Map<string, ArchitectureElement[]>();
  for (const el of existingElements) {
    const key = makeMatchKey(el.name, el.type);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, []);
    }
    existingByKey.get(key)!.push(el);
  }

  for (const newEl of newElements) {
    const key = makeMatchKey(newEl.name, newEl.type);
    const matches = existingByKey.get(key);
    if (!matches) continue;

    for (const match of matches) {
      // Don't connect elements in the same workspace
      if (match.workspaceId === newEl.workspaceId) continue;

      crossConnections.push({
        id: `cross-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sourceId: newEl.id,
        targetId: match.id,
        type: 'cross_architecture',
        label: 'shared element',
      });
    }
  }

  return crossConnections;
}

function makeMatchKey(name: string, type: string): string {
  return `${name.trim().toLowerCase()}::${type}`;
}
