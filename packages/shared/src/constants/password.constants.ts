/**
 * Password policy — shared between client (strength indicator) and server (validation).
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: 'Min. 8 characters', test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { label: 'Uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Number (0-9)', test: (pw) => /\d/.test(pw) },
  { label: 'Special character (!@#$...)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/** Returns number of checks passed (0-5). */
export function getPasswordScore(pw: string): number {
  return PASSWORD_CHECKS.filter((c) => c.test(pw)).length;
}

/** Returns true if ALL checks pass. */
export function isPasswordValid(pw: string): boolean {
  return PASSWORD_CHECKS.every((c) => c.test(pw));
}

/** Strength label for UI display. */
export function getPasswordStrengthLabel(score: number): string {
  if (score <= 1) return 'Weak';
  if (score <= 2) return 'Fair';
  if (score <= 3) return 'Moderate';
  if (score <= 4) return 'Strong';
  return 'Very Strong';
}

/** Color for UI display (Tailwind classes). */
export function getPasswordStrengthColor(score: number): string {
  if (score <= 1) return '#ef4444'; // red
  if (score <= 2) return '#f97316'; // orange
  if (score <= 3) return '#eab308'; // yellow
  if (score <= 4) return '#22c55e'; // green
  return '#7c3aed'; // purple/accent
}
