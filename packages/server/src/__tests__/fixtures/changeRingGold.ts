/**
 * UC-RING-001 — the gold change folder of THE-819 (Messung C) and its variants.
 * 7 steps: ECR → three parallel reviews → ECO → implement → ECN → back to the start.
 * The folder has 12 parts (Composition between Business Objects).
 */
import type { ModelElement, ModelRelationship } from '../../services/topology/contextComplex';

export interface RingModel {
  elements: ModelElement[];
  relationships: ModelRelationship[];
}

const process = (id: string, name: string): ModelElement => ({ id, name, type: 'process' });
const object = (id: string, name: string): ModelElement => ({ id, name, type: 'business_object' });
const rel = (type: string, sourceId: string, targetId: string, label?: string): ModelRelationship =>
  ({ id: `${type}:${sourceId}->${targetId}`, sourceId, targetId, type, ...(label === undefined ? {} : { label }) });

export const PARTS: Array<[string, string]> = [
  ['antrag', 'Request text'], ['loesung', 'Technical solution'], ['vK', 'Vote design'], ['vE', 'Vote purchasing'],
  ['vF', 'Vote production'], ['kosten', 'Cost estimate'], ['bestell', 'Order status'], ['entsch', 'Change decision'],
  ['zeichn', 'Drawing'], ['kstl', 'Engineering BOM'], ['fstl', 'Manufacturing BOM'], ['frei', 'Release note'],
];

export function goldRing(): RingModel {
  const elements: ModelElement[] = [
    { id: 'E', name: 'Change needed', type: 'business_event' },
    process('S0', 'Raise change (ECR)'),
    process('S1', 'Review design'),
    process('S2', 'Review purchasing'),
    process('S3', 'Review production'),
    process('S4', 'Decide change (ECO)'),
    process('S5', 'Implement change'),
    process('S6', 'Release and notify (ECN)'),
    object('M', 'Change folder'),
    ...PARTS.map(([id, name]) => object(id, name)),
  ];
  const relationships: ModelRelationship[] = [
    ...PARTS.map(([id]) => rel('composition', 'M', id)),
    rel('triggering', 'E', 'S0'),
    rel('triggering', 'S0', 'S1'), rel('triggering', 'S0', 'S2'), rel('triggering', 'S0', 'S3'),
    rel('triggering', 'S1', 'S4'), rel('triggering', 'S2', 'S4'), rel('triggering', 'S3', 'S4'),
    rel('triggering', 'S4', 'S5'), rel('triggering', 'S5', 'S6'),
    rel('flow', 'S6', 'S0'), // back to the requester: closes the ring
    rel('access', 'S0', 'antrag', 'write'),
    rel('access', 'S1', 'antrag', 'read'), rel('access', 'S1', 'zeichn', 'read'),
    rel('access', 'S1', 'loesung', 'write'), rel('access', 'S1', 'vK', 'write'),
    rel('access', 'S2', 'antrag', 'read'), rel('access', 'S2', 'kstl', 'read'), rel('access', 'S2', 'bestell', 'read'),
    rel('access', 'S2', 'kosten', 'write'), rel('access', 'S2', 'vE', 'write'),
    rel('access', 'S3', 'antrag', 'read'), rel('access', 'S3', 'fstl', 'read'), rel('access', 'S3', 'vF', 'write'),
    rel('access', 'S4', 'vK', 'read'), rel('access', 'S4', 'vE', 'read'), rel('access', 'S4', 'vF', 'read'),
    rel('access', 'S4', 'kosten', 'read'), rel('access', 'S4', 'entsch', 'write'),
    rel('access', 'S5', 'entsch', 'read'), rel('access', 'S5', 'loesung', 'read'),
    rel('access', 'S5', 'zeichn', 'write'), rel('access', 'S5', 'kstl', 'write'), rel('access', 'S5', 'fstl', 'write'),
    rel('access', 'S6', 'entsch', 'read'), rel('access', 'S6', 'zeichn', 'read'), rel('access', 'S6', 'kstl', 'read'),
    rel('access', 'S6', 'fstl', 'read'), rel('access', 'S6', 'frei', 'write'),
  ];
  return { elements, relationships };
}

const without = (m: RingModel, id: string): RingModel => ({ ...m, relationships: m.relationships.filter((r) => r.id !== id) });
const plus = (m: RingModel, ...rs: ModelRelationship[]): RingModel => ({ ...m, relationships: [...m.relationships, ...rs] });

/** P1: design and purchasing both write the cost estimate, in parallel. */
export const p1WriteWrite = (): RingModel => plus(goldRing(), rel('access', 'S1', 'kosten', 'schreibt'));
/** P2: production reads the technical solution while design writes it, in parallel. */
export const p2WriteRead = (): RingModel => plus(goldRing(), rel('access', 'S3', 'loesung', 'liest'));
/** N1: P1, but purchasing comes after design. */
export const n1Sequenced = (): RingModel =>
  plus(without(p1WriteWrite(), 'triggering:S0->S2'), rel('triggering', 'S1', 'S2'));
/** The ring does not go back to the start. */
export const ringOpen = (): RingModel => without(goldRing(), 'flow:S6->S0');
/** No later step reads the technical solution. */
export const unreadSolution = (): RingModel => without(goldRing(), 'access:S5->loesung');
/** No Business Event starts the folder. */
export const noStart = (): RingModel => without(goldRing(), 'triggering:E->S0');
/** One label that says no access type. */
export const unknownLabel = (): RingModel => ({
  ...goldRing(),
  relationships: goldRing().relationships.map((r) => (r.id === 'access:S3->vF' ? { ...r, label: 'accesses' } : r)),
});
/** Object level: the parts are folded into the folder (no Composition, every Access on M). */
export function objectLevel(model: RingModel = goldRing()): RingModel {
  const partIds = new Set(PARTS.map(([id]) => id));
  const seen = new Set<string>();
  const relationships = model.relationships
    .filter((r) => r.type !== 'composition')
    .map((r) => (r.type === 'access' && partIds.has(r.targetId) ? { ...r, id: `access:${r.sourceId}->M:${r.label}`, targetId: 'M' } : r))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return { elements: model.elements.filter((e) => !partIds.has(e.id)), relationships };
}
/** The old element type business_process works as a step. */
export function legacyTypes(): RingModel {
  const m = goldRing();
  return { ...m, elements: m.elements.map((e) => (e.type === 'process' ? { ...e, type: 'business_process' } : e)) };
}

/** A second Business Event that triggers one step. */
export const secondEvent = (target: string, m: RingModel = goldRing()): RingModel => ({
  elements: [...m.elements, { id: 'E2', name: 'Escalation', type: 'business_event' }],
  relationships: [...m.relationships, rel('triggering', 'E2', target)],
});
/** A process outside the folder (no access) that triggers the start. */
export const outsideIntake = (): RingModel => ({
  elements: [...goldRing().elements, process('X', 'Intake')],
  relationships: [...goldRing().relationships, rel('triggering', 'X', 'S0')],
});
/** A second folder with one part; its steps have no Business Event. */
export const secondFolder = (): RingModel => ({
  elements: [...goldRing().elements, object('M2', 'Second folder'), object('q2', 'Note')],
  relationships: [
    ...goldRing().relationships,
    rel('composition', 'M2', 'q2'), rel('access', 'S5', 'q2', 'write'), rel('access', 'S6', 'q2', 'read'),
  ],
});
/** Two unknown labels (S3 → vF and S2 → vE). */
export const twoUnknown = (): RingModel => ({
  ...goldRing(),
  relationships: goldRing().relationships.map((r) => (r.id === 'access:S3->vF' || r.id === 'access:S2->vE' ? { ...r, label: 'accesses' } : r)),
});
