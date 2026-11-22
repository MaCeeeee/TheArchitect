/**
 * UC-RING-001 — access type from the label of an Access relationship.
 *
 * Until Access relationships carry their own field (REQ-RING-001.5, THE-825), the label is the
 * only place the access type lives. The words below cover 71 of the 86 Prod labels (measured
 * read-only on 22.11.2026, THE-819) and the label the ArchiMate import writes ("access:Write").
 * A label that is not listed stays unknown: the check never guesses an access type.
 * Slice 2 uses the same table to fill the new field once.
 */
import type { AccessKind } from '../types/changeRing.types';

export const ACCESS_LABEL_VOCABULARY: Readonly<Record<string, AccessKind>> = Object.freeze({
  read: 'read', reads: 'read', lesen: 'read', liest: 'read', nutzt: 'read', vergleicht: 'read', 'access:read': 'read',
  write: 'write', writes: 'write', schreiben: 'write', schreibt: 'write', 'access:write': 'write',
  readwrite: 'readwrite', 'read-write': 'readwrite', 'reads/writes': 'readwrite', 'liest/schreibt': 'readwrite',
  'access:readwrite': 'readwrite',
});

export function accessKindFromLabel(label: string | null | undefined): AccessKind | null {
  if (typeof label !== 'string') return null;
  const key = label.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ACCESS_LABEL_VOCABULARY, key) ? ACCESS_LABEL_VOCABULARY[key] : null;
}
