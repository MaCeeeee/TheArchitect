/**
 * Local corpus seed (Dev only) — legt ein paar echte Gesetzes-Paragraphen in die
 * lokale `regulations-corpus`-DB, damit man den Norm-Browse (THE-390 P4b,
 * „Available in corpus") lokal ohne Server-B-Zugang sehen kann.
 *
 * Voraussetzung: CORPUS_MONGODB_URI zeigt auf eine (lokale) Mongo, z. B.
 *   mongodb://<user>:<pw>@localhost:27017/regulations-corpus?authSource=admin
 *
 * Run:  cd packages/server && npx ts-node src/scripts/seed-local-corpus.ts
 * Idempotent (upsert über {regulationKey, version}).
 */
import dotenv from 'dotenv';
dotenv.config();

import { upsertCorpusRegulation, isCorpusConfigured, getCorpusConnection } from '../services/corpusClient.service';
import { computeVersionHash } from '../utils/regulationVersion';

interface SeedPara {
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  jurisdiction: string;
  language: 'de' | 'en';
  sourceUrl: string;
}

const SEED: SeedPara[] = [
  {
    source: 'dsgvo', paragraphNumber: 'Art. 5', jurisdiction: 'EU', language: 'de',
    title: 'Grundsätze für die Verarbeitung personenbezogener Daten',
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    fullText: 'Personenbezogene Daten müssen auf rechtmäßige Weise, nach Treu und Glauben und in einer für die betroffene Person nachvollziehbaren Weise verarbeitet werden. Sie müssen für festgelegte, eindeutige und legitime Zwecke erhoben werden und dürfen nicht in einer mit diesen Zwecken nicht zu vereinbarenden Weise weiterverarbeitet werden. Der Verantwortliche ist für die Einhaltung dieser Grundsätze verantwortlich und muss deren Einhaltung nachweisen können (Rechenschaftspflicht).',
  },
  {
    source: 'dsgvo', paragraphNumber: 'Art. 30', jurisdiction: 'EU', language: 'de',
    title: 'Verzeichnis von Verarbeitungstätigkeiten',
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    fullText: 'Jeder Verantwortliche führt ein Verzeichnis aller Verarbeitungstätigkeiten, die seiner Zuständigkeit unterliegen. Dieses Verzeichnis enthält den Namen und die Kontaktdaten des Verantwortlichen, die Zwecke der Verarbeitung, eine Beschreibung der Kategorien betroffener Personen und personenbezogener Daten, die Kategorien von Empfängern, gegebenenfalls Übermittlungen an Drittländer, die vorgesehenen Löschfristen sowie eine allgemeine Beschreibung der technischen und organisatorischen Maßnahmen.',
  },
  {
    source: 'dsgvo', paragraphNumber: 'Art. 32', jurisdiction: 'EU', language: 'de',
    title: 'Sicherheit der Verarbeitung',
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    fullText: 'Der Verantwortliche und der Auftragsverarbeiter treffen geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten; dazu gehören unter anderem die Pseudonymisierung und Verschlüsselung personenbezogener Daten, die Fähigkeit, die Vertraulichkeit, Integrität, Verfügbarkeit und Belastbarkeit der Systeme sicherzustellen, sowie ein Verfahren zur regelmäßigen Überprüfung der Wirksamkeit der Maßnahmen.',
  },
  {
    source: 'nis2', paragraphNumber: 'Art. 21', jurisdiction: 'EU', language: 'de',
    title: 'Risikomanagementmaßnahmen im Bereich der Cybersicherheit',
    sourceUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
    fullText: 'Die wesentlichen und wichtigen Einrichtungen ergreifen geeignete und verhältnismäßige technische, operative und organisatorische Maßnahmen, um die Risiken für die Sicherheit der Netz- und Informationssysteme zu beherrschen. Diese Maßnahmen umfassen unter anderem Konzepte für die Risikoanalyse und die Sicherheit von Informationssystemen, die Bewältigung von Sicherheitsvorfällen, die Aufrechterhaltung des Betriebs, die Sicherheit der Lieferkette sowie den Einsatz von Kryptografie und Verschlüsselung.',
  },
  {
    source: 'nis2', paragraphNumber: 'Art. 23', jurisdiction: 'EU', language: 'de',
    title: 'Berichterstattungspflichten bei Sicherheitsvorfällen',
    sourceUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
    fullText: 'Die betroffenen Einrichtungen übermitteln der zuständigen Behörde oder dem CSIRT unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnisnahme eines erheblichen Sicherheitsvorfalls, eine frühe Warnung, gefolgt von einer Meldung des Vorfalls innerhalb von 72 Stunden und einem Abschlussbericht spätestens einen Monat nach Übermittlung der Meldung.',
  },
];

async function main() {
  if (!isCorpusConfigured()) {
    // eslint-disable-next-line no-console
    console.error('CORPUS_MONGODB_URI nicht gesetzt — bitte in .env eintragen (siehe Skript-Kopf).');
    process.exit(1);
  }
  // Da die Korpus-Verbindung bufferCommands=false hat (fail-fast im Server), müssen
  // wir im kurzlebigen Skript explizit auf „connected" warten, bevor wir schreiben.
  await getCorpusConnection().asPromise();
  let inserted = 0;
  for (const p of SEED) {
    const regulationKey = `${p.source}:${p.paragraphNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const res = await upsertCorpusRegulation({
      regulationKey,
      versionHash: computeVersionHash(p.fullText),
      source: p.source,
      jurisdiction: p.jurisdiction,
      paragraphNumber: p.paragraphNumber,
      title: p.title,
      fullText: p.fullText,
      sourceUrl: p.sourceUrl,
      effectiveFrom: new Date('2018-05-25'),
      language: p.language,
      version: 1,
      crawledAt: new Date(),
    } as Parameters<typeof upsertCorpusRegulation>[0]);
    if (res.inserted) inserted += 1;
    // eslint-disable-next-line no-console
    console.log(`  ${res.inserted ? '+' : '='} ${regulationKey}  (${p.title})`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nSeed done — ${SEED.length} paragraphs (${inserted} new). Sources: dsgvo, nis2.`);
  await getCorpusConnection().close();
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
