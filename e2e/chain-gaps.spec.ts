import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';

/**
 * DIE LÜCKEN-ANSICHT (THE-635, Slice 2a).
 *
 * Traegt der Bestand aus Slice 1 weiter? Die Anforderungen, die der Durchstich
 * am Klick erzeugt hat, muessen hier als Luecken erscheinen — offen und ohne
 * Element (`compliance-gaps.service.ts`: `linkedElementIds.length === 0`).
 *
 * READ-ONLY: kein Schreibzugriff, kein Modellaufruf. Braucht ein Projekt, das
 * bereits Ketten-Anforderungen traegt — `E2E_PROJECT_ID`.
 */

const line = (s: string) => console.log(s);
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? '';

test.describe('Kette — Lücken', () => {
  test.skip(
    !PROJECT_ID,
    'E2E_PROJECT_ID fehlt — erst chain-walkthrough.spec.ts laufen lassen und die Kennung uebernehmen',
  );

  test('zeigt die erzeugten Anforderungen als Lücken, mit ihrer Rechtsgrundlage', async ({ page }) => {
    await login(page, readCredentials());

    await page.goto(`/project/${PROJECT_ID}/compliance/gaps`);
    // Auf die Luecken-Antwort warten, nicht auf eine Zeitspanne.
    await page.waitForResponse((r) => /\/compliance\/gaps/.test(new URL(r.url()).pathname), {
      timeout: 30_000,
    });

    const kpis = page.getByTestId('gap-kpis');
    await expect(kpis, 'Die Lücken-Ansicht zeigt keine Kennzahlen').toBeVisible({ timeout: 20_000 });

    // ── AC-4: ein leerer Zustand muss seinen GRUND nennen ────────────────
    if (await page.getByTestId('gap-empty-state').isVisible().catch(() => false)) {
      throw new Error(
        'Die Lücken-Ansicht ist leer.\n' +
          '  Moegliche Gruende: Das Projekt traegt keine Anforderungen, oder alle sind\n' +
          '  bereits mit einem Element verlinkt. Beides ist ein Befund, kein Zufall —\n' +
          `  pruefen mit: /project/${PROJECT_ID}/compliance/gaps`,
      );
    }

    const kpiText = ((await kpis.innerText()) || '').replace(/\s+/g, ' ').trim();
    line(`\n  Kennzahlen: ${kpiText}`);

    // ── AC-1: Einträge vorhanden, Zahl passt zu den Kennzahlen ───────────
    const titles = page.getByTestId('gap-title');
    const count = await titles.count();
    const openFromKpi = Number(kpiText.match(/(\d+)\s*Open\b/i)?.[1] ?? '0');
    line(`  Einträge sichtbar: ${count}   ·   „Open" laut Kennzahl: ${openFromKpi}`);
    expect(count, 'Keine Lücken-Einträge sichtbar').toBeGreaterThan(0);
    expect(
      count,
      `Sichtbare Einträge (${count}) und Kennzahl (${openFromKpi}) fallen auseinander — eine der beiden Zahlen ist falsch`,
    ).toBe(openFromKpi);

    // ── AC-2: die Rechtsgrundlage ist sichtbar ───────────────────────────
    // Die Marke traegt den Regulations-Schluessel; bei Korpus-Anforderungen
    // beginnt er mit `corpus:` — das ist der Beleg, dass die Luecke am GESETZ
    // haengt und nicht bloss an einem Titel.
    const regGroups = page.locator('[data-testid^="gap-regulation-"]');
    const regCount = await regGroups.count();
    expect(regCount, 'Keine Gruppierung nach Rechtsgrundlage').toBeGreaterThan(0);
    const keys: string[] = [];
    for (let i = 0; i < regCount; i++) {
      keys.push((await regGroups.nth(i).getAttribute('data-testid')) ?? '');
    }
    line(`  Rechtsgrundlagen: ${keys.map((k) => k.replace('gap-regulation-', '')).join(' · ')}`);
    expect(
      keys.some((k) => k.includes('corpus:')),
      `Keine Lücke ist an eine KORPUS-Norm gebunden (gefunden: ${keys.join(', ')}) — ` +
        'die Anforderungen ruhen dann auf eingefügtem Text statt auf dem Gesetz (THE-577)',
    ).toBe(true);

    // ── AC-3: Fristen, wo die Klausel eine traegt ────────────────────────
    // Kein Fehlschlag, wenn keine da ist: DSGVO Art. 32 regelt Massnahmen,
    // keine Meldefristen. Gezaehlt wird trotzdem — sonst waere „0" nicht von
    // „nicht geprueft" zu unterscheiden.
    const deadlines = await page.getByTestId('gap-deadline').count();
    line(`  Einträge mit Frist: ${deadlines} von ${count}`);

    line('');
  });
});
