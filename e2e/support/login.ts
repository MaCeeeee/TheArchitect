import { expect, type Page } from '@playwright/test';

/**
 * Anmeldung über das ECHTE Formular (THE-629).
 *
 * ── WARUM NICHT PER TOKEN-INJEKTION ──
 *
 * Ein Token direkt in den Speicher zu schreiben wäre schneller und stabiler —
 * und würde genau die Ebene überspringen, um derentwillen dieser Lauf
 * existiert. Der Anmeldepfad ist Teil dessen, was geprüft wird.
 *
 * ── WARUM DIE ZUGANGSDATEN NIRGENDWO AUFTAUCHEN ──
 *
 * Sie kommen ausschließlich aus `.env.e2e` (gitignored). Diese Datei liest sie,
 * gibt sie an das Formular und **nie** in eine Meldung, einen Fehlertext oder
 * einen Screenshot-Namen. Fehlt eine Variable, sagt der Abbruch WELCHE — nicht
 * ihren Wert.
 */

export interface E2ECredentials {
  baseURL: string;
  email: string;
  password: string;
}

/**
 * Liest die Zugangsdaten und bricht mit einer klaren Ansage ab, wenn eine fehlt.
 *
 * Ohne diese Prüfung liefe der Test in einen Timeout an einem Formularfeld —
 * eine Fehlermeldung, die nach einem Produktfehler aussieht, obwohl nur eine
 * Datei fehlt. Diese Verwechslung kostet jedes Mal eine halbe Stunde.
 */
export function readCredentials(): E2ECredentials {
  const missing: string[] = [];
  const baseURL = process.env.E2E_BASE_URL ?? 'https://thearchitect.site';
  const email = process.env.E2E_EMAIL ?? '';
  const password = process.env.E2E_PASSWORD ?? '';
  if (!email) missing.push('E2E_EMAIL');
  if (!password) missing.push('E2E_PASSWORD');

  if (missing.length > 0) {
    throw new Error(
      `\n\n  Der Durchstich kann sich nicht anmelden — es fehlt: ${missing.join(', ')}\n\n` +
        `  So geht es weiter:\n` +
        `    cp .env.e2e.example .env.e2e\n` +
        `    (dann die Werte in .env.e2e eintragen — die Datei ist gitignored)\n\n` +
        `  Ziel-Instanz waere: ${baseURL}\n`,
    );
  }
  return { baseURL, email, password };
}

/**
 * Meldet sich an und wartet, bis das Dashboard steht.
 *
 * Die Feld-Auswahl geht über `autocomplete` statt über CSS-Klassen: Die Seite
 * trägt für Anmelden und Registrieren dasselbe Markup, und `current-password`
 * gibt es NUR im Anmelde-Modus — das ist der verlässlichste Anker, den die
 * Seite hergibt, und er überlebt eine Umgestaltung.
 */
export async function login(page: Page, creds: E2ECredentials): Promise<void> {
  await page.goto('/login');

  const password = page.locator('input[autocomplete="current-password"]');
  await expect(
    password,
    'Das Anmeldeformular zeigt kein Passwortfeld — steht die Seite im Registrieren-Modus?',
  ).toBeVisible();

  // Die E-Mail-Eingabe im SELBEN Formular wie das Passwortfeld. Die Seite
  // trägt ein zweites E-Mail-Feld (Magic-Link/Zurücksetzen); ohne diese
  // Einschränkung träfe der Selektor mal das eine, mal das andere.
  const form = page.locator('form').filter({ has: password });
  await form.locator('input[type="email"]').fill(creds.email);
  await password.fill(creds.password);

  await form.getByRole('button', { name: /sign in/i }).click();

  // MFA ist ein bekannter Stolperstein: Trägt das Konto eine zweite Stufe,
  // bleibt der Lauf hier stehen. Das ist KEIN Produktfehler — es gehört gesagt,
  // statt in einem Timeout zu enden.
  const mfa = page.locator('input[autocomplete="one-time-code"]');
  if (await mfa.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new Error(
      '\n\n  Das Konto verlangt eine zweite Stufe (MFA). Der Durchstich kann sie nicht\n' +
        '  bedienen — bitte ein Testkonto OHNE MFA in .env.e2e eintragen.\n',
    );
  }

  await expect(page, 'Nach der Anmeldung wurde das Dashboard nicht erreicht').toHaveURL(
    /\/dashboard/,
    { timeout: 30_000 },
  );
}
