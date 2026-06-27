/**
 * detectGdprScope (.2 / REQ-WFCOMP-001.2, THE-353) — ist Art. 30 überhaupt einschlägig?
 *
 * Heuristik: personenbezogen, wenn ein Feld-SCHLÜSSEL auf personenbezogene Daten deutet.
 * Arbeitet NUR auf Keys (aus dem Sanitize), nie auf Werten.
 */
import type { SanitizedWorkflow } from './types';

const PII_KEY_PATTERNS: RegExp[] = [
  /email/i,
  /\biban\b/i,
  /\bbic\b/i,
  /phone|telefon|mobile/i,
  /(first|last|full|sur|given|vor|nach)name/i,
  /birth|geburt|\bdob\b/i,
  /address|adresse|strasse|street|postal|\bzip\b|\bplz\b/i,
  /\bssn\b|\bvat\b|ustid|taxid/i,
];

/** Deutet ein Feld-Key auf personenbezogene Daten? ('bucketName' u.ä. bewusst NICHT.) */
export function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === 'name') return true;
  return PII_KEY_PATTERNS.some((re) => re.test(k));
}

export function detectGdprScope(wf: SanitizedWorkflow): boolean {
  return wf.nodes.some((n) => n.paramKeys.some(isPiiKey));
}
