// REQ-FIX-001.1 (THE-499) — deterministische „Here's the fix"-Ableitung für
// eine einzelne Policy-Violation. Pur, kein I/O. Übersetzt
// (operator, field, currentValue, expectedValue) in einen Imperativ-Satz +
// eine wiederverwendbare RemediationAction. Wiederverwendet den
// edit_field-Typ aus advisor.types (KEIN neuer Action-Typ — AC-2).
// Konsumiert vom ComplianceDashboard (Slice 1) und vom [Fix]-Button (Slice 2).
// regex ist auf Slice 3 vertagt (AC-1).
import type { RemediationAction } from '../types/advisor.types';

export interface DeriveViolationFixInput {
  /** PolicyRule-Operator; ABWESEND bei Legacy/migrierten Violations (Graceful Fallback). */
  operator?: string;
  field: string;
  /** Teil des AC-1-Kontrakts + von der Dashboard-Transition-Zeile genutzt; die
   *  Imperativ-Templates referenzieren ihn nicht. */
  currentValue: unknown;
  expectedValue: unknown;
}

export interface ViolationFix {
  /** true → `action` ist eine anwendbare edit_field-RemediationAction. */
  applicable: boolean;
  /** Immer gesetzt: Imperativ („Set X to Y") oder generischer Hinweis. */
  instruction: string;
  /** Nur wenn applicable (AC-2). Wiederverwendet edit_field, nie ein neuer Typ. */
  action?: RemediationAction;
}

/** Menschenlesbare Darstellung eines unbekannten Regelwerts für Instruction-Strings. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'string') return v === '' ? '""' : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function editField(field: string, value: unknown, label: string): ViolationFix {
  return { applicable: true, instruction: label, action: { type: 'edit_field', label, payload: { field, value } } };
}

export function deriveViolationFix(input: DeriveViolationFixInput): ViolationFix {
  const { operator, field, expectedValue } = input; // currentValue bewusst ungenutzt (s. Typ-Kommentar)

  // AC-3 Graceful Fallback: kein operator (Legacy-Violation) → generischer Hinweis, keine action.
  if (!operator) {
    return { applicable: false, instruction: `${field} should be ${fmt(expectedValue)}` };
  }

  switch (operator) {
    case 'equals':
      return editField(field, expectedValue, `Set ${field} to ${fmt(expectedValue)}`);

    case 'not_equals':
      // expectedValue ist der VERBOTENE Wert → kein Ein-Klick-Ziel. Korrekte
      // Aussage statt invertierter „Set to"-Anweisung (entschieden 2026-07-17,
      // REQ-Owner). Kein payload → applicable:false, keine Action.
      return { applicable: false, instruction: `Change ${field} — must not be ${fmt(expectedValue)}` };

    case 'exists':
      // THE-502/AC-1: exists ist NICHT ein-Klick-fixbar — es gibt keinen
      // deterministischen Feldwert („Add owner" ist kein konkreter Inhalt,
      // value=false löscht nicht). Instruction bleibt als manueller Hinweis.
      return { applicable: false, instruction: expectedValue ? `Add ${field}` : `Remove ${field}` };

    // THE-502/AC-1: nur gte/lte sind ein-Klick-fixbar — set = expectedValue
    // erfüllt ≥/≤ (Grenzwert inklusiv). gt/lt (strikt) werden davon NICHT
    // erfüllt → applicable:false, Instruction bleibt Hinweis.
    case 'gte': return editField(field, expectedValue, `Set ${field} ≥ ${fmt(expectedValue)}`);
    case 'lte': return editField(field, expectedValue, `Set ${field} ≤ ${fmt(expectedValue)}`);
    case 'gt':  return { applicable: false, instruction: `Set ${field} > ${fmt(expectedValue)}` };
    case 'lt':  return { applicable: false, instruction: `Set ${field} < ${fmt(expectedValue)}` };

    case 'contains':
      // THE-502/AC-1: contains ist Teilstring-Semantik — set = expectedValue
      // würde ersetzen statt anfügen. Kein Ein-Klick-Fix.
      return { applicable: false, instruction: `Include '${fmt(expectedValue)}' in ${field}` };

    case 'regex':
      // Slice 3 (AC-1): kein deterministischer Einzel-Edit für ein Pattern.
      return { applicable: false, instruction: `Review ${field} to match the required pattern` };

    default:
      // Unbekannter Operator → gleiche graceful Haltung wie fehlender Operator.
      return { applicable: false, instruction: `${field} should be ${fmt(expectedValue)}` };
  }
}

/**
 * THE-502/AC-2: Felder, für die ein Ein-Klick-[Fix] sicher ist — flache,
 * schreibbare Neo4j-Spalten mit geringem Blast-Radius. Bewusst NICHT enthalten:
 * `type` (nicht in UpdateElementSchema → unschreibbar), `maturityLevel` (Fix
 * defekt — THE-501), `layer` (Ein-Klick-Change triggert Re-Embed + 3D-Reposition
 * + Policy-Scope-Kaskade via elementMatchesScope → als eigener REQ mit Bestätigung).
 */
export const AUTO_FIXABLE_FIELDS = ['description', 'name', 'riskLevel', 'status'] as const;
export type AutoFixableField = (typeof AUTO_FIXABLE_FIELDS)[number];
export function isAutoFixableField(field: string): field is AutoFixableField {
  return (AUTO_FIXABLE_FIELDS as readonly string[]).includes(field);
}
