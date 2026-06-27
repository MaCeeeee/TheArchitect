/**
 * detectGdprScope (.2 / REQ-WFCOMP-001.2, THE-353) — ist Art. 30 überhaupt einschlägig?
 *
 * Heuristik: personenbezogen, wenn ein Feld-SCHLÜSSEL auf personenbezogene Daten deutet.
 * Arbeitet NUR auf Keys (aus dem Sanitize), nie auf Werten.
 */
import type { SanitizedWorkflow } from './types';

// Bewusst GROSSZÜGIG: ein False Negative auf Anwendbarkeit (Workflow gar nicht
// bewertet) ist gefährlicher als eine zu viel geprüfte Verarbeitung. Im Zweifel
// in-scope. Nur klar nicht-personenbezogene Keys (bucketName/operation/…) fallen durch.
const PII_KEY_PATTERNS: RegExp[] = [
  /e-?mail|\bmail\b/i,
  /\biban\b|\bbic\b/i,
  /phone|telefon|mobile|handy/i,
  /(first|last|full|sur|given|vor|nach)name|surname/i,
  /birth|geburt|\bdob\b|\bage\b|\balter\b/i,
  /address|adresse|strasse|street|postal|\bzip\b|\bplz\b|\bcity\b|\bort\b/i,
  /\bssn\b|\bvat\b|ustid|tax_?id|steuer/i,
  /customer|kunde|client|mandant/i,
  /\buser\b|username|user_?id|benutzer|nutzer/i,
  /person|contact|kontakt/i,
  /member|mitglied/i,
  /employee|mitarbeiter|\bstaff\b|personal_?nr|personalnummer/i,
  /account|\bkonto\b/i,
  /profile|profil/i,
  /recipient|empf(ae|ä)nger|sender|absender/i,
  /subscriber|subscription/i,
  /gender|geschlecht|anrede|salutation|nationalit/i,
];

/** Deutet ein Feld-Key auf personenbezogene Daten? ('bucketName'/'operation' u.ä. bewusst NICHT. Im Zweifel: ja.) */
export function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === 'name') return true;
  return PII_KEY_PATTERNS.some((re) => re.test(k));
}

export function detectGdprScope(wf: SanitizedWorkflow): boolean {
  return wf.nodes.some((n) => n.paramKeys.some(isPiiKey));
}
