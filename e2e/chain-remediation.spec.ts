import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';

/**
 * DIE REMEDIATION AM KLICK (THE-636, Slice 2b).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SCHREIBT IN PRODUKTION UND KOSTET MODELLAUFRUFE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── DER WEG, UND WARUM ER LAENGER IST ALS GEDACHT ──
 *
 * Aus der Luecken-Ansicht fuehrt ein „Remediate"-Knopf direkt zum
 * Remediate-Reiter — und dort in eine Sackgasse: „Select a standard in the
 * Pipeline tab first." Ich habe daraus zuerst eine Architekturluecke
 * geschlossen. Falsch: Eine Korpus-Norm kommt ueber **Standards →
 * „Add to pipeline"** in die Pipeline (RegulationsPanel, THE-390 P4b), nicht
 * ueber den Pipeline-Reiter. Der Hinweis nennt den falschen Ort — das bleibt
 * als eigener Befund (THE-637), aendert aber nichts an der Erreichbarkeit.
 *
 * Der Lauf geht deshalb: Standards → Add to pipeline → Remediate → anwenden.
 *
 * ── WORAUF ES AM ENDE ANKOMMT ──
 *
 * Nicht „ein Element wurde erzeugt", sondern: **die ausloesende Anforderung
 * traegt es**. Der Rueckschluss aus THE-568 ist gebaut und getestet, aber nie
 * an der Flaeche gelaufen. Er sperrt alles Weitere auf — ohne verlinktes
 * Element bleibt `covered` leer, und `confirmSharedMeasure` verweigert die
 * geteilte Massnahme.
 *
 * Braucht ein Projekt mit Ketten-Anforderungen: `E2E_PROJECT_ID`.
 *
 * ── ZWEI TESTS, ZWEI PREISE ──
 *
 * Der erste (THE-644) ist billig: ein einzelner Aufruf, kein Modell, kein
 * Schreibzugriff. Er prueft die Grenze zwischen „vorab entscheidbar" und „erst
 * im Strom". Der zweite ist der teure Durchstich mit echten Modellaufrufen.
 */

const line = (s: string) => console.log(s);

/**
 * Zwischen den Reitern per KLICK wechseln, nicht per Adresse.
 *
 * `complianceStore` ist ein einfacher Zustand-Store OHNE `persist` (anders als
 * `authStore`). Ein `page.goto()` laedt die Seite komplett neu und loescht ihn
 * — die im Pipeline-Reiter getroffene Auswahl waere danach weg. Ein Nutzer
 * klickt im Menue und behaelt sie. Drei Sackgassen im ersten Anlauf gingen auf
 * genau diesen Unterschied zurueck.
 */
async function goToSection(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first().click();
  await page.waitForTimeout(2_500);
}
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? '';
/** Das Gesetz, dessen Luecken behandelt werden — muss zum Projekt passen. */
const LAW = process.env.E2E_LAW ?? 'DSGVO';

test.describe('Kette — Remediation', () => {
  test.skip(!PROJECT_ID, 'E2E_PROJECT_ID fehlt — erst chain-walkthrough.spec.ts laufen lassen');

  /**
   * THE-644 — die Umkehrprobe zum fuenf Minuten langen Schweigen.
   *
   * Am 10.08. antwortete `generate` auf einen Cast-Fehler mit HTTP 200 und
   * `{"type":"error"}` im SSE-Rumpf. Das ist bei SSE unvermeidlich, SOBALD der
   * Strom offen ist — der Statuscode ist dann raus. Vermeidbar ist es davor.
   *
   * Dieser Test prueft genau diese Grenze und kostet weder Modellaufruf noch
   * Schreibzugriff: eine Norm, die es nicht gibt, ist ohne den Strom
   * entscheidbar und MUSS mit 404 abgewiesen werden. Bleibt hier eine 200
   * stehen, ist die Vorab-Pruefung weg — und jeder kuenftige Fehlschlag
   * derselben Klasse wieder unsichtbar.
   *
   * Steht VOR dem teuren Lauf, damit er auch dann faellt, wenn jener abbricht.
   */
  test('ein vorab entscheidbarer Fehler kommt als 404 — nicht als 200 mit Fehlertext', async ({ page }) => {
    await login(page, readCredentials());

    // Der Token aus dem persistierten Auth-Store — dieselbe Quelle, aus der
    // der Axios-Interceptor ihn nimmt (api.ts:15).
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('thearchitect-auth');
      return raw ? (JSON.parse(raw)?.state?.token ?? '') : '';
    });
    expect(token, 'Nach der Anmeldung liegt kein Token im Auth-Store').not.toBe('');

    const res = await page.request.post(
      `/api/projects/${PROJECT_ID}/remediation/generate`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          context: {
            source: 'compliance',
            // Ein Schluessel im gueltigen FORMAT, den es aber nicht gibt: so
            // faellt er in die Norm-Aufloesung und nicht schon in die
            // Zod-Pruefung, die ohnehin 400 liefern wuerde.
            standardId: 'corpus:dieses-gesetz-gibt-es-nicht',
            gapSectionIds: ['art-1'],
          },
        },
      },
    );

    const body = (await res.text()).slice(0, 200);
    line(`\n  Unbekannte Norm → ${res.status()} ${body}`);
    expect(
      res.status(),
      `Der Server antwortete ${res.status()} statt 404. Ist es eine 200, steht der\n` +
        '  Fehler wieder nur im Rumpf — und ein Lauscher auf 4xx/5xx schweigt dazu,\n' +
        '  genau wie beim Cast-Fehler am 10.08. (THE-644).',
    ).toBe(404);
    expect(body, 'Die 404 nennt nicht, WELCHE Norm fehlt').toContain('norm not found');
  });

  test('nimmt die Norm in die Pipeline, erzeugt ein Element und verlinkt es zurück', async ({ page }) => {
    // Server-Fehler SOFORT ausgeben, nicht erst am Ende sammeln: Bricht der
    // Lauf frueh ab, waere die Diagnose sonst genau dann unerreichbar, wenn man
    // sie braucht. (Beim ersten Entwurf genau so passiert.)
    const failures: string[] = [];
    page.on('response', async (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) {
        const f = `${r.status()} ${new URL(r.url()).pathname} → ${(await r.text().catch(() => '')).slice(0, 250)}`;
        failures.push(f);
        line(`  ⚠ ${f}`);
      }
    });
    // Jede Remediations-Antwort zeigen. Der erste Lauf nach dem Fix lief 5 min
    // ins Leere, ohne dass sichtbar war, ob der Aufruf ueberhaupt stattfand.
    page.on('response', async (r) => {
      const u = new URL(r.url()).pathname;
      if (/remediation/.test(u)) {
        line(`  → ${r.request().method()} ${u}: ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
      }
    });
    // Und die Antwort der Pipeline-Aufnahme immer zeigen — sie ist der Schritt,
    // an dem der erste Lauf scheiterte.
    page.on('response', async (r) => {
      if (/\/norms\/.*\/pipeline$/.test(new URL(r.url()).pathname)) {
        line(`  → Pipeline-Aufnahme: ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
      }
    });

    await login(page, readCredentials());

    // ── 0. Ausgangslage: wie viele Lücken sind offen? ───────────────────
    const gapCount = async (): Promise<number> => {
      await goToSection(page, 'Gap Analysis');
      await expect(page.getByTestId('gap-kpis')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1_500);
      return page.getByTestId('gap-title').count();
    };

    // EINMAL per Adresse einsteigen, danach nur noch klicken.
    await page.goto(`/project/${PROJECT_ID}/compliance`);
    await page.waitForTimeout(4_000);
    const before = await gapCount();
    line(`\n  Lücken vorher: ${before}`);
    expect(before, 'Das Projekt hat keine Lücken — nichts zu remediieren').toBeGreaterThan(0);

    // ── 1. Die Vorstufe: Norm über STANDARDS in die Pipeline ────────────
    line(`\n════ Standards → Add to pipeline ════`);
    await goToSection(page, 'Standards');
    const panel = page.getByTestId('regulations-panel');
    await expect(panel, 'Das Regulations-Panel fehlt — ohne es gibt es keinen Weg in die Pipeline').toBeVisible({
      timeout: 30_000,
    });

    // Die Zeile des gesuchten Gesetzes; kein testid je Zeile, also über den Titel.
    const row = panel.locator('li').filter({ hasText: new RegExp(LAW, 'i') }).first();
    await expect(row, `Keine Zeile für ${LAW} im Regulations-Panel`).toBeVisible({ timeout: 15_000 });
    line(`  Zeile: „${((await row.innerText()) || '').replace(/\s+/g, ' ').trim().slice(0, 80)}"`);

    const addBtn = row.getByRole('button', { name: /add to pipeline/i });
    if (await addBtn.isVisible().catch(() => false)) {
      // Auf die SERVER-Antwort warten, nicht auf ein Etikett in der Flaeche.
      // Der erste Entwurf wartete auf „In pipeline" und meldete einen
      // Fehlschlag, obwohl der Server 201 lieferte — die Zusicherung prueft
      // dann die Anzeige statt der Wirkung.
      const [res] = await Promise.all([
        page.waitForResponse((r) => /\/norms\/.*\/pipeline$/.test(new URL(r.url()).pathname), {
          timeout: 30_000,
        }),
        addBtn.click(),
      ]);
      expect(
        res.status(),
        `Die Pipeline-Aufnahme wurde abgelehnt: ${res.status()}`,
      ).toBe(201);
      line(`  ✓ in die Pipeline aufgenommen (Server: 201)`);

      // Nebenbefund, kein Fehlschlag: Die Zeile sollte danach „In pipeline"
      // zeigen (RegulationsPanel:92). Tut sie es nicht, ist der Zustand
      // trotzdem angelegt — die ANZEIGE zieht nur nicht nach.
      await page.waitForTimeout(2_000);
      const flipped = await row.getByText(/in pipeline/i).isVisible().catch(() => false);
      if (!flipped) {
        line(`  ⚠ Die Zeile zeigt weiterhin „Add to pipeline" — die Anzeige zieht`);
        line(`    nicht nach, obwohl der Zustand angelegt ist. Eigener Befund.`);
      }
    } else {
      line(`  (bereits in der Pipeline)`);
    }

    // ── 2. Die Norm im Pipeline-Reiter AUSWAEHLEN ───────────────────────
    //
    // Der dritte Schritt, den ich zweimal uebersehen habe. Die Aufnahme legt
    // den Zustand an, waehlt ihn aber nicht aus: Das Auswahlfeld steht auf
    // „Select a standard…". `RemediateGateway` liest `selectedStandardId` und
    // waehlt selbst NICHTS aus — deshalb der Hinweis „Select a standard in the
    // Pipeline tab first". Er ist korrekt; ich hielt ihn faelschlich fuer einen
    // falschen Wegweiser (THE-637).
    line(`\n════ Pipeline → Norm auswählen ════`);
    await goToSection(page, 'Pipeline');
    const picker = page.locator('select').filter({ hasText: new RegExp(LAW, 'i') }).first();
    await expect(
      picker,
      `Im Pipeline-Reiter steht keine Auswahl mit ${LAW} — die Aufnahme ist nicht angekommen`,
    ).toBeVisible({ timeout: 20_000 });
    const opt = (await picker.locator('option').allInnerTexts())
      .map((o) => o.trim())
      .find((o) => new RegExp(LAW, 'i').test(o));
    if (!opt) throw new Error(`Kein Eintrag für ${LAW} im Auswahlfeld`);
    await picker.selectOption({ label: opt });
    line(`  Ausgewählt: „${opt}"`);
    await page.waitForTimeout(3_000);

    // ── 3. Remediate — jetzt mit ausgewählter Norm ───────────────────────
    line(`\n════ Remediate ════`);
    await goToSection(page, 'Remediate');
    await page.waitForTimeout(2_500);

    // Die Sackgasse aus THE-637 darf jetzt NICHT mehr erscheinen. Tut sie es
    // doch, ist die Aufnahme nicht angekommen — und das ist der Befund, nicht
    // ein Timeout an einem Knopf, den es nie gab.
    const deadEnd = page.getByText(/select a standard in the pipeline tab first/i);
    if (await deadEnd.isVisible().catch(() => false)) {
      throw new Error(
        'Der Remediate-Reiter verlangt weiterhin einen Standard, obwohl die Norm\n' +
          '  in die Pipeline aufgenommen wurde. Entweder greift die Auswahl nicht\n' +
          '  (selectStandard aus pipelineStates) oder die Aufnahme hat die Norm nicht\n' +
          '  als Pipeline-Zustand angelegt.',
      );
    }

    // ── 3a. Erzeugen — aber NUR, wenn noch kein Vorschlag da ist ────────
    //
    // `RemediateGateway` filtert Sektionen weg, die bereits einen Vorschlag
    // tragen (unprocessedGapSectionIds). Nach einem erfolgreichen Lauf gibt es
    // den Knopf also gar nicht mehr, sondern „All 1 gap has a proposal".
    // Das ist richtig so — und es waere falsch, hier einen Fehlschlag zu
    // melden oder erneut Modellaufrufe zu verbrennen. Der Gegenstand dieser
    // Station ist der RUECKSCHLUSS, nicht das Erzeugen.
    const started = Date.now();
    const generate = page.getByRole('button', { name: /generate ai fix/i });
    if (await generate.isVisible().catch(() => false)) {
      const genLabel = ((await generate.innerText()) || '').replace(/\s+/g, ' ').trim();
      line(`  Knopf: „${genLabel}"`);
      line(`\n  ⚠ Ab hier laufen echte Modellaufrufe.`);
      const [genRes] = await Promise.all([
        page
          .waitForResponse((r) => /remediation/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', {
            timeout: 420_000,
          })
          .catch(() => null),
        generate.click(),
      ]);
      if (!genRes) {
        throw new Error(
          'Der Klick auf „Generate AI Fix" hat KEINEN Serveraufruf ausgeloest.\n' +
            '  Der Knopf ist da und zaehlt richtig — aber er tut nichts. Das ist ein\n' +
            '  eigener Befund, kein Zeitproblem.',
        );
      }
      line(`  Generate: ${genRes.status()} nach ${Math.round((Date.now() - started) / 1000)} s`);
    } else {
      line(`  (Ein Vorschlag liegt bereits vor — kein neuer Modellaufruf.)`);
    }

    // ── 3b. Der Vorschlag muss AUFGEKLAPPT werden ───────────────────────
    //
    // `ProposalCard` startet zugeklappt (useState(false)); Apply liegt im
    // eingeklappten Teil. Der erste Lauf wartete 5 Minuten auf einen Knopf,
    // den es sichtbar nie gab — waehrend die Karte daneben „Validated · 83%
    // confidence · 3 elements, 3 connections" zeigte. Eine Zusicherung, die
    // eine unsichtbare Schaltflaeche sucht, misst die Anzeige statt der
    // Wirkung.
    //
    // Der Anker ist bewusst die Zeile „N elements, M connections": sie kommt
    // aus dem Code (ProposalCard:117), waehrend der Titel daneben vom Modell
    // stammt und von Lauf zu Lauf anders lautet.
    const cardHead = page
      .getByRole('button')
      .filter({ hasText: /\d+ elements?, \d+ connections?/i })
      .first();
    await expect(
      cardHead,
      'Der Vorschlag lieferte nichts Anwendbares — die Server-Antworten oben sagen, warum',
    ).toBeVisible({ timeout: 300_000 });
    line(`  Vorschlag nach ${Math.round((Date.now() - started) / 1000)} s: ` +
      `„${((await cardHead.innerText()) || '').replace(/\s+/g, ' ').trim().slice(0, 90)}"`);

    await cardHead.click();

    const apply = page.getByRole('button', { name: /^apply\b/i }).first();
    await expect(apply, 'Die aufgeklappte Karte trägt keinen Apply-Knopf').toBeVisible({
      timeout: 20_000,
    });
    line(`  Apply: „${((await apply.innerText()) || '').replace(/\s+/g, ' ').trim()}"`);

    // Auf die SERVER-Antwort warten, nicht auf eine Zeitspanne: Apply schreibt
    // Elemente in Neo4j UND zieht den Rueckschluss nach (linkAppliedElements).
    const [applyRes] = await Promise.all([
      page
        .waitForResponse(
          (r) => /remediation\/.*\/apply/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
          { timeout: 120_000 },
        )
        .catch(() => null),
      apply.click(),
    ]);
    if (!applyRes) {
      throw new Error('Der Klick auf Apply hat KEINEN Serveraufruf ausgeloest.');
    }
    line(`  Angewendet: ${applyRes.status()} ${(await applyRes.text().catch(() => '')).slice(0, 220)}`);
    await page.waitForTimeout(5_000);

    // ── 3. DER KERN: trägt die Anforderung jetzt ein Element? ────────────
    const after = await gapCount();
    line(`\n════ Wirkung ════`);
    line(`  Lücken vorher: ${before}   ·   nachher: ${after}`);

    if (failures.length > 0) {
      line(`\n  ⚠ Server-Fehler:`);
      for (const f of failures) line(`    ${f}`);
    }

    // AC-4: Die Zahl muss SINKEN. Bleibt sie gleich, ist zwar vielleicht ein
    // Element entstanden — aber der Rueckschluss (THE-568) hat nicht gegriffen,
    // und genau der ist der Gegenstand dieser Station.
    expect(
      after,
      `Die Lücken-Zahl ist nicht gesunken (${before} → ${after}).\n` +
        '  Ein Element mag entstanden sein, aber es haengt nicht an der ausloesenden\n' +
        '  Anforderung — der Rueckschluss aus THE-568 greift am Klick nicht.',
    ).toBeLessThan(before);

    line(`  ⇒ ${before - after} Lücke(n) geschlossen — die Anforderung trägt ein Element.\n`);
    expect(failures, `Server-Fehler:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
