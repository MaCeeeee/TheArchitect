/**
 * lawsFixture — der eingefrorene Rechtstext des senkrechten Schnitts
 * (THE-545, Task 1). Muster: actionGolden.ts.
 *
 * ── WAS HIER DRIN IST UND WARUM ──
 *
 * Neun Artikel aus DSGVO, NIS2 und DORA — deutscher Wortlaut, aus dem
 * kanonischen Korpus exportiert (`npm run reqtrace:export-laws`), danach
 * eingefroren. Sie tragen die drei Kontrollen aus THE-545:
 *
 *   positiv           DSGVO 24/32 · NIS2 21 · DORA 5/6/9 → die 5 SCF-Kandidaten
 *   negativ mechanisch NIS2 23 × DORA 19 → lex specialis, darf nie zusammenlaufen
 *   negativ semantisch NIS2 21 × DSGVO 33 → gleicher Adressat, andere Handlung
 *
 * ── DIE ZWEI EIGENSCHAFTEN, DIE DAS FIXTURE TRAGEN MUSS ──
 *
 * 1. **Rohtext.** THE-545 führt die Prämisse „REQGENs Ausgabe lässt sich
 *    weiterverwenden" als widerlegt: der Generator-Prompt verlangt ausdrücklich
 *    das WIE und verschmilzt damit Stakeholder-Anforderung, Systemanforderung
 *    und Architektur-Zuordnung. Käme diese Ausgabe hier durch die Hintertür
 *    zurück, misst der ganze Schnitt sich selbst.
 * 2. **Adressatenklasse mit Fundstelle.** Sie ersetzt den Typisierungs-Join von
 *    Hand — belegt am Artikeltext, nicht geraten. Ohne sie kann die mechanische
 *    Negativ-Kontrolle nicht greifen (ADR-0007 E6).
 *
 * Linear: THE-545 · Rahmen: ADR-0007
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isPartyRole } from '@thearchitect/shared';

export const ReqtraceArticleSchema = z.object({
  /** Rechtsakt-Kürzel, wie im Korpus-Schlüssel: `dsgvo` · `nis2` · `dora`. */
  source: z.enum(['dsgvo', 'nis2', 'dora']),
  /** Artikel-Kennung ohne Trennzeichen: `art32`. */
  article: z.string().regex(/^art\d+[a-z]?$/),
  /** CELEX des Rechtsakts — die Fundstelle, unter der er zitierbar ist. */
  celex: z.string().regex(/^3\d{4}[RL]\d{4}$/),
  language: z.literal('de'),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Korpus-Schlüssel und Textstand — der Rückverweis auf die kanonische Quelle. */
  regulationKey: z.string().min(1),
  versionHash: z.string(),
  paragraphNumber: z.string(),
  title: z.string().min(1),
  fullText: z.string().min(1),
  /**
   * Der VERPFLICHTETE als Ontologie-Rolle. Geprüft gegen die Ontologie, nicht
   * als Freitext: eine erfundene Klasse würde die Verdrängungs-Kante stumm
   * verfehlen und wie ein sauberes „keine Verdrängung" aussehen.
   */
  addresseeClass: z.string().refine(isPartyRole, {
    message: 'addresseeClass muss eine partyRole der Ontologie sein',
  }),
  /** Die Textstelle, aus der die Klasse abgelesen wurde. */
  addresseeCitation: z.string().min(11),
  /** Rolle im Versuchsaufbau — dokumentarisch, nicht auswertungsrelevant. */
  role: z.string().min(1),
});

export const ReqtraceLawsSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  /** Herkunft der Texte — `corpus` ist der kanonische Fall. */
  source: z.string().min(1),
  articles: z.array(ReqtraceArticleSchema).min(1),
});

export type ReqtraceArticle = z.infer<typeof ReqtraceArticleSchema>;
export type ReqtraceLaws = z.infer<typeof ReqtraceLawsSchema>;

export const DEFAULT_REQTRACE_LAWS_PATH = path.join(__dirname, '..', 'golden', 'reqtrace', 'laws.v1.json');

/** `<source>:<article>` — der Schlüssel, unter dem der Schnitt die Artikel adressiert. */
export function articleKey(a: Pick<ReqtraceArticle, 'source' | 'article'>): string {
  return `${a.source}:${a.article}`;
}

export function findDuplicateArticleKeys(articles: ReqtraceArticle[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const a of articles) (seen.has(articleKey(a)) ? dup : seen).add(articleKey(a));
  return [...dup];
}

/**
 * Lädt das Fixture. Wirft bei Dubletten — zwei Datensätze zu einem Artikel
 * hießen, dass der Schnitt denselben Text zweimal misst und die Quoten
 * verschiebt, ohne dass es jemandem auffällt.
 */
export function loadReqtraceLaws(filePath: string = DEFAULT_REQTRACE_LAWS_PATH): ReqtraceLaws {
  const set = ReqtraceLawsSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  const dup = findDuplicateArticleKeys(set.articles);
  if (dup.length) throw new Error(`reqtraceLaws: doppelte Artikel: ${dup.join(', ')}`);
  return set;
}
