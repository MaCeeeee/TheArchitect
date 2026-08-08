import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';

/**
 * REQ-E2E-001.1 — der erste Prüfstein des Durchstichs.
 *
 * Trägt die Anmeldung nicht, ist alles Weitere gegenstandslos. Deshalb steht
 * sie als eigener Test da und nicht als Vorbereitung in einem größeren Lauf:
 * Wenn sie bricht, soll das Ergebnis „die Anmeldung bricht" heißen und nicht
 * „der Ketten-Durchstich ist rot".
 *
 * Läuft gegen PRODUKTION (Vorgabe). Dieser Test allein schreibt nichts.
 */
test.describe('Durchstich — Anmeldung', () => {
  test('meldet sich am echten Formular an und erreicht das Dashboard', async ({ page }) => {
    const creds = readCredentials();
    await login(page, creds);

    // Nicht nur die Adresse: Das Dashboard muss auch etwas anzeigen. Eine
    // Weiterleitung auf eine leere Seite wäre technisch „angekommen" und
    // praktisch wertlos.
    await expect(page.locator('body')).not.toBeEmpty();
    // Und die Sitzung muss halten — ein Neuladen darf nicht zurück zur
    // Anmeldung werfen. Genau das war der Fehler, den THE-560 geschlossen hat
    // (Abmelden war eine Behauptung); die Gegenrichtung gehört ebenso geprüft.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
