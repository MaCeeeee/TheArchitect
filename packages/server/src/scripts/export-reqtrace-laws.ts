/**
 * export-reqtrace-laws — holt die neun Artikel des senkrechten Schnitts aus dem
 * kanonischen Korpus und schreibt sie als eingefrorenes Fixture (THE-545, Task 1).
 *
 *   npm run reqtrace:export-laws
 *
 * READ-ONLY auf dem Korpus. Schreibt genau eine Datei:
 * `src/evals/golden/reqtrace/laws.v1.json`.
 *
 * ── WARUM AUS DEM KORPUS UND NICHT AUS DEN GOLDEN SETS ──
 *
 * Acht der neun Artikel liegen verstreut in drei verschiedenen Golden-Set-
 * Ständen (`relations.v1.blind-for-rater-b`, `typing.gv2`, `typing.v1`), DORA
 * Art. 5 in keinem. Ein Prüfsatz aus drei Erhebungszeitpunkten misst drei
 * Textstände; der Korpus ist die kanonische Quelle mit `versionHash` — und das
 * ist zugleich das, was THE-545 wörtlich verlangt („es liest den Korpus").
 *
 * ── SPRACHE UND SCHLÜSSEL-VARIANTEN ──
 *
 * Der Korpus führt je Rechtsakt teils zwei Quellen (`dora:` und `dora-de:`).
 * Gesucht wird deshalb über beide, und je Artikel gewinnt der DEUTSCHE
 * Datensatz mit der höchsten Version. Findet sich kein deutscher, bricht das
 * Skript ab — ein englischer Artikeltext würde die Blendung und die
 * Slot-Zerlegung stillschweigend auf eine andere Sprache umstellen.
 *
 * Linear: THE-545 · Plan: docs/superpowers/plans/2026-08-02-the545-reqtrace-vertical-cut.md
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

/** Die neun Artikel + ihre Rolle im Schnitt. Adressatenklasse mit Fundstelle. */
const WANTED = [
  {
    law: 'dsgvo', article: 'art24', para: 'art-24', celex: '32016R0679',
    addresseeClass: 'controller',
    addresseeCitation: 'Art. 24 Abs. 1 Satz 1: „Der Verantwortliche setzt … geeignete technische und organisatorische Maßnahmen um."',
    role: 'positiv (GOV-02)',
  },
  {
    law: 'dsgvo', article: 'art32', para: 'art-32', celex: '32016R0679',
    addresseeClass: 'controller',
    addresseeCitation: 'Art. 32 Abs. 1: „treffen der Verantwortliche und der Auftragsverarbeiter geeignete technische und organisatorische Maßnahmen"',
    role: 'positiv (BCD-01, CRY-01, HRS-03, RSK-01)',
  },
  {
    law: 'dsgvo', article: 'art33', para: 'art-33', celex: '32016R0679',
    addresseeClass: 'controller',
    addresseeCitation: 'Art. 33 Abs. 1 Satz 1: „meldet der Verantwortliche … der Aufsichtsbehörde"',
    role: 'negativ semantisch (gegen NIS2 Art. 21)',
  },
  {
    law: 'nis2', article: 'art21', para: 'art-21', celex: '32022L2555',
    addresseeClass: 'essential_important_entity',
    addresseeCitation: 'Art. 21 Abs. 1 Unterabs. 1: „Die Mitgliedstaaten stellen sicher, dass wesentliche und wichtige Einrichtungen …"',
    role: 'positiv (BCD-01, CRY-01, GOV-02, RSK-01)',
  },
  {
    law: 'nis2', article: 'art23', para: 'art-23', celex: '32022L2555',
    addresseeClass: 'essential_important_entity',
    addresseeCitation: 'Art. 23 Abs. 1 Unterabs. 1: „dass wesentliche und wichtige Einrichtungen … jeden erheblichen Sicherheitsvorfall … melden"',
    role: 'negativ mechanisch (gegen DORA Art. 19)',
  },
  {
    law: 'dora', article: 'art5', para: 'art-5', celex: '32022R2554',
    addresseeClass: 'financial_entity',
    addresseeCitation: 'Art. 5 Abs. 1: „Finanzunternehmen verfügen über einen internen Governance- und Kontrollrahmen"',
    role: 'positiv (HRS-03)',
  },
  {
    law: 'dora', article: 'art6', para: 'art-6', celex: '32022R2554',
    addresseeClass: 'financial_entity',
    addresseeCitation: 'Art. 6 Abs. 1: „Finanzunternehmen verfügen über einen soliden, umfassenden und gut dokumentierten IKT-Risikomanagementrahmen"',
    role: 'positiv (GOV-02, RSK-01)',
  },
  {
    law: 'dora', article: 'art9', para: 'art-9', celex: '32022R2554',
    addresseeClass: 'financial_entity',
    addresseeCitation: 'Art. 9 Abs. 1: „Finanzunternehmen überwachen und steuern … kontinuierlich"',
    role: 'positiv (GOV-02)',
  },
  {
    law: 'dora', article: 'art19', para: 'art-19', celex: '32022R2554',
    addresseeClass: 'financial_entity',
    addresseeCitation: 'Art. 19 Abs. 1 Unterabs. 1: „Finanzunternehmen melden schwerwiegende IKT-bezogene Vorfälle … der … zuständigen Behörde"',
    role: 'negativ mechanisch (gegen NIS2 Art. 23)',
  },
] as const;

async function main(): Promise<void> {
  const { isCorpusConfigured, getCorpusConnection, CorpusRegulation } = await import(
    '../services/corpusClient.service'
  );

  if (!isCorpusConfigured()) {
    console.error('[export-laws] CORPUS_MONGODB_URI ist nicht gesetzt.');
    process.exitCode = 2;
    return;
  }
  await getCorpusConnection().asPromise();

  // Beide Quell-Varianten je Rechtsakt (`dora:` und `dora-de:`) einsammeln.
  const keys = WANTED.flatMap((w) => [`${w.law}:${w.para}`, `${w.law}-de:${w.para}`]);
  const docs = await CorpusRegulation()
    .find({ regulationKey: { $in: keys } })
    .select('regulationKey versionHash source paragraphNumber title fullText language version sourceUrl')
    .lean();
  console.log(`[export-laws] ${docs.length} Korpus-Datensätze zu ${keys.length} Schlüsselvarianten`);

  const articles: unknown[] = [];
  const missing: string[] = [];

  for (const w of WANTED) {
    const candidates = (docs as Record<string, unknown>[]).filter(
      (d) =>
        String(d.regulationKey).endsWith(`:${w.para}`) &&
        String(d.regulationKey).startsWith(w.law) &&
        String(d.language ?? '').toLowerCase().startsWith('de'),
    );
    if (candidates.length === 0) {
      missing.push(`${w.law} ${w.article}`);
      continue;
    }
    // Höchste Version gewinnt; bei Gleichstand der längere Text (vollständiger).
    candidates.sort(
      (a, b) =>
        Number(b.version ?? 0) - Number(a.version ?? 0) ||
        String(b.fullText ?? '').length - String(a.fullText ?? '').length,
    );
    const d = candidates[0];
    articles.push({
      source: w.law,
      article: w.article,
      celex: w.celex,
      language: 'de',
      retrievedAt: new Date().toISOString().slice(0, 10),
      regulationKey: String(d.regulationKey),
      versionHash: String(d.versionHash ?? ''),
      paragraphNumber: String(d.paragraphNumber ?? ''),
      title: String(d.title ?? ''),
      fullText: String(d.fullText ?? ''),
      addresseeClass: w.addresseeClass,
      addresseeCitation: w.addresseeCitation,
      role: w.role,
    });
    console.log(`  ✓ ${w.law} ${w.article} — ${String(d.fullText ?? '').length} Zeichen (${d.regulationKey})`);
  }

  if (missing.length) {
    // Abbruch statt Teil-Fixture: ein fehlender Artikel macht eine der drei
    // Kontrollen aus THE-545 unmessbar, und das darf nicht stillschweigend
    // passieren.
    console.error(`[export-laws] FEHLER: nicht im Korpus (deutsch): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const outPath = path.join(__dirname, '..', 'evals', 'golden', 'reqtrace', 'laws.v1.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ version: 'reqtrace.laws.v1', frozen: true, source: 'corpus', articles }, null, 2)}\n`,
  );
  console.log(`[export-laws] → ${outPath}`);
  process.exit(0);
}

if (require.main === module) {
  void main();
}
