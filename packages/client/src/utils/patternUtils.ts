/**
 * Custom Pattern utilities — extract patterns from canvas selection,
 * instantiate them, and persist to localStorage.
 */
import type { ArchitectureElement, Connection } from '../stores/architectureStore';
import type { PatternElement, PatternConnection } from '@thearchitect/shared/src/constants/pattern-templates';
import { LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer, ElementType, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface CustomPattern {
  id: string;
  name: string;
  description: string;
  elements: PatternElement[];
  connections: PatternConnection[];
  createdAt: number;
}

// ──────────────────────────────────────────────────────────
// Extract pattern from selected elements
// ──────────────────────────────────────────────────────────

const LAYER_TO_DOMAIN: Record<string, TOGAFDomain> = {
  strategy: 'strategy',
  business: 'business',
  information: 'data',
  application: 'application',
  technology: 'technology',
  physical: 'technology',
  motivation: 'motivation',
  implementation_migration: 'implementation',
};

export function extractPattern(
  selectedIds: Set<string>,
  allElements: ArchitectureElement[],
  allConnections: Connection[],
  name: string,
  description: string,
): CustomPattern {
  const selected = allElements.filter(el => selectedIds.has(el.id));
  if (selected.length === 0) throw new Error('No elements selected');

  // Compute centroid
  const centerX = selected.reduce((sum, el) => sum + el.position3D.x, 0) / selected.length;
  const centerZ = selected.reduce((sum, el) => sum + el.position3D.z, 0) / selected.length;

  // Map original IDs → sequential keys
  const idToKey = new Map<string, string>();
  selected.forEach((el, i) => idToKey.set(el.id, `e${i}`));

  // Build pattern elements with relative positions
  const elements: PatternElement[] = selected.map(el => ({
    key: idToKey.get(el.id)!,
    type: el.type as ElementType,
    name: el.name,
    layer: el.layer as ArchitectureLayer,
    relX: Math.round((el.position3D.x - centerX) * 10) / 10,
    relZ: Math.round((el.position3D.z - centerZ) * 10) / 10,
  }));

  // Filter connections to only those within the selection
  const connections: PatternConnection[] = allConnections
    .filter(c => selectedIds.has(c.sourceId) && selectedIds.has(c.targetId))
    .map(c => ({
      sourceKey: idToKey.get(c.sourceId)!,
      targetKey: idToKey.get(c.targetId)!,
      type: c.type,
    }));

  return {
    id: crypto.randomUUID(),
    name,
    description,
    elements,
    connections,
    createdAt: Date.now(),
  };
}

// ──────────────────────────────────────────────────────────
// Instantiate a pattern at a given position
// ──────────────────────────────────────────────────────────

export function instantiatePattern(
  pattern: CustomPattern,
  dropPosition: { x: number; z: number },
): { elements: ArchitectureElement[]; connections: Connection[] } {
  const timestamp = Date.now();
  const keyToId = new Map<string, string>();

  // Generate new IDs
  pattern.elements.forEach(pe => {
    keyToId.set(pe.key, `el-${timestamp}-${Math.random().toString(36).slice(2, 7)}`);
  });

  const elements: ArchitectureElement[] = pattern.elements.map(pe => ({
    id: keyToId.get(pe.key)!,
    type: pe.type,
    name: pe.name,
    description: '',
    layer: pe.layer,
    togafDomain: (LAYER_TO_DOMAIN[pe.layer] || 'application') as TOGAFDomain,
    maturityLevel: 3,
    riskLevel: 'low' as const,
    status: 'current' as const,
    position3D: {
      x: dropPosition.x + pe.relX,
      y: LAYER_Y[pe.layer] || 0,
      z: dropPosition.z + pe.relZ,
    },
    metadata: { fromPattern: pattern.id },
  }));

  const connections: Connection[] = pattern.connections.map(pc => ({
    id: `conn-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    sourceId: keyToId.get(pc.sourceKey)!,
    targetId: keyToId.get(pc.targetKey)!,
    type: pc.type,
  }));

  return { elements, connections };
}

// ──────────────────────────────────────────────────────────
// localStorage persistence
// ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'ta_custom_patterns';

export function loadCustomPatterns(): CustomPattern[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPattern(pattern: CustomPattern): void {
  const patterns = loadCustomPatterns();
  patterns.unshift(pattern);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
  window.dispatchEvent(new Event('custom-patterns-changed'));
}

export function deleteCustomPattern(id: string): void {
  const patterns = loadCustomPatterns().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
  window.dispatchEvent(new Event('custom-patterns-changed'));
}
