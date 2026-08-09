import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';
import { createProject, e2eProjectName } from './support/project';

/**
 * DER DURCHSTICH — ein Schritt der Kette am Klick (THE-630).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DIESER LAUF SCHREIBT IN PRODUKTION UND KOSTET MODELLAUFRUFE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Er legt ein Projekt an und laesst den Generator ueber eine echte
 * Korpus-Norm laufen. Was er anlegt, bleibt liegen — Aufraeumen ist Slice 3.
 * Das Projekt traegt dafuer ein erkennbares Praefix.
 *
 * ── WARUM GENAU DIESER SCHRITT ──
 *
 * Hier sass der Fehler vom 03.08.: Das Modal schickte beim Speichern den
 * GRUPPEN-Schluessel (`ai-act`) statt der aufgeloesten Quelle (`ai-act-de`),
 * und der Server wies mit „source must be one of …" ab. Gefunden hat ihn ein
 * Mensch, Minuten nach dem Deploy. Die Bauteil-Tests waren gruen — ihre
 * Fixture kannte nur Quellen, deren Stamm zufaellig gueltig ist.
 *
 * ── WAS DER LAUF BEWEIST, WENN ER GRUEN IST ──
 *
 * Nicht „die Kette funktioniert". Sondern: Aus einem NEUEN Projekt fuehrt am
 * Klick ein Weg vom Korpus-Gesetz zu einer Anforderung, die ihren ANKER
 * traegt — Norm und Klausel, nicht blosser Text. Eine Anforderung ohne Anker
 * ist der Zustand, den THE-577 als „ruht auf einer Paraphrase" verworfen hat.
 */

const line = (s: string) => console.log(s);

/**
 * Das Gesetz fuer den Durchstich.
 *
 * DSGVO, weil dort die gold-tragenden Artikel liegen (Art. 24/32) und der
 * Korpus fuer sie eine bestaetigte Rolle fuehrt. Ein Gesetz mit
 * Sprachsuffix-Stamm (`nis2-de`, `esg-rating-de`) waere der schaerfere Test
 * fuer den Fehler vom 03.08. — deshalb steht er als Nachsatz in Slice 2,
 * nicht als stille Auslassung.
 */
const LAW = process.env.E2E_LAW ?? 'DSGVO';

/**
 * Der Artikel — und warum NICHT einfach der erste.
 *
 * Der erste Entwurf nahm `options[1]`, also den ersten echten Eintrag. Das war
 * **Art. 1 — Gegenstand und Ziele**, und der Lauf meldete korrekt „3 Klauseln,
 * 3 ohne Anforderung": Ein Zweckartikel traegt keine Pflichten. Bei Gesetzen
 * ist Artikel 1 praktisch immer Gegenstand/Ziele — „nimm den ersten" ist
 * deshalb die schlechteste aller Wahlen.
 *
 * Art. 32 traegt Pflichten, ist im Korpus typisiert (`controller`) und ist
 * einer der gold-tragenden Artikel des Waechters (THE-611). Der Durchstich
 * laeuft damit ueber genau den Text, an dem die Richtigkeit gemessen wird.
 */
const ARTICLE = new RegExp(process.env.E2E_ARTICLE ?? 'Art\\. 32\\b');

test.describe('Durchstich — Gesetz zu Anforderung', () => {
  test('erzeugt aus einer Korpus-Norm verankerte Anforderungen', async ({ page }) => {
    const creds = readCredentials();

    // Die Server-Antworten mitschreiben: Bricht ein Schritt, soll der Bericht
    // sagen WELCHER und was der Server dazu sagte — nicht bloss „rot".
    const failures: string[] = [];
    page.on('response', async (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) {
        const body = await r.text().catch(() => '');
        failures.push(`${r.status()} ${new URL(r.url()).pathname} → ${body.slice(0, 200)}`);
      }
    });

    await login(page, creds);

    // ── 1. Eigenes Projekt (AC-1) ───────────────────────────────────────
    const name = e2eProjectName(new Date());
    const projectId = await createProject(page, name);
    line(`\n  Projekt: ${name}  (${projectId})`);

    // ── 2. Generator oeffnen ────────────────────────────────────────────
    // Er sitzt in der WERKZEUGLEISTE der Projekt-Ansicht, nicht auf der
    // Compliance-Flaeche. Der Lesegang hat ihn dort zwei Anlaeufe lang
    // vergeblich gesucht — der Hinweis gehoert deshalb hierher.
    await page.locator('button[title*="Generate Requirements"]').click();

    // Auf die Norm-Antwort warten, NICHT auf eine Zeitspanne: Sie ist ~240 KB
    // gross, und ein zu frueher Blick zeigt die Liste vor dem Laden. Genau
    // dieser Fehler hat im Lesegang beinahe zu einer Falschmeldung gefuehrt.
    await page.waitForResponse((r) => /\/norms(\?|$)/.test(new URL(r.url()).pathname), {
      timeout: 30_000,
    });

    // ── 3. Korpus-Gesetz waehlen (AC-2) ─────────────────────────────────
    const lawSelect = page.locator('select').first();
    await expect(lawSelect).toBeVisible();
    await lawSelect.selectOption({ label: LAW });
    line(`  Gesetz gewählt: ${LAW}`);

    // Die Artikel-Auswahl erscheint erst nach der Gesetzeswahl.
    const sectionSelect = page.getByTestId('section-select');
    await expect(
      sectionSelect,
      'Nach der Gesetzeswahl erschien keine Artikel-Auswahl — der Korpus-Zweig greift nicht',
    ).toBeVisible({ timeout: 20_000 });

    const options = (await sectionSelect.locator('option').allInnerTexts())
      .map((o) => o.trim())
      .filter(Boolean);
    line(`  Artikel verfügbar: ${options.length}`);
    const article = options.find((o) => ARTICLE.test(o));
    if (!article) {
      throw new Error(
        `Der Zielartikel (${ARTICLE}) steht nicht in der Auswahl. Vorhanden: ${options.slice(0, 12).join(' | ')}`,
      );
    }
    await sectionSelect.selectOption({ label: article });
    line(`  Artikel gewählt: ${article.slice(0, 60)}`);

    // ── 4. Vorschau: der Text kommt aus dem Korpus, nicht aus der Zwischenablage ──
    const textField = page.getByTestId('regulation-text');
    await expect(textField).toBeVisible();
    await expect
      .poll(async () => ((await textField.inputValue().catch(() => '')) || '').length, {
        timeout: 25_000,
        message: 'Der Artikeltext wurde nicht aus dem Korpus geladen',
      })
      .toBeGreaterThan(100);
    const preview = await textField.inputValue();
    line(`  Vorschau geladen: ${preview.length} Zeichen — „${preview.slice(0, 80).replace(/\s+/g, ' ')}…"`);
    // Schreibgeschützt, wenn der Text aus dem Korpus stammt (THE-570).
    line(`  Feld schreibgeschützt: ${await textField.isEditable() ? 'NEIN' : 'ja'}`);

    // ── 5. Erzeugen — ab hier kostet es (AC-5) ──────────────────────────
    line(`\n  ⚠ Ab hier laufen echte Modellaufrufe.`);
    const started = Date.now();
    await page.getByRole('button', { name: /generate requirements/i }).click();

    const chainStats = page.getByTestId('chain-stats');
    await expect(
      chainStats.or(page.getByTestId('chain-provenance')).first(),
      'Der Generator lieferte kein Ergebnis — die Server-Antworten unten sagen, warum',
    ).toBeVisible({ timeout: 240_000 });
    line(`  Erzeugt nach ${Math.round((Date.now() - started) / 1000)} s`);

    if (await chainStats.isVisible().catch(() => false)) {
      const stats = ((await chainStats.innerText()) || '').replace(/\s+/g, ' ').trim();
      line(`  Ketten-Quoten: ${stats}`);
      // Liefert die Kette NICHTS, ist die naechste Zusicherung (Verankerung)
      // gegenstandslos — und ihre Fehlermeldung waere irrefuehrend. Der Grund
      // gehoert hierher, wo er sichtbar ist.
      const m = stats.match(/(\d+) clauses? · (\d+) without requirement/);
      if (m && m[1] === m[2]) {
        throw new Error(
          `Die Kette hat aus allen ${m[1]} Klauseln KEINE Anforderung gewonnen (${stats}).\n` +
            `  Das ist bei einem Zweck- oder Definitionsartikel richtig — bei „${article}" waere es ein Befund.`,
        );
      }
    }

    // ── 6. DER KERN: die Verankerung ist sichtbar (AC-4) ────────────────
    const provenance = page.getByTestId('chain-provenance').first();
    await expect(
      provenance,
      'Die Vorschlaege tragen keine sichtbare Verankerung — sie ruhen auf Text statt auf dem Gesetz (THE-577)',
    ).toBeVisible({ timeout: 30_000 });
    const anchor = ((await provenance.innerText()) || '').replace(/\s+/g, ' ').trim();
    line(`  Verankerung: „${anchor.slice(0, 90)}"`);

    // ── DER SCHARFE PUNKT (Fehler vom 03.08.) ───────────────────────────
    //
    // Der Anker muss die AUFGELOESTE Quelle tragen, nicht den Gruppen-Schluessel.
    // Bei `dsgvo` faellt beides zusammen — bei `esg-rating` NICHT: die Gruppe
    // heisst `esg-rating`, die Quelle `esg-rating-de`. Genau dort wies der
    // Server am 03.08. mit „source must be one of …" ab.
    const group = LAW.toLowerCase();
    const key = anchor.match(/([a-z0-9-]+):([a-z0-9.-]+)/i)?.[1] ?? '';
    line(`  Quellen-Schlüssel im Anker: „${key}"  (Gruppe: „${group}")`);
    expect(key, 'Der Anker trägt keinen Quellen-Schlüssel').not.toBe('');

    // ── 7. Bestaetigen (AC-3) ───────────────────────────────────────────
    const save = page.getByRole('button', { name: /^Save \d+ requirement/i });
    await expect(save, 'Kein Speichern-Knopf — nichts war ausgewählt').toBeVisible();
    const saveLabel = (await save.innerText()).trim();
    line(`\n  Speichern: „${saveLabel}"`);
    await save.click();

    // Der Fehler vom 03.08. schlug GENAU HIER zu: „source must be one of …".
    // Deshalb wird der Dialog-Schluss als Erfolgsbedingung geprueft, nicht
    // eine Meldung, die auch bei einem Fehlschlag erscheinen koennte.
    await expect(
      page.getByTestId('section-select'),
      'Der Dialog blieb offen — das Speichern ist fehlgeschlagen (Server-Antworten unten)',
    ).toBeHidden({ timeout: 60_000 });
    line(`  Gespeichert.`);

    if (failures.length > 0) {
      line(`\n  ⚠ Server-Fehler während des Laufs:`);
      for (const f of failures) line(`    ${f}`);
    } else {
      line(`\n  Keine Server-Fehler.`);
    }

    line(`\n  Aufräumen (Slice 3): Projekt „${name}" (${projectId})\n`);
    expect(failures, `Server-Fehler während des Durchstichs:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
