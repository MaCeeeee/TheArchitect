import { expect, type Page } from '@playwright/test';

/**
 * Ein eigenes Projekt für den Durchstich (THE-630, AC-1).
 *
 * ── WARUM EIN EIGENES ──
 *
 * Der Lauf schreibt in PRODUKTION. Er darf keinen Bestand anfassen, den jemand
 * für eine Messung braucht — und er muss hinterher erkennbar sein, damit man
 * ihn wegräumen kann (Slice 3). Deshalb trägt jedes Projekt einen Zeitstempel
 * im Namen und ein gemeinsames Präfix.
 */

/** Woran ein Durchstich-Projekt erkennbar ist — auch in einem Monat noch. */
export const E2E_PROJECT_PREFIX = '[E2E-Durchstich]';

export function e2eProjectName(now: Date): string {
  const stamp = now.toISOString().replace('T', ' ').slice(0, 16);
  return `${E2E_PROJECT_PREFIX} ${stamp}`;
}

/**
 * Legt über die FLÄCHE ein Projekt an und gibt seine Kennung zurück.
 *
 * Über den Dialog, nicht über die API: Der Durchstich existiert, weil der
 * Fehler vom 03.08. im Client sass. Eine Abkürzung über `projectAPI.create`
 * würde genau die Ebene überspringen, die geprüft werden soll.
 */
export async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/dashboard');

  // Es gibt zwei „New Project"-Knöpfe (Kopfzeile und Leerzustand) — der erste
  // sichtbare genügt, beide öffnen denselben Dialog.
  await page.getByRole('button', { name: /new project/i }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog, 'Der Anlege-Dialog ist nicht erschienen').toBeVisible();

  await dialog.getByPlaceholder('My Architecture Project').fill(name);
  await dialog.getByRole('button', { name: /create project/i }).click();

  // Der Dialog leitet nach dem Anlegen auf das Projekt um — daraus kommt die
  // Kennung. Steht sie nicht in der Adresse, ist das Anlegen fehlgeschlagen,
  // und zwar sichtbar, statt dass ein späterer Schritt raetselhaft bricht.
  await expect(page, 'Nach dem Anlegen wurde nicht auf das Projekt umgeleitet').toHaveURL(
    /\/project\/[a-f0-9]{24}/,
    { timeout: 30_000 },
  );
  const id = page.url().match(/\/project\/([a-f0-9]{24})/)?.[1];
  if (!id) throw new Error(`Keine Projekt-Kennung in der Adresse: ${page.url()}`);
  return id;
}
