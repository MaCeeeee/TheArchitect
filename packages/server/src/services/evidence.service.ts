/**
 * evidence.service — die reinen Regeln des Nachweis-Objekts (THE-558).
 *
 * ── DREI GARANTIEN ──
 *
 * 1. **Append-only (WORM, Muster THE-445):** ein gespeicherter Nachweis wird
 *    nie verändert. Korrektur = neuer Eintrag mit `supersedes`. Ein Nachweis,
 *    den man nachträglich umschreiben kann, ist keiner.
 *
 * 2. **Alterung (Version-Lock, Muster THE-306):** eine Evidenz trägt den
 *    Textstand (`regulationVersionHash`), für den sie erhoben wurde. Ändert
 *    sich das Gesetz, wird sie `stale` — nie gelöscht, nie still
 *    weitergezählt. Und ein attestiertes Tor, dessen letzte frische Evidenz
 *    fällt, fällt MIT SICHTBAREM GRUND mit („evidence went stale").
 *
 * 3. **Kein Zugangsmaterial im Verweis:** ein Nachweis-Register, das Tokens
 *    oder Passwörter in `ref` trägt, hat das Sicherheitsproblem nicht gelöst,
 *    sondern in die Audit-Spur verschoben.
 *
 * REIN — kein I/O. Das Modell (`models/Evidence.ts`) und die Drift-Schleife
 * (`regulationDrift.service.ts`) konsumieren diese Regeln.
 */
import type { RequirementGates } from '@thearchitect/shared';

/** WORM-Wächter für `pre('save')` — als reine Funktion testbar. */
export function assertAppendOnly(doc: { isNew: boolean }): void {
  if (!doc.isNew) {
    throw new Error(
      'Evidence is append-only (WORM): write a new record with `supersedes`, do not update in place',
    );
  }
}

/**
 * Erkennt offensichtliches Zugangsmaterial in einem Verweis.
 *
 * Bewusst MUSTER-basiert, nicht perfekt: der Wächter fängt die häufigen
 * Unfälle (Query-Token, Basic-Auth in der URL, Bearer-Strings, `ta_`-Keys).
 * Wer entschlossen ein Secret verstecken will, kann das — dagegen hilft nur
 * Review. Ein perfekter Filter ist nicht das Versprechen; der ehrliche Satz
 * dazu steht in der RVTM.
 */
export function refCarriesCredentialMaterial(ref: string): boolean {
  return (
    /[?&](token|api[_-]?key|key|secret|password|pass|auth|access[_-]?token)=/i.test(ref) ||
    /\/\/[^/\s]+:[^/\s@]+@/.test(ref) || // user:pass@host
    /\bBearer\s+\S+/i.test(ref) ||
    /\bta_[A-Za-z0-9_]{4,}/.test(ref) // eigene API-Key-Präfixe
  );
}

/** Frisch = nicht stale. Eine stale Evidenz zählt nicht — auch als einzige. */
export function isFreshEvidence(e: { stale?: boolean }): boolean {
  return e.stale !== true;
}

/**
 * Der Rückfall: fällt die letzte frische Evidenz, fällt `attested` mit —
 * auf `unknown`, mit `setBy: 'system'` und benanntem Grund. Nur ein `yes`
 * kann fallen; ein menschliches `no` bleibt stehen (es ist ein Befund, kein
 * Nachweis-Zustand). REIN.
 */
export function resetAttestedForStale(gates: RequirementGates): RequirementGates {
  if (gates.attested.state !== 'yes') return gates;
  return {
    ...gates,
    attested: {
      state: 'unknown',
      setBy: 'system',
      setAt: new Date().toISOString(),
      reason: 'evidence went stale (law text changed) — re-attest against the current text',
    },
  };
}
