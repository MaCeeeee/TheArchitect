/**
 * requirementGates — die Regeln des Drei-Tore-Tripels (THE-557).
 *
 * ── DIE EINE REGEL ──
 * `covered` darf eine Maschine ableiten (Deckung = es existiert ein Element,
 * das die Pflicht adressiert — mechanisch aus `linkedElementIds`). `enforced`
 * und `attested` setzt NUR ein Mensch: Wirksamkeit und Nachweis sind nicht
 * mechanisch bestimmbar, und ein LLM-Urteil hier wäre eine selbstbestätigende
 * Metrik. Präzedenz: WFCOMP G9 — „Ein Mensch (nicht das LLM) macht grün."
 *
 * REIN — kein I/O. Die Identität (`setBy`) kommt vom Aufrufer aus der
 * SESSION, nie aus dem Body (Spoof-Schutz wie certification.routes.ts).
 */
import type { GateDecision, RequirementGates } from '@thearchitect/shared';

export const HUMAN_ONLY_GATES = ['enforced', 'attested'] as const;
export type HumanGate = (typeof HUMAN_ONLY_GATES)[number];

const unknown = (): GateDecision => ({ state: 'unknown' });

/** Bestands-Dokumente ohne `gates` rendern hierüber — done erbt keine Tiefe. */
export function emptyGates(): RequirementGates {
  return { covered: unknown(), enforced: unknown(), attested: unknown() };
}

/** Deckung mechanisch: mindestens ein verknüpftes Element. Grund wird ausgewiesen. */
export function deriveCovered(linkedElementIds: readonly string[]): GateDecision {
  const n = linkedElementIds.filter(Boolean).length;
  return {
    state: n > 0 ? 'yes' : 'no',
    setBy: 'system',
    setAt: new Date().toISOString(),
    reason: n > 0 ? `derived: ${n} linked element(s) address this requirement` : 'derived: no linked elements',
  };
}

/**
 * Der Notar-Akt. Wirft bei `covered` (Maschinen-Tor), leerer Begründung oder
 * fehlender Identität. Gibt NEUE gates zurück — pure.
 */
export function applyHumanGate(
  gates: RequirementGates,
  gate: HumanGate,
  state: 'yes' | 'no',
  userId: string,
  reason: string,
): RequirementGates {
  if (!HUMAN_ONLY_GATES.includes(gate)) {
    throw new Error(`gate "covered" is machine-derived — a human cannot set it`);
  }
  if (!userId) throw new Error('userId required (from session, never from body)');
  if (!reason || reason.trim().length === 0) {
    throw new Error('reason is required — an unexplained gate is an unchecked checkbox');
  }
  return {
    ...gates,
    [gate]: { state, setBy: userId, setAt: new Date().toISOString(), reason: reason.trim() },
  };
}
