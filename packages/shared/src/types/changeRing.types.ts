// ─── Change folder check (UC-RING-001) ───
// A change folder is an object with parts. Process elements with Access relationships to the parts
// are its steps. The check says whether parallel steps write or read the same part, whether the
// folder goes back to its start, and whether each written part is read later.

import type { MethodRef } from './method.types';

/** Access type of an Access relationship; null where the label does not say it. */
export type AccessKind = 'read' | 'write' | 'readwrite';

export interface RingElementRef {
  id: string;
  name: string;
}

/**
 * write_write: two steps without an order write the same part.
 * write_read: `first` writes the part, `second` reads it, and the two have no order.
 * ring_open: no Triggering/Flow relationship goes back into the start.
 * unread_write: no later step reads a part that `first` writes.
 */
export type RingFindingRule = 'write_write' | 'write_read' | 'ring_open' | 'unread_write';

export interface RingFinding {
  rule: RingFindingRule;
  first: RingElementRef;
  second: RingElementRef | null;
  part: RingElementRef | null;
  /** ASD-STE100 text. */
  text: string;
}

export type RingHintKind = 'no_folder' | 'object_without_parts' | 'too_few_steps' | 'unknown_access' | 'no_start' | 'several_starts' | 'no_order';

export interface RingHint {
  kind: RingHintKind;
  /** Elements the hint is about (to select them in the model). */
  elementIds: string[];
  /** ASD-STE100 text: what is missing and what to do. */
  text: string;
}

export interface ChangeFolderResult {
  folder: RingElementRef;
  parts: number;
  steps: RingElementRef[];
  start: RingElementRef | null;
  /** Pairs of steps without an order; 0 when the folder was not checked. */
  parallelPairs: number;
  /** false: a hint blocks the check (no start, a step without order, fewer than 2 steps). */
  checked: boolean;
  findings: RingFinding[];
  hints: RingHint[];
}

export interface ChangeRingReport {
  method: MethodRef;
  folders: ChangeFolderResult[];
  /** Hints that belong to no folder: no folder at all, or an object with several steps but no parts. */
  hints: RingHint[];
}
