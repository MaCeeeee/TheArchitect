import { test, expect } from '@playwright/test';
import { login, readCredentials } from './support/login';

/**
 * JEDER GESPEICHERTE ANKER IST KANONISCH (THE-645/648).
 *
 * ── WAS DIESER LAUF PRÜFT ──
 *
 * `regulation-key.ts` erklärt die Invariante für verbindlich: derselbe
 * Paragraph muss auf beiden Seiten byte-gleich heissen. Der Bauteil-Test
 * (`normSectionAnchor`) pinnt, dass die FACADE sie einhält. Dieser Lauf prüft
 * die andere Hälfte: dass auch der BESTAND sie einhält.
 *
 * Beides ist nötig. Am 10.08. war die Facade gebrochen und der Bestand heil —
 * genau deshalb blieb es unsichtbar, bis der Rückschluss ins Leere griff.
 *
 * „Roh" heisst mechanisch: `sectionEId !== normalisiert(sectionEId)`. Die
 * Normalisierung ist idempotent — ein kanonischer Schlüssel bleibt gleich, ein
 * roher ändert sich.
 *
 * Read-only, kein Modellaufruf, über alle Projekte des Kontos. EHRLICHE
 * GRENZE: er sieht nur, was dieses Konto sieht — er beweist keine globale
 * Abwesenheit, sondern prüft den erreichbaren Bestand.
 */

/** Spiegel von `normaliseParagraph` (shared/utils/regulation-key.ts:12). */
const normalise = (p: string) =>
  p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Kanonische Form eines ganzen Schlüssels `source:paragraph`. */
function canonical(key: string): string {
  const i = key.indexOf(':');
  if (i === -1) return normalise(key);
  return `${key.slice(0, i)}:${normalise(key.slice(i + 1))}`;
}

test('jeder gespeicherte Sektions-Anker ist kanonisch', async ({ page }) => {
  await login(page, readCredentials());
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('thearchitect-auth');
    return raw ? (JSON.parse(raw)?.state?.token ?? '') : '';
  });
  const auth = { Authorization: `Bearer ${token}` };

  // `GET /api/projects` antwortet mit einem NACKTEN Array (project.routes.ts:33),
  // nicht mit {success,data} wie die meisten Routen. Ein stiller Fehlgriff hier
  // hätte „0 roh" gemeldet — also die Form prüfen, nicht raten.
  const projRes = await (await page.request.get('/api/projects', { headers: auth })).json();
  const projects: Array<{ _id?: string; id?: string; name?: string }> = Array.isArray(projRes)
    ? projRes
    : (projRes?.data?.projects ?? projRes?.data ?? []);
  console.log(`\n  Projekte: ${projects.length}`);
  expect(projects.length, 'Keine Projekte gelesen — die Antwortform stimmt nicht').toBeGreaterThan(0);

  let total = 0;
  let raw = 0;
  const rawKeys = new Map<string, number>();
  const perProject: string[] = [];

  for (const p of projects) {
    const pid = p._id ?? p.id;
    if (!pid) continue;
    const r = await page.request
      .get(`/api/projects/${pid}/requirements?limit=250`, { headers: auth })
      .then((x) => x.json())
      .catch(() => null);
    const items: Array<{ sectionEId?: string }> = r?.data?.items ?? [];
    if (items.length === 0) continue;

    let rawHere = 0;
    for (const it of items) {
      if (!it.sectionEId) continue;
      total += 1;
      if (it.sectionEId !== canonical(it.sectionEId)) {
        raw += 1;
        rawHere += 1;
        rawKeys.set(it.sectionEId, (rawKeys.get(it.sectionEId) ?? 0) + 1);
      }
    }
    perProject.push(`    ${items.length.toString().padStart(4)} Anforderungen · ${rawHere} roh   „${(p.name ?? pid).slice(0, 44)}"`);
  }

  console.log(perProject.join('\n'));
  console.log(`\n  ══ ERGEBNIS ══`);
  console.log(`  Anforderungen mit Anker: ${total}`);
  console.log(`  davon ROH:               ${raw}`);
  if (rawKeys.size > 0) {
    console.log(`\n  Rohe Schlüssel:`);
    for (const [k, n] of [...rawKeys].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${n}×  ${JSON.stringify(k)}  →  kanonisch ${JSON.stringify(canonical(k))}`);
    }
  }
  // Eine leere Messung ist KEIN Bestehen. Findet der Lauf gar keine Anker,
  // stimmt die Abfrage nicht — und „0 roh" wäre eine Falschaussage. Genau das
  // ist beim ersten Versuch passiert: `GET /api/projects` antwortet mit einem
  // nackten Array, der Lauf las 0 Projekte und meldete triumphierend 0 rohe.
  expect(total, 'Kein einziger Anker gelesen — die Abfrage stimmt nicht').toBeGreaterThan(0);

  expect(
    raw,
    `${raw} von ${total} gespeicherten Ankern sind NICHT kanonisch.\n` +
      '  Der Rückschluss (THE-568) findet diese Anforderungen nicht: er sucht den\n' +
      '  kanonischen Schlüssel, sie tragen den rohen. Sichtbar wird das nirgends —\n' +
      '  der Vorschlag entsteht, das Element auch, die Lücke bleibt offen.\n' +
      '  Rohe Schlüssel siehe Ausgabe oben.',
  ).toBe(0);

  console.log(`\n  ⇒ Alle ${total} Anker sind kanonisch.\n`);
});
