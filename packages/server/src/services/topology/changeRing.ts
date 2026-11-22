/**
 * UC-RING-001 — change folder check (Umlaufprüfung), assessed mechanically from the model. No LLM.
 *
 *   folder   an object with parts (Composition between Business Objects or Data Objects)
 *   step     a Process element (or the old type business_process) with an Access relationship to a part
 *   order    Triggering/Flow between steps; a path through other processes counts
 *   start    the step a Business Event triggers
 *
 * The edge back into a start closes the ring and is NOT part of the order: counted as order, it
 * makes every step reach every step, and a real conflict disappears (THE-819, Messung C).
 *
 * Findings per folder (only when it has a start and every step has an order relationship):
 *   write_write / write_read  Bernstein conditions for each pair of steps without an order
 *   ring_open                 no Triggering/Flow relationship goes back into the start
 *   unread_write              a part that no later step reads (the last steps write the result)
 * On the object level (no parts) nothing is reported as a conflict: there every parallel pair would
 * match. The check gives the hint object_without_parts instead.
 */
import { accessKindFromLabel, toMethodRef } from '@thearchitect/shared';
import type { AccessKind, ChangeFolderResult, ChangeRingReport, RingElementRef, RingFinding, RingHint } from '@thearchitect/shared';
import { RING_TEXT } from './changeRingText';
import type { ModelElement, ModelRelationship } from './contextComplex';

export const CHANGE_RING_METHOD_ID = 'PA-umlauf';
const FOLDER_TYPES: ReadonlySet<string> = new Set(['business_object', 'data_object']);
const STEP_TYPES: ReadonlySet<string> = new Set(['process', 'business_process']);
const ORDER_TYPES: ReadonlySet<string> = new Set(['triggering', 'flow']);
const START_TYPES: ReadonlySet<string> = new Set(['business_event']);

interface StepAccess {
  step: string;
  target: string;
  kind: AccessKind | null;
}

const byName = (a: RingElementRef, b: RingElementRef) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en');

export function assessChangeRings(elements: ModelElement[], relationships: ModelRelationship[]): ChangeRingReport {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const typeOf = (id: string) => byId.get(id)?.type ?? '';
  const ref = (id: string): RingElementRef => ({ id, name: byId.get(id)?.name ?? id });
  const rels = relationships.filter((r) => byId.has(r.sourceId) && byId.has(r.targetId) && r.sourceId !== r.targetId);

  const partsOf = new Map<string, Set<string>>();
  for (const r of rels) {
    if (r.type !== 'composition' || !FOLDER_TYPES.has(typeOf(r.sourceId)) || !FOLDER_TYPES.has(typeOf(r.targetId))) continue;
    if (!partsOf.has(r.sourceId)) partsOf.set(r.sourceId, new Set());
    partsOf.get(r.sourceId)!.add(r.targetId);
  }
  const accesses: StepAccess[] = rels
    .filter((r) => r.type === 'access' && STEP_TYPES.has(typeOf(r.sourceId)))
    .map((r) => ({ step: r.sourceId, target: r.targetId, kind: accessKindFromLabel(r.label) }));

  const orderEdges = rels.filter((r) => ORDER_TYPES.has(r.type) && STEP_TYPES.has(typeOf(r.sourceId)) && STEP_TYPES.has(typeOf(r.targetId)));
  const eventTargets = new Set(
    rels.filter((r) => ORDER_TYPES.has(r.type) && START_TYPES.has(typeOf(r.sourceId)) && STEP_TYPES.has(typeOf(r.targetId))).map((r) => r.targetId),
  );
  const withOrder = new Set(orderEdges.flatMap((r) => [r.sourceId, r.targetId]));
  const allSuccessors = new Map<string, string[]>();
  for (const r of orderEdges) {
    if (!allSuccessors.has(r.sourceId)) allSuccessors.set(r.sourceId, []);
    allSuccessors.get(r.sourceId)!.push(r.targetId);
  }
  const reachIn = (graph: Map<string, string[]>, from: string, skipInto?: string): Set<string> => {
    const seen = new Set<string>();
    const stack: string[] = [];
    for (const t of graph.get(from) ?? []) stack.push(t);
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === skipInto || seen.has(next)) continue;
      seen.add(next);
      for (const t of graph.get(next) ?? []) stack.push(t);
    }
    return seen;
  };

  const accessesByTarget = new Map<string, StepAccess[]>();
  for (const a of accesses) {
    const list = accessesByTarget.get(a.target);
    if (list) list.push(a);
    else accessesByTarget.set(a.target, [a]);
  }

  function assessFolder(folder: RingElementRef): ChangeFolderResult {
    const parts = partsOf.get(folder.id)!;
    const own: StepAccess[] = [];
    for (const p of parts) for (const a of accessesByTarget.get(p) ?? []) own.push(a);
    const steps = [...new Set(own.map((a) => a.step))].map(ref).sort(byName);
    const hints: RingHint[] = [];
    const result: ChangeFolderResult = { folder, parts: parts.size, steps, start: null, parallelPairs: 0, checked: false, findings: [], hints };
    if (steps.length < 2) {
      hints.push({ kind: 'too_few_steps', elementIds: [folder.id], text: RING_TEXT.tooFewSteps(folder.name, steps.length) });
      return result;
    }
    const unknown = own
      .filter((a) => a.kind === null)
      .sort((x, y) => byName(ref(x.step), ref(y.step)) || byName(ref(x.target), ref(y.target)));
    for (const a of unknown) {
      hints.push({ kind: 'unknown_access', elementIds: [a.step, a.target], text: RING_TEXT.unknownAccess(ref(a.step).name, ref(a.target).name) });
    }
    const starts = steps.filter((s) => eventTargets.has(s.id));
    if (starts.length > 1) {
      hints.push({ kind: 'several_starts', elementIds: starts.map((s) => s.id), text: RING_TEXT.severalStarts(folder.name) });
    }
    if (starts.length === 0) hints.push({ kind: 'no_start', elementIds: [folder.id], text: RING_TEXT.noStart(folder.name) });
    if (starts.length === 1) result.start = starts[0];
    const loose = steps.filter((s) => !withOrder.has(s.id));
    for (const s of loose) hints.push({ kind: 'no_order', elementIds: [s.id], text: RING_TEXT.noOrder(s.name, folder.name) });
    if (starts.length !== 1 || loose.length > 0) return result; // never check on a guessed order

    // The back edges are the edges into the start from a step that the start reaches without them.
    const start = starts[0];
    const fromStart = reachIn(allSuccessors, start.id, start.id);
    const backEdges = orderEdges.filter((r) => r.targetId === start.id && fromStart.has(r.sourceId));
    const backSet = new Set(backEdges);
    const successors = new Map<string, string[]>();
    for (const r of orderEdges) {
      if (backSet.has(r)) continue;
      if (!successors.has(r.sourceId)) successors.set(r.sourceId, []);
      successors.get(r.sourceId)!.push(r.targetId);
    }
    const reachCache = new Map<string, Set<string>>();
    const reach = (from: string): Set<string> => {
      const cached = reachCache.get(from);
      if (cached) return cached;
      const seen = reachIn(successors, from);
      reachCache.set(from, seen);
      return seen;
    };
    const ordered = (a: string, b: string) => reach(a).has(b) || reach(b).has(a);

    const reads = new Map(steps.map((s) => [s.id, new Set<string>()]));
    const writes = new Map(steps.map((s) => [s.id, new Set<string>()]));
    for (const a of own) {
      if (a.kind === null) continue;
      if (a.kind !== 'write') reads.get(a.step)!.add(a.target);
      if (a.kind !== 'read') writes.get(a.step)!.add(a.target);
    }
    const findings: RingFinding[] = [];

    for (let i = 0; i < steps.length; i++) {
      for (let j = i + 1; j < steps.length; j++) {
        const a = steps[i];
        const b = steps[j];
        if (ordered(a.id, b.id)) continue;
        result.parallelPairs++;
        const candidates = new Set([...writes.get(a.id)!, ...writes.get(b.id)!]);
        for (const p of [...candidates].map(ref).sort(byName)) {
          const aw = writes.get(a.id)!.has(p.id);
          const bw = writes.get(b.id)!.has(p.id);
          if (aw && bw) findings.push({ rule: 'write_write', first: a, second: b, part: p, text: RING_TEXT.writeWrite(a.name, b.name, p.name) });
          else if (aw && reads.get(b.id)!.has(p.id)) findings.push({ rule: 'write_read', first: a, second: b, part: p, text: RING_TEXT.writeRead(a.name, b.name, p.name) });
          else if (bw && reads.get(a.id)!.has(p.id)) findings.push({ rule: 'write_read', first: b, second: a, part: p, text: RING_TEXT.writeRead(b.name, a.name, p.name) });
        }
      }
    }

    const closes = backEdges.length > 0;
    if (!closes) findings.push({ rule: 'ring_open', first: start, second: null, part: null, text: RING_TEXT.ringOpen(folder.name, start.name) });

    const stepIds = new Set(steps.map((s) => s.id));
    for (const a of steps) {
      // unordered set, used only with .some: its order never reaches the report
      const later = [...reach(a.id)].filter((t) => stepIds.has(t));
      if (later.length === 0) continue; // a last step writes the result of the folder
      for (const p of [...writes.get(a.id)!].map(ref).sort(byName)) {
        if (!later.some((t) => reads.get(t)!.has(p.id))) {
          findings.push({ rule: 'unread_write', first: a, second: null, part: p, text: RING_TEXT.unreadWrite(a.name, p.name) });
        }
      }
    }
    result.findings = findings;
    result.checked = true;
    return result;
  }

  const folders = [...partsOf.keys()].map(ref).sort(byName).map(assessFolder);

  const hints: RingHint[] = [];
  const allParts = new Set([...partsOf.values()].flatMap((set) => [...set]));
  const candidates = elements.filter((e) => FOLDER_TYPES.has(e.type) && !partsOf.has(e.id) && !allParts.has(e.id)).map((e) => ref(e.id)).sort(byName);
  for (const object of candidates) {
    const on = accessesByTarget.get(object.id) ?? [];
    const steps = new Set(on.map((a) => a.step));
    const writers = on.filter((a) => a.kind === 'write' || a.kind === 'readwrite');
    if (steps.size >= 2 && writers.length > 0) {
      hints.push({ kind: 'object_without_parts', elementIds: [object.id], text: RING_TEXT.objectWithoutParts(object.name, steps.size) });
    }
  }
  if (folders.length === 0 && hints.length === 0) hints.push({ kind: 'no_folder', elementIds: [], text: RING_TEXT.noFolder });

  return { method: toMethodRef(CHANGE_RING_METHOD_ID), folders, hints };
}
