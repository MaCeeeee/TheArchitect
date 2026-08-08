import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * Der Durchstich am Klick (THE-628).
 *
 * ── WAS DIESER LAUF IST, UND WAS NICHT ──
 *
 * Er ist KEIN Freigabe-Tor. Er kostet Modellaufrufe, braucht Netz und erzeugt
 * echte Daten in Produktion — er kann deshalb nicht im Build laufen. Das Tor
 * bleibt mechanisch (`npm run gate`, THE-611).
 *
 * Er ist die einzige Prüfung, die die FLÄCHE sieht. Der Fehler vom 03.08. saß
 * im Client: das Modal schickte den Gruppen-Schlüssel statt der aufgelösten
 * Quelle. Die API war korrekt — kein API-Test hätte ihn je gefunden. Deshalb
 * meldet sich dieser Lauf über das echte Formular an und klickt, statt eine
 * Abkürzung über `x-api-key` zu nehmen.
 *
 * Ziel ist standardmäßig PRODUKTION, weil dort der Korpus liegt und dort der
 * ausgelieferte Stand läuft.
 */
loadEnv({ path: '.env.e2e' });

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://thearchitect.site';

export default defineConfig({
  testDir: './e2e',
  // Kein Parallelbetrieb: der Lauf legt Projekte an und läuft gegen
  // Rate-Limits (30/min beim Erzeugen). Zwei gleichzeitige Läufe würden sich
  // gegenseitig die Kontingente wegnehmen und wie ein Produktfehler aussehen.
  workers: 1,
  fullyParallel: false,
  // Kein Wiederholen. Ein Durchstich, der beim zweiten Versuch grün wird,
  // verdeckt genau die Flakigkeit, die er aufdecken soll — und er hätte beim
  // Wiederholen ohnehin ein zweites Projekt erzeugt.
  retries: 0,
  // Die Kette ruft Modelle auf; einzelne Schritte dauern echte Minuten.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    // Beweismittel nur im Fehlerfall — ein grüner Lauf braucht keine Artefakte,
    // und je weniger entsteht, desto kleiner die Fläche, auf der ein
    // Zugangsdatum landen könnte.
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
    actionTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
