import { verifySync } from 'otplib';

/**
 * Prüft einen TOTP-Code gegen das MFA-Secret.
 *
 * otplib v13 liefert aus `verifySync` ein Objekt `{ valid }`, keinen Boolean.
 * Ein Objekt ist immer truthy — wer das Ergebnis direkt in `if (!result)`
 * steckt, lässt JEDEN Code durch (Security-Audit C3). Deshalb nur über diese
 * Funktion prüfen.
 */
export function isTotpCodeValid(code: unknown, secret: string): boolean {
  if (typeof code !== 'string') return false;
  const token = code.trim();
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ token, secret }).valid === true;
  } catch {
    return false;
  }
}
