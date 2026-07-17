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
      // exists:true verletzt wenn Feld leer → Add; exists:false verletzt wenn
      // Feld vorhanden → Remove. payload.value = expectedValue (AC-2).
      return expectedValue
        ? editField(field, expectedValue, `Add ${field}`)
        : editField(field, expectedValue, `Remove ${field}`);

    case 'gt':  return editField(field, expectedValue, `Set ${field} > ${fmt(expectedValue)}`);
    case 'gte': return editField(field, expectedValue, `Set ${field} ≥ ${fmt(expectedValue)}`);
    case 'lt':  return editField(field, expectedValue, `Set ${field} < ${fmt(expectedValue)}`);
    case 'lte': return editField(field, expectedValue, `Set ${field} ≤ ${fmt(expectedValue)}`);

    case 'contains':
      return editField(field, expectedValue, `Include '${fmt(expectedValue)}' in ${field}`);

    case 'regex':
      // Slice 3 (AC-1): kein deterministischer Einzel-Edit für ein Pattern.
      return { applicable: false, instruction: `Review ${field} to match the required pattern` };

    default:
      // Unbekannter Operator → gleiche graceful Haltung wie fehlender Operator.
      return { applicable: false, instruction: `${field} should be ${fmt(expectedValue)}` };
  }
}
