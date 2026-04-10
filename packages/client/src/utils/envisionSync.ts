/**
 * Utility for syncing Envision Phase A stakeholders to the ArchiMate 3D Explorer.
 * Creates ArchitectureElement nodes (type: stakeholder, layer: motivation) and
 * auto-connections to existing Goals, Drivers, and Principles.
 */
import { LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureElement, Connection } from '../stores/architectureStore';
import type { Stakeholder } from '../stores/envisionStore';

const SPACING = 3;
const ROW_SIZE = 5;

const CONNECTION_TYPE_MAP: Record<string, string> = {
  driver: 'association',
  goal: 'influence',
  principle: 'association',
  requirement: 'influence',
  constraint: 'influence',
  assessment: 'association',
  outcome: 'influence',
  am_value: 'association',
  meaning: 'association',
};

export function buildStakeholderElement(
  stakeholder: Stakeholder,
  index: number,
  existingMotivationCount: number,
): ArchitectureElement {
  const col = existingMotivationCount + index;
  const x = (col % ROW_SIZE) * SPACING - ((Math.min(ROW_SIZE, col + 1) - 1) * SPACING) / 2;
  const z = Math.floor(col / ROW_SIZE) * SPACING - 6;

  return {
    id: `env-sh-${stakeholder.id}`,
    type: 'stakeholder',
    name: stakeholder.name,
    description: `${stakeholder.role} (${stakeholder.stakeholderType}) — Influence: ${stakeholder.influence}, Attitude: ${stakeholder.attitude}`,
    layer: 'motivation',
    togafDomain: 'motivation',
    maturityLevel: 1,
    riskLevel: 'low',
    status: 'current',
    position3D: { x, y: LAYER_Y['motivation'] ?? 16, z },
    metadata: {
      envisionStakeholderId: stakeholder.id,
      stakeholderType: stakeholder.stakeholderType,
      influence: stakeholder.influence,
      attitude: stakeholder.attitude,
      interests: stakeholder.interests,
      source: 'envision_phase_a',
    },
  };
}

export function isDuplicate(
  stakeholder: Stakeholder,
  existingElements: ArchitectureElement[],
): boolean {
  const nameLower = stakeholder.name.trim().toLowerCase();
  return existingElements.some(
    (el) =>
      el.type === 'stakeholder' &&
      (el.metadata?.envisionStakeholderId === stakeholder.id ||
        el.name.trim().toLowerCase() === nameLower),
  );
}

export function getAutoConnectionTargets(
  existingElements: ArchitectureElement[],
): ArchitectureElement[] {
  return existingElements.filter(
    (el) =>
      el.layer === 'motivation' &&
      el.type !== 'stakeholder' &&
      el.type in CONNECTION_TYPE_MAP,
  );
}

export function buildConnection(
  sourceId: string,
  target: ArchitectureElement,
): Connection {
  const relType = CONNECTION_TYPE_MAP[target.type] || 'association';
  return {
    id: `env-conn-${sourceId}-${target.id}`,
    sourceId,
    targetId: target.id,
    type: relType,
    label: relType,
  };
}
