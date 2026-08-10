import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';

/**
 * DIE MENSCHLICHEN TORE AM KLICK (THE-650, Slice 2d).
 *
 * ── WORUM ES GEHT ──
 *
 * Hier trennt sich, was die Maschine ableiten darf, von dem, wofuer ein Mensch
 * geradesteht. `covered` setzt das System aus `linkedElementIds` — `setBy:
 * "system"`. `enforced` und `attested` kann NUR ein Mensch setzen; die Route
 * holt `setBy` server-seitig aus der Session, damit ein Client es nicht
 * faelschen kann (requirements.routes.ts:975, Spoof-Schutz).
 *
 * Diese Trennung IST die Vertrauenskette. Haelt sie am Klick nicht, ist alles
 * davor Buchhaltung.
 *
 * ── DER WEG, UND WARUM ER DORT LANGGEHT ──
 *
 * Die Tore liegen NICHT in der Conformance-Navigation. Sie haengen am ELEMENT:
 *
 *   Sidebar → „Search elements…" → Element anklicken (LayerSection)
 *     → PropertyPanel → RequirementsForElementSection → RequirementGatesBadge
 *
 * Der Menuepunkt „Attestation" attestiert importierte Workflows — ein anderes
 * Subjekt (ComplianceSidebar.tsx:61). Siehe
 * `docs/strategy/2026-08-10-kette-vs-navigation.svg`.
 *
 * SCHREIBT IN PRODUKTION (ein Tor an einer Anforderung), kostet aber KEINEN
 * Modellaufruf. Braucht ein Projekt, dessen Anforderungen bereits ein Element
 * tragen — `E2E_PROJECT_ID`.
 */

const line = (s: string) => console.log(s);
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? '';

test.describe('Kette — die menschlichen Tore', () => {
  test.skip(!PROJECT_ID, 'E2E_PROJECT_ID fehlt');

  test('ein Mensch setzt `enforced` — und die Maschine hat es nicht getan', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', async (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) {
        const f = `${r.status()} ${new URL(r.url()).pathname} → ${(await r.text().catch(() => '')).slice(0, 200)}`;
        failures.push(f);
        line(`  ⚠ ${f}`);
      }
    });

    await login(page, readCredentials());

    // Wer sind wir? Der Vergleich am Ende braucht die eigene Kennung — ohne sie
    // liesse sich „ein Mensch war es" nicht von „irgendwer war es" trennen.
    const me = await page.evaluate(() => {
      const raw = localStorage.getItem('thearchitect-auth');
      const s = raw ? JSON.parse(raw)?.state : null;
      return { token: s?.token ?? '', userId: s?.user?.id ?? s?.user?._id ?? '' };
    });
    expect(me.token, 'Nach der Anmeldung liegt kein Token im Auth-Store').not.toBe('');
    const auth = { Authorization: `Bearer ${me.token}` };

    // ── 0. Eine Anforderung finden, die bereits gedeckt ist ─────────────
    //
    // Vorbedingung dieser Station: `covered` steht, gesetzt vom System. Ohne
    // sie waere der spaetere Vergleich „Mensch vs. Maschine" gegenstandslos.
    const reqs = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/requirements?limit=200`, { headers: auth })
    ).json();
    const items: Array<{
      _id: string; title: string; linkedElementIds?: string[];
      gates?: { covered?: { state: string; setBy: string } };
    }> = reqs?.data?.items ?? [];

    const target = items.find(
      (r) => r.gates?.covered?.state === 'yes' && (r.linkedElementIds ?? []).length > 0,
    );
    if (!target) {
      throw new Error(
        'Keine gedeckte Anforderung mit verlinktem Element gefunden.\n' +
          '  Diese Station setzt auf THE-636 auf — erst muss eine Maßnahme entstanden\n' +
          `  und zurückverlinkt sein. Gelesen: ${items.length} Anforderungen.`,
      );
    }
    const elementId = (target.linkedElementIds ?? [])[0];
    line(`\n  Anforderung: „${target.title.slice(0, 60)}"`);
    line(`  covered: ${target.gates?.covered?.state} (setBy ${target.gates?.covered?.setBy})`);
    line(`  haengt an Element: ${elementId}`);

    // Den Namen des Elements holen — die Sidebar-Suche geht ueber den NAMEN,
    // nicht ueber die Kennung. Ein Nutzer sucht auch so.
    const els = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/elements`, { headers: auth })
    ).json();
    const list: Array<{ id?: string; name?: string }> = els?.data ?? els ?? [];
    const elementName = list.find((e) => e.id === elementId)?.name ?? '';
    if (!elementName) {
      throw new Error(`Element ${elementId} hat keinen Namen — Suche über die Fläche unmöglich.`);
    }
    line(`  Element heißt: „${elementName}"`);

    // ── 1. Über die FLÄCHE zum Element ──────────────────────────────────
    await page.goto(`/project/${PROJECT_ID}`);
    await page.waitForTimeout(5_000);

    // ── DER GEFÜHRTE MODUS VERSTECKT DIE ELEMENT-LISTE ──
    //
    // Gemessen am 10.08.: Das Projekt steht in Phase 1 (Architecture Vision),
    // und dort gilt `PHASE_TABS[1] = ['envision', 'copilot']`
    // (phaseVisibility.ts:16) — der `explorer`-Reiter mit der Element-Liste
    // ist ausgeblendet. Das ist Absicht (progressive disclosure), hat aber
    // eine Folge, die niemand ausgesprochen hat: Die Tore einer Anforderung
    // sind in dieser Phase nur über einen Klick in die 3D-Welt erreichbar.
    //
    // Ein Nutzer, der mehr sehen will, schaltet den geführten Modus ab —
    // genau das tut der Lauf hier, statt die Phase zu manipulieren.
    const guided = page.getByRole('button', { name: /^(Guided Mode|All Features)$/ });
    await expect(guided, 'Kein Umschalter für den geführten Modus').toBeVisible({ timeout: 30_000 });
    if (((await guided.innerText()) || '').includes('Guided Mode')) {
      line(`\n  Geführter Modus ist an — die Element-Liste ist in Phase 1 verborgen.`);
      line(`  (PHASE_TABS[1] = ['envision','copilot'] — eigener Befund, siehe Ticket.)`);
      await guided.click();
      await page.waitForTimeout(1_500);
    }

    // Jetzt den Explorer-Reiter wählen — er trägt die Element-Liste.
    const explorerTab = page.getByRole('button', { name: /^Explorer$/i }).first();
    if (await explorerTab.isVisible().catch(() => false)) {
      await explorerTab.click();
      await page.waitForTimeout(1_500);
    }

    const search = page.getByPlaceholder('Search elements...');
    await expect(
      search,
      'Kein Suchfeld in der Sidebar — der einzige klickbare Weg zum Element fehlt.\n' +
        '  Auch nach „All Features" + Explorer-Reiter. Das ist der Befund (Kill-Kriterium):\n' +
        '  die Tore wären dann nur über einen Klick im 3D-Canvas erreichbar.',
    ).toBeVisible({ timeout: 30_000 });
    await search.fill(elementName);
    await page.waitForTimeout(1_500);

    // Der Treffer ist ein Button mit dem Element-Namen (Sidebar.tsx:1260).
    await page.getByRole('button', { name: elementName, exact: false }).first().click();
    await page.waitForTimeout(2_500);
    line(`\n  Element angeklickt.`);

    // ── 2. Im PropertyPanel den Reiter „Compliance" wählen ──────────────
    //
    // Das Panel öffnet auf „Overview" — dort stehen Name, Typ, Reifegrad und
    // 3D-Position. Die Anforderungen samt ihren Toren liegen einen Reiter
    // weiter (PropertyPanel.tsx:484). Die Beschriftung trägt bei vorhandenen
    // Mappings eine Zahl in Klammern, deshalb kein exakter Text-Vergleich.
    const panel = page.getByText('Data Encryption', { exact: false }).first();
    await expect(panel, 'Das Eigenschaften-Panel hat sich nicht geöffnet').toBeVisible({
      timeout: 20_000,
    });
    const complianceTab = page.getByRole('button', { name: /^Compliance( \(\d+\))?$/ }).first();
    await expect(
      complianceTab,
      'Kein „Compliance"-Reiter im Eigenschaften-Panel',
    ).toBeVisible({ timeout: 20_000 });
    await complianceTab.click();
    await page.waitForTimeout(2_500);
    line(`  Reiter „Compliance" geöffnet.`);

    // ── 3. Die Tore am Element ──────────────────────────────────────────
    //
    // `covered` ist bewusst ein <span>, kein Button — das Maschinen-Tor ist
    // NICHT klickbar (RequirementGatesBadge.tsx:63). Genau das wird geprueft.
    const enforce = page.getByRole('button', { name: /^enforced: .* — set$/ }).first();
    await expect(
      enforce,
      'Kein `enforced`-Tor am Element sichtbar.\n' +
        '  Der Weg Sidebar → Element → PropertyPanel → RequirementsForElementSection\n' +
        '  → RequirementGatesBadge trägt nicht. Das ist der Befund (Kill-Kriterium).',
    ).toBeVisible({ timeout: 30_000 });
    line(`  Tor gefunden: „${await enforce.getAttribute('aria-label')}"`);

    // AC-4 (erste Hälfte): das Maschinen-Tor darf keine Schaltfläche sein.
    const coveredAsButton = await page
      .getByRole('button', { name: /^covered:/ })
      .count();
    expect(
      coveredAsButton,
      'Das `covered`-Tor ist anklickbar — ein Mensch könnte das Maschinen-Urteil überschreiben',
    ).toBe(0);

    // ── 3. Das Tor setzen — mit Begründung ──────────────────────────────
    await enforce.click();
    const reason = page.getByPlaceholder(/Why\? \(enforced — required\)/i);
    await expect(reason, 'Kein Begründungsfeld — ein Tor ohne Grund wäre wertlos').toBeVisible();

    const REASON = `E2E ${new Date().toISOString().slice(0, 16)} — Nachweis der Mensch-Maschine-Trennung`;
    await reason.fill(REASON);

    const [gateRes] = await Promise.all([
      page.waitForResponse(
        (r) => /\/requirements\/.*\/gates$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'confirm yes' }).first().click(),
    ]);
    line(`  Gesetzt: ${gateRes.status()} ${(await gateRes.text().catch(() => '')).slice(0, 160)}`);
    expect(gateRes.status(), 'Das Setzen des Tors wurde abgelehnt').toBe(200);

    // ── 4. DER KERN: wer hat es gesetzt? ────────────────────────────────
    await page.waitForTimeout(2_000);
    const after = await (
      await page.request.get(`/api/projects/${PROJECT_ID}/requirements?limit=200`, { headers: auth })
    ).json();
    const fresh = (after?.data?.items ?? []).find(
      (r: { _id: string }) => String(r._id) === String(target._id),
    );
    const g = fresh?.gates;
    line(`\n════ Die Trennung ════`);
    line(`  covered : ${g?.covered?.state}  setBy ${g?.covered?.setBy}`);
    line(`  enforced: ${g?.enforced?.state}  setBy ${g?.enforced?.setBy}`);
    line(`  Grund   : „${g?.enforced?.reason ?? ''}"`);

    expect(g?.enforced?.state, 'Das Tor steht nicht auf `yes`').toBe('yes');
    expect(
      g?.enforced?.setBy,
      'Das menschliche Tor trägt `system` als Urheber — das wäre ein Vertrauensbruch,\n' +
        '  kein Schönheitsfehler: die Maschine hätte für einen Menschen gezeichnet.',
    ).not.toBe('system');
    if (me.userId) {
      expect(g?.enforced?.setBy, 'Das Tor trägt einen fremden Urheber').toBe(me.userId);
    }
    expect(g?.enforced?.reason, 'Die Begründung wurde nicht gespeichert').toBe(REASON);

    // AC-4 (zweite Hälfte): das Maschinen-Tor blieb unberührt.
    expect(g?.covered?.setBy, '`covered` hat seinen maschinellen Urheber verloren').toBe('system');
    expect(g?.covered?.state, '`covered` hat sich beim Setzen von `enforced` verändert').toBe('yes');

    // ── 5. NEGATIV-KONTROLLE: `attested` bleibt ohne Nachweis zu ────────
    //
    // THE-558: „ein Protokoll von 2023 belegt 2026 nichts mehr." Ohne diese
    // Kontrolle wuerde Schritt 3 nur zeigen, dass ein Schreibweg existiert —
    // nicht, dass die Tore unterschiedlich streng sind.
    const attest = await page.request.post(
      `/api/projects/${PROJECT_ID}/requirements/${target._id}/gates`,
      { headers: auth, data: { gate: 'attested', state: 'yes', reason: 'ohne Nachweis' } },
    );
    const attestBody = (await attest.text()).slice(0, 200);
    line(`\n  attested ohne Nachweis → ${attest.status()} ${attestBody}`);
    expect(
      attest.status(),
      'Das Attest ließ sich OHNE Nachweis setzen. Damit wäre die Nachweispflicht\n' +
        '  eine Formsache — das strengste Tor darf nicht das billigste sein.',
    ).toBe(400);

    line(`\n  ⇒ Der Mensch hat gezeichnet, die Maschine nicht — und das Attest bleibt zu.\n`);
    expect(failures.filter((f) => !f.startsWith('400')), `Server-Fehler:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
