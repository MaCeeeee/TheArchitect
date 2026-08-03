/**
 * Der schmale Schnitt (SCF-Gold über den Produktpfad).
 *
 * ── DIE EINE FRAGE ──
 *
 * Der Prüfstand setzt die Adressatenklasse als feste Annotation am Artikel
 * (`article.addresseeClass` in runReqtraceEval). Der PRODUKTPFAD leitet sie aus
 * dem extrahierten `verpflichteter` ab (`mapVerpflichteterToPartyRole` in
 * buildGroupables). Das ist der einzige inhaltliche Unterschied vor der
 * gemeinsamen Gruppierung.
 *
 * Landen beide auf derselben Rolle — für genau die Klauseln, aus denen die
 * vier Gold-Treffer stammen? Wenn ja, überlebt das Gold den Produktpfad.
 *
 * Statt 143 Klauseln werden nur die FÜNF gefahren, die die acht
 * gold-tragenden Anforderungen liefern. Kein Richter, keine Gruppierung —
 * damit auch keine Urteils-Varianz.
 *
 * READ-ONLY. Schreibt nichts in die Datenbank.
 */
import 'dotenv/config';
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';
import { segmentClauses, type Clause } from '../evals/reqtrace/clauseSegmenter';
import {
  STAKEHOLDER_REQ_SYSTEM,
  buildStakeholderReqUserPrompt,
  parseStakeholderCandidates,
  SYSTEM_REQ_SYSTEM,
  buildSystemReqUserPrompt,
  parseSystemReq,
  splitByAction,
} from '@thearchitect/shared';
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';
import { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } from '../evals/raterClient';

/** Die Klauseln, aus denen die acht gold-tragenden Systemanforderungen stammen. */
const GOLD_CLAUSES = [
  'dsgvo:art24:c01',
  'dsgvo:art32:c04',
  'dsgvo:art32:c06',
  'nis2:art21:c01',
  'dora:art19:c11',
];

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const laws = loadReqtraceLaws();
  const articles = laws.articles ?? (laws as unknown as { articles: [] }).articles;

  // ── Kostenloser Teil: welche Klauseln gibt es, und was behauptet die Fixture?
  const targets: Array<{ article: (typeof articles)[number]; clause: Clause }> = [];
  for (const a of articles) {
    for (const c of segmentClauses(a)) {
      if (GOLD_CLAUSES.includes(c.id)) targets.push({ article: a, clause: c });
    }
  }
  console.log(`Gold-Klauseln gefunden: ${targets.length} von ${GOLD_CLAUSES.length}`);
  for (const t of targets) {
    console.log(`  ${t.clause.id.padEnd(20)} Fixture sagt: ${t.article.addresseeClass}`);
    console.log(`      „${t.clause.text.replace(/\s+/g, ' ').slice(0, 96)}…"`);
  }
  const missing = GOLD_CLAUSES.filter((id) => !targets.some((t) => t.clause.id === id));
  if (missing.length) console.log(`  ⚠ NICHT gefunden: ${missing.join(', ')}`);
  if (dry) return;

  // ── Der bezahlte Teil: Extraktion + Transformation NUR für diese Klauseln.
  // Genau wie der Prüfstand (runReqtraceEval:485-487) — gleiches Modell,
  // gleicher Leer-Antwort-Retry, gleiches maxTokens.
  const cfg = resolveRaterConfig(process.argv.slice(2));
  const client = withEmptyResponseRetry(createRaterClient(cfg));
  const ask = async (system: string, user: string) =>
    (await client.complete({ system, user, maxTokens: 900 })).text;
  console.log(`\nModell: ${cfg.model}\n`);

  let calls = 0;
  const rows: Array<{ id: string; fixture: string; verpflichteter: string; mapped: string | null }> = [];
  for (const { article, clause } of targets) {
    calls += 1;
    const parsed = parseStakeholderCandidates(
      await ask(STAKEHOLDER_REQ_SYSTEM, buildStakeholderReqUserPrompt(clause)),
    );
    if (!parsed || parsed.length === 0) {
      console.log(`  ${clause.id}: keine Kandidaten — die Klausel trägt hier keine Anforderung`);
      continue;
    }
    for (const [ci, c] of parsed.entries()) {
      for (const [k, part] of splitByAction(c).entries()) {
        calls += 1;
        const sys = parseSystemReq(await ask(SYSTEM_REQ_SYSTEM, buildSystemReqUserPrompt(part)), [clause.id]);
        if (!sys) continue;
        rows.push({
          id: `${clause.id}:q${ci + 1}s${k + 1}`,
          fixture: article.addresseeClass,
          verpflichteter: sys.verpflichteter ?? '',
          mapped: mapVerpflichteterToPartyRole(sys.verpflichteter ?? ''),
        });
      }
    }
  }

  console.log(`\n── Prüfstand (Fixture) gegen Produktpfad (Lexikon) ──`);
  console.log(`${'ID'.padEnd(24)} ${'FIXTURE'.padEnd(28)} ${'LEXIKON'.padEnd(28)} verpflichteter`);
  let same = 0;
  let dropped = 0;
  for (const r of rows) {
    const ok = r.mapped === r.fixture;
    if (ok) same += 1;
    if (!r.mapped) dropped += 1;
    console.log(
      `${ok ? '✓' : '✗'} ${r.id.padEnd(22)} ${r.fixture.padEnd(28)} ${String(r.mapped ?? '— fällt raus').padEnd(28)} „${r.verpflichteter.slice(0, 40)}"`,
    );
  }
  console.log(`\nGleiche Rolle: ${same} von ${rows.length} · vom Lexikon verworfen: ${dropped}`);
  console.log(`LLM-Aufrufe: ${calls}`);
  console.log(
    dropped === 0 && same === rows.length
      ? '\n⇒ Der Produktpfad landet überall auf derselben Rolle. Das Gold überlebt ihn.'
      : '\n⇒ ABWEICHUNG — der Produktpfad käme hier auf eine andere Adressatenklasse.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
