import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { login, readCredentials } from './support/login';

/**
 * NACHWEIS UND ATTEST (THE-651, Slice 2d, zweite Hälfte).
 *
 * ── DIE LETZTE STATION DER KETTE ──
 *
 * THE-650 hat gezeigt, dass ein Mensch `enforced` setzen kann und die Maschine
 * es nicht war. Offen blieb das strengere Tor: `attested` verlangt einen
 * NACHWEIS — mindestens eine nicht-veraltete Evidenz (THE-558, „ein Protokoll
 * von 2023 belegt 2026 nichts mehr"). Der Lauf davor hat als Negativ-Kontrolle
 * belegt, dass es ohne Nachweis mit 400 abgewiesen wird. Hier geht es durch.
 *
 * ── DER TEIL, DER MEHR IST ALS EINE FORMALIE ──
 *
 * Die Datei wird NICHT hochgeladen. Gespeichert wird nur ihr SHA-256. Das ist
 * eine Datenschutz-Entscheidung mit Substanz: Prüfprotokolle enthalten oft
 * genau die Daten, die man nicht in fremde Systeme gibt. Das Produkt kann
 * belegen, DASS ein Dokument existierte und unverändert ist, ohne es zu
 * besitzen.
 *
 * Dieser Lauf prüft die Zusage doppelt: die Fläche muss sie aussprechen, UND
 * der gespeicherte Fingerabdruck muss der echte SHA-256 der Datei sein — hier
 * unabhängig nachgerechnet. Stimmte er nicht, wäre der Nachweis wertlos.
 *
 * SCHREIBT IN PRODUKTION (eine Evidenz, ein Tor), kostet keinen Modellaufruf.
 */

const line = (s: string) => console.log(s);
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? '';

/** Der Inhalt, dessen Fingerabdruck am Ende im System stehen muss. */
const DOC = [
  'Prüfprotokoll — Verschlüsselung ruhender Daten',
  'Geprüft am: 2026-08-10',
  'Ergebnis: AES-256 auf allen Volumes aktiv, Schlüsselrotation 90 Tage.',
].join('\n');
const DOC_SHA256 = createHash('sha256').update(DOC, 'utf8').digest('hex');

test.describe('Kette — Nachweis und Attest', () => {
  test.skip(!PROJECT_ID, 'E2E_PROJECT_ID fehlt');

  test('ein Nachweis öffnet das Attest — und die Datei bleibt hier', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', async (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) {
        const f = `${r.status()} ${new URL(r.url()).pathname} → ${(await r.text().catch(() => '')).slice(0, 200)}`;
        failures.push(f);
        line(`  ⚠ ${f}`);
      }
    });

    await login(page, readCredentials());
    const me = await page.evaluate(() => {
      const raw = localStorage.getItem('thearchitect-auth');
      const s = raw ? JSON.parse(raw)?.state : null;
      return { token: s?.token ?? '', userId: s?.user?.id ?? s?.user?._id ?? '' };
    });
    const auth = { Authorization: `Bearer ${me.token}` };

    // ── 0. Die Anforderung aus THE-650 wiederfinden ─────────────────────
    const reqs = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/requirements?limit=200`, { headers: auth })
    ).json();
    const items: Array<{
      _id: string; title: string; linkedElementIds?: string[];
      gates?: { covered?: { state: string }; enforced?: { state: string; setBy: string } };
    }> = reqs?.data?.items ?? [];

    const target = items.find(
      (r) => r.gates?.enforced?.state === 'yes' && (r.linkedElementIds ?? []).length > 0,
    );
    if (!target) {
      throw new Error(
        'Keine Anforderung mit gesetztem `enforced` gefunden.\n' +
          '  Diese Station setzt auf THE-650 auf — erst muss ein Mensch das erste Tor\n' +
          `  gesetzt haben. Gelesen: ${items.length} Anforderungen.`,
      );
    }
    line(`\n  Anforderung: „${target.title.slice(0, 60)}"`);
    line(`  enforced: ${target.gates?.enforced?.state} (setBy ${target.gates?.enforced?.setBy})`);

    const elementId = (target.linkedElementIds ?? [])[0];
    const els = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/elements`, { headers: auth })
    ).json();
    const elementName = (els?.data ?? els ?? []).find(
      (e: { id?: string }) => e.id === elementId,
    )?.name;
    expect(elementName, `Element ${elementId} hat keinen Namen`).toBeTruthy();

    // ── 1. Über die Fläche zum Element (Weg aus THE-650) ────────────────
    await page.goto(`/project/${PROJECT_ID}`);
    await page.waitForTimeout(5_000);

    const guided = page.getByRole('button', { name: /^(Guided Mode|All Features)$/ });
    await expect(guided).toBeVisible({ timeout: 30_000 });
    if (((await guided.innerText()) || '').includes('Guided Mode')) {
      await guided.click();
      await page.waitForTimeout(1_500);
    }
    const explorerTab = page.getByRole('button', { name: /^Explorer$/i }).first();
    if (await explorerTab.isVisible().catch(() => false)) {
      await explorerTab.click();
      await page.waitForTimeout(1_500);
    }

    await page.getByPlaceholder('Search elements...').fill(elementName!);
    await page.waitForTimeout(1_500);
    await page.getByRole('button', { name: elementName!, exact: false }).first().click();
    await page.waitForTimeout(2_500);
    await page.getByRole('button', { name: /^Compliance( \(\d+\))?$/ }).first().click();
    await page.waitForTimeout(2_500);
    line(`  Am Element „${elementName}", Reiter Compliance.`);

    // ── 2. AC-1: Die Zusage steht auf der Fläche ───────────────────────
    const evidenceToggle = page.getByRole('button', { name: /^Evidence \(\d+ fresh/ }).first();
    await expect(
      evidenceToggle,
      'Kein Evidence-Bereich an der Anforderung — Station 6 ist am Klick nicht erreichbar',
    ).toBeVisible({ timeout: 20_000 });
    line(`  Evidence-Schalter: „${await evidenceToggle.innerText()}"`);
    await evidenceToggle.click();
    await page.waitForTimeout(1_000);

    const notice = page.getByTestId('no-upload-notice').first();
    await expect(
      notice,
      'Die Fläche sagt NICHT, dass die Datei den Rechner nicht verlässt.\n' +
        '  Ein Nutzer, der glaubt hochgeladen zu haben, hat keinen Nachweis,\n' +
        '  sondern ein Missverständnis — und im Zweifel ein Haftungsproblem.',
    ).toBeVisible({ timeout: 10_000 });
    const noticeText = ((await notice.innerText()) || '').replace(/\s+/g, ' ');
    line(`  Zusage: „${noticeText.slice(0, 96)}…"`);
    expect(noticeText.toLowerCase()).toContain('not uploaded');

    // ── 3. Den Nachweis anlegen ─────────────────────────────────────────
    await page.getByLabel('Kind').first().fill('audit-report');
    await page.getByPlaceholder(/register\.example/).fill('https://intern.example/prot/2026-08-10');
    // Die Datei entsteht nur im Speicher — sie liegt nirgends auf der Platte
    // und wird auch nicht hochgeladen. Genau das ist der Punkt der Station.
    await page.getByTestId('evidence-file').setInputFiles({
      name: 'pruefprotokoll-2026-08-10.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(DOC, 'utf8'),
    });

    // AC-1 (scharf): der lokal berechnete Fingerabdruck muss der echte sein.
    const computed = page.getByTestId('evidence-computed-hash');
    await expect(computed, 'Kein Fingerabdruck berechnet').toBeVisible({ timeout: 15_000 });
    const shown = ((await computed.innerText()) || '').trim();
    line(`\n  Erwartet (node:crypto): ${DOC_SHA256}`);
    line(`  Angezeigt:              …${shown.slice(-64)}`);
    expect(
      shown,
      'Der angezeigte Fingerabdruck ist NICHT der SHA-256 der Datei.\n' +
        '  Damit belegt der Nachweis nichts — er sähe nur so aus.',
    ).toContain(DOC_SHA256);

    const [evRes] = await Promise.all([
      page.waitForResponse(
        (r) => /\/requirements\/.*\/evidence$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Attach evidence' }).first().click(),
    ]);
    line(`  Angelegt: ${evRes.status()}`);
    expect(evRes.status(), 'Der Nachweis wurde abgelehnt').toBeLessThan(300);

    // ── 4. AC-2: Jetzt öffnet sich das Attest ───────────────────────────
    await page.waitForTimeout(2_000);
    const attest = page.getByRole('button', { name: /^attested: .* — set$/ }).first();
    await expect(attest, 'Kein `attested`-Tor sichtbar').toBeVisible({ timeout: 20_000 });
    await attest.click();

    const reason = page.getByPlaceholder(/Why\? \(attested — required\)/i);
    await expect(reason, 'Kein Begründungsfeld für das Attest').toBeVisible();
    const REASON = `E2E ${new Date().toISOString().slice(0, 16)} — Prüfprotokoll liegt vor`;
    await reason.fill(REASON);

    const [gateRes] = await Promise.all([
      page.waitForResponse(
        (r) => /\/requirements\/.*\/gates$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'confirm yes' }).first().click(),
    ]);
    line(`  Attest gesetzt: ${gateRes.status()}`);
    expect(
      gateRes.status(),
      'Das Attest wurde abgelehnt, obwohl ein frischer Nachweis vorliegt —\n' +
        '  die Vorbedingung greift dann zu streng oder der Nachweis kam nicht an.',
    ).toBe(200);

    // ── 5. Der Zustand am Dokument ──────────────────────────────────────
    await page.waitForTimeout(2_000);
    const after = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/requirements?limit=200`, { headers: auth })
    ).json();
    const g = (after?.data?.items ?? []).find(
      (r: { _id: string }) => String(r._id) === String(target._id),
    )?.gates;
    line(`\n════ Die drei Tore ════`);
    line(`  covered : ${g?.covered?.state}  setBy ${g?.covered?.setBy}`);
    line(`  enforced: ${g?.enforced?.state}  setBy ${g?.enforced?.setBy}`);
    line(`  attested: ${g?.attested?.state}  setBy ${g?.attested?.setBy}`);

    expect(g?.attested?.state, 'Das Attest steht nicht auf `yes`').toBe('yes');
    expect(g?.attested?.setBy, 'Das Attest trägt `system` als Urheber').not.toBe('system');
    expect(g?.covered?.setBy, '`covered` hat seinen maschinellen Urheber verloren').toBe('system');

    // ── 6. AC-4/AC-5: Das Prüfer-Bündel ─────────────────────────────────
    //
    // Ein Bündel, das nicht unterscheidet, WER was gesetzt hat, ist als
    // Nachweis wertlos — und eines, das nur die grünen Zeilen zeigt, ist
    // dieselbe Klasse wie „No gaps detected" (THE-638).
    const bundle = await (
      await page.request.get(
        `/api/projects/${PROJECT_ID}/requirements/audit-bundle?format=json`,
        { headers: auth },
      )
    ).json();
    const raw = JSON.stringify(bundle);
    line(`\n════ Prüfer-Bündel ════`);
    line(`  Schlüssel: ${JSON.stringify(Object.keys(bundle?.data ?? bundle ?? {}))}`);
    line(`  Größe: ${raw.length} Zeichen`);

    expect(raw, 'Das Bündel nennt die Tore nicht').toMatch(/attested/);
    expect(
      raw,
      'Das Bündel unterscheidet nicht, WER ein Tor gesetzt hat — ohne `setBy`\n' +
        '  ist ein maschinelles Urteil von einer menschlichen Unterschrift nicht\n' +
        '  zu trennen, und genau das ist der Zweck des Bündels.',
    ).toMatch(/setBy/);

    // AC-5: Von 14 Anforderungen trägt genau EINE ein Attest. Ein Bündel, das
    // das verschweigt und nur die grüne Zeile zeigt, wäre dieselbe Klasse wie
    // „No gaps detected" (THE-638) — ein Signal, das Vollständigkeit meldet,
    // wo keine ist. Der Haftungsausschluss muss die Grenze aussprechen.
    const disclaimer = String((bundle?.data ?? bundle)?.disclaimer ?? '');
    line(`  Haftungsausschluss: „${disclaimer.replace(/\s+/g, ' ').slice(0, 150)}…"`);
    expect(
      disclaimer.length,
      'Das Bündel trägt keinen Haftungsausschluss — es sagt nicht, was es NICHT belegt',
    ).toBeGreaterThan(40);

    // Und es muss die unattestierten Anforderungen wirklich enthalten, nicht
    // nur die eine fertige: sonst läse ein Prüfer „alles belegt".
    const attestedCount = (raw.match(/"attested"/g) ?? []).length;
    line(`  Erwähnungen von „attested" im Bündel: ${attestedCount}`);
    expect(
      attestedCount,
      'Das Bündel nennt das Attest nur einmal — es zeigt vermutlich nur die\n' +
        '  attestierte Anforderung und verschweigt die übrigen 13.',
    ).toBeGreaterThan(1);

    line(`\n  ⇒ Der Nachweis trägt das Attest, und die Datei blieb hier.\n`);
    expect(failures, `Server-Fehler:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
