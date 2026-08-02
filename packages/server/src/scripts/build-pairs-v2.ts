/**
 * build-pairs-v2 — baut den Prüfsatz auf VIER Achsen neu
 * (THE-382, Reparatur nach der Adjudikations-Absage 2026-08-02).
 *
 *   npm run pairs:build -- [--source src/evals/golden/actions.v1.json]
 *                          [--out src/evals/golden/actions.v2.draft.json]
 *                          [--records /tmp/pairs-v2-records.json]
 *                          [--provider anthropic] [--model <id>]
 *
 * ── WAS ES TUT ──
 *
 * 1. Liest die EINDEUTIGEN Pflichten aus dem eingefrorenen `actions.v1`
 *    (der bleibt unangetastet — die alten Messungen müssen reproduzierbar sein).
 * 2. Zerlegt jede in Slots → freier `empfaenger`, `modalitaet`.
 * 3. Leitet aus den freien Empfängern ein VOKABULAR ab (bottom-up, keine
 *    Vorgabeliste — dieselbe Methode wie beim Handlungs-Katalog) und ordnet
 *    jeden Empfänger einer Klasse zu.
 * 4. Klassifiziert die Handlung gegen den Katalog der Ontologie.
 * 5. Holt den VERPFLICHTETEN aus der Korpus-Typisierung (`partyRole`) — nicht
 *    aus der Zerlegung, dort liefert das Modell den Empfänger (THE-540).
 * 6. Paart nur bei Übereinstimmung in allen vier Achsen (`pairSelection`).
 *
 * ── DIE GRENZE, DIE IM ERGEBNIS STEHEN MUSS ──
 *
 * Die Grundgesamtheit sind die 120 Pflichten, die in `actions.v1` vorkommen —
 * also eine Vorauswahl der ALTEN, fehlerhaften Paarung. Diese Reparatur kann
 * dadurch nur WENIGER Paare finden, niemals neue. Für „ist das Instrument
 * benutzbar?" reicht das; für „wie groß ist das Potenzial?" braucht es die
 * vollen 219 Pflichten aus REQGEN.
 *
 * Linear: THE-382 · Vorgeschichte: THE-438, THE-538, THE-540
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SLOT_SYSTEM,
  buildSlotUserPrompt,
  parseSlots,
  CLASSIFY_SYSTEM,
  buildClassifyUserPrompt,
  parseActionAssignment,
  RECIPIENT_DERIVE_SYSTEM,
  buildDeriveUserPrompt,
  parseRecipientClasses,
  buildRecipientClassifySystem,
  buildRecipientClassifyUserPrompt,
  parseRecipientAssignment,
  buildRegulationKey,
  NORM_ONTOLOGY,
  SLOT_UNSTATED,
  type RecipientClass,
} from '@thearchitect/shared';
import { loadActionGolden, DEFAULT_ACTION_GOLDEN_PATH } from '../evals/actionGolden';
import { buildStrictPairs, toGoldenSet, type SlottedObligation } from '../evals/pairSelection';
import { resolveTypedAddressees } from '../services/typedProvision.service';
import { createRaterClient, resolveRaterConfig, withEmptyResponseRetry, type RaterClient } from '../evals/raterClient';

const arg = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

/**
 * Baut den Korpus-Schlüssel aus Gesetzes-Etikett und Fundstelle.
 *
 * Nur hier ist das Etikett erlaubt: der Schlüssel ist ein Join-Anker und wird
 * NIE in einen Prompt gerendert. Schlägt der Bau fehl, bleibt der Join für
 * diese Pflicht aus — sichtbar als fehlender Wert, nicht als geratener.
 */
export function keyFor(law: string, para: string): string | null {
  try {
    return buildRegulationKey(law.toLowerCase(), para);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const set = loadActionGolden(path.resolve(arg(argv, '--source') || DEFAULT_ACTION_GOLDEN_PATH));

  // Eindeutige Pflichten: in actions.v1 kommt dieselbe Formulierung bis zu
  // sechsmal vor — zerlegt werden muss sie einmal.
  const uniq = new Map<string, { law: string; para: string; title: string; text: string }>();
  for (const c of set.cases) for (const s of ['a', 'b'] as const) {
    const o = c[s];
    uniq.set(`${o.law}|${o.para}|${o.title}`, o);
  }
  const obligations = [...uniq.values()];
  console.log(`[pairs:build] ${obligations.length} eindeutige Pflichten aus ${set.version}`);

  const client: RaterClient = withEmptyResponseRetry(
    createRaterClient(resolveRaterConfig(argv)),
  );
  const ask = async (system: string, user: string, maxTokens = 400): Promise<string> =>
    (await client.complete({ system, user, maxTokens })).text;

  // ── 1. Zerlegen ────────────────────────────────────────────────────────
  const slotted: { o: (typeof obligations)[number]; recipient: string; modality: string }[] = [];
  const slotFailed: string[] = [];
  for (const [i, o] of obligations.entries()) {
    const s = parseSlots(await ask(SLOT_SYSTEM, buildSlotUserPrompt(o)));
    if (s) slotted.push({ o, recipient: s.empfaenger, modality: s.modalitaet });
    else slotFailed.push(`${o.law} ${o.para}: ${o.title}`);
    process.stdout.write(`\r[pairs:build] Zerlegung ${i + 1}/${obligations.length}`);
  }
  console.log(`\n[pairs:build] zerlegt: ${slotted.length}, unlesbar: ${slotFailed.length}`);

  // ── 2. Empfänger-Vokabular ableiten ────────────────────────────────────
  const freeRecipients = [...new Set(slotted.map((s) => s.recipient).filter((r) => r && r !== SLOT_UNSTATED))];
  const derived = parseRecipientClasses(
    await ask(RECIPIENT_DERIVE_SYSTEM, buildDeriveUserPrompt(freeRecipients), 4000),
  );
  if (!derived) {
    console.error('[pairs:build] FEHLER: Empfänger-Vokabular unlesbar — Abbruch statt Rateklassen.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `[pairs:build] ${derived.classes.length} Empfängerklassen aus ${freeRecipients.length} freien Formulierungen` +
      (derived.unbundled.length ? ` · nicht bündelbar: ${derived.unbundled.length}` : ''),
  );
  for (const c of derived.classes) console.log(`  · ${c.id} — ${c.label}`);

  // ── 3. Empfänger und Handlung zuordnen ─────────────────────────────────
  const classIds = derived.classes.map((c: RecipientClass) => c.id);
  const recipientSystem = buildRecipientClassifySystem(derived.classes);
  const recipientClassOf = new Map<string, string | null>();
  for (const [i, r] of freeRecipients.entries()) {
    const a = parseRecipientAssignment(await ask(recipientSystem, buildRecipientClassifyUserPrompt(r)), classIds);
    recipientClassOf.set(r, a ? a.classId : null);
    process.stdout.write(`\r[pairs:build] Empfänger ${i + 1}/${freeRecipients.length}`);
  }

  const records: SlottedObligation[] = [];
  for (const [i, s] of slotted.entries()) {
    const act = parseActionAssignment(await ask(CLASSIFY_SYSTEM, buildClassifyUserPrompt(s.o)));
    records.push({
      ...s.o,
      actionId: act ? act.actionId : null,
      partyRole: null, // wird gleich aus dem Korpus gefüllt
      recipientClass: recipientClassOf.get(s.recipient) ?? null,
      modality: s.modality,
    });
    process.stdout.write(`\r[pairs:build] Handlung ${i + 1}/${slotted.length}`);
  }

  // ── 4. Verpflichteten aus dem Korpus holen ─────────────────────────────
  const keys = records.map((r) => keyFor(r.law, r.para)).filter((k): k is string => Boolean(k));
  const typed = await resolveTypedAddressees(keys, async (ks) => {
    const { getRegulationsByKeys } = await import('../services/corpusClient.service');
    return (await getRegulationsByKeys(ks)) as never;
  });
  for (const r of records) {
    const k = keyFor(r.law, r.para);
    r.partyRole = k ? typed.get(k) ?? null : null;
  }
  const withParty = records.filter((r) => r.partyRole).length;
  console.log(`\n[pairs:build] Verpflichteter aus der Typisierung: ${withParty}/${records.length}`);
  if (withParty === 0) {
    console.error(
      '[pairs:build] FEHLER: kein einziger Verpflichteter aufgelöst. Entweder ist der Korpus nicht erreichbar ' +
        'oder die Schlüssel passen nicht (erwartet: "<gesetz>:<paragraph>"). Ohne diese Achse ist die ' +
        'Reparatur wirkungslos — Abbruch statt stiller Paarung auf drei Achsen.',
    );
    process.exitCode = 1;
    return;
  }

  // ── 5. Paaren ──────────────────────────────────────────────────────────
  const result = buildStrictPairs(records, { maxUsesPerObligation: 2, maxPerArm: 60 });
  const out = toGoldenSet(result, 'actions.v2.draft', NORM_ONTOLOGY.ontologyVersion);

  const recordsPath = arg(argv, '--records');
  if (recordsPath) {
    fs.writeFileSync(
      path.resolve(recordsPath),
      `${JSON.stringify({ classes: derived.classes, unbundled: derived.unbundled, records }, null, 2)}\n`,
    );
  }
  const outPath = path.resolve(arg(argv, '--out') || 'src/evals/golden/actions.v2.draft.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  console.log(
    [
      '',
      `[pairs:build] Arm T: ${result.T.length} · Arm K: ${result.K.length} → ${outPath}`,
      `[pairs:build] nicht paarungsfähig (Achse fehlt): ${result.statsT.incomplete}`,
      `[pairs:build] Gruppen mit ≥2 Gesetzen: ${result.statsT.groupsWithPair} · Kandidaten: ${result.statsT.candidates}`,
      '',
      result.T.length < 10
        ? '[pairs:build] HINWEIS: wenige Paare. Das ist ein BEFUND, kein Fehler — die unabhängige ' +
          'Katalog-Rechnung kam auf 5-6 echte Kandidaten. Vor dem Adjudizieren interpretieren.'
        : '[pairs:build] Nächster Schritt: npm run pairs:worksheet -- 40 /tmp/pair-label.html src/evals/golden/actions.v2.draft.json',
    ].join('\n'),
  );
}

if (require.main === module) {
  void main();
}
