/**
 * THE-669: Kandidatenliste aus dem Beobachtungskanal. READ-ONLY.
 *
 * ── WAS HIER PASSIERT ──
 *
 * Der tp-4-Batch (THE-668) hat jede Korpus-Bestimmung neu typisiert; wo keine
 * partyRole passte, konnte das Modell den Akteur im Klartext nennen
 * (`partyRoleObserved`). Dieses Skript zählt diese Beobachtungen zu einer
 * Kandidatenliste mit Belegdichte — die Zahl, die THE-515 nachträglich von
 * Hand am Korpus rekonstruieren musste, entsteht jetzt aus dem Lauf selbst.
 *
 * ── WAS ES BEWUSST NICHT TUT ──
 *
 * Es erweitert nichts und es urteilt nicht. Die Gruppierung ist MECHANISCH
 * (Normalisierung + exakte Gleichheit), kein LLM: Die Ableitung soll blind
 * gegenüber der Adjudikation aus THE-654 sein (AC-1), und ein zweites Modell,
 * das die Beobachtungen des ersten clustert, wäre eine zweite Meinungsschicht,
 * wo eine Zählung verlangt ist. Was die Zählung nicht zusammenlegt (Synonyme,
 * Übersetzungen), bleibt sichtbar getrennt — zusammenlegen ist dann eine
 * menschliche Entscheidung mit Beleg, keine stille Vorverarbeitung.
 *
 * Lauf (nach dem tp-4-Batch):
 *   packages/server$ node --env-file=../../.env -r ts-node/register/transpile-only \
 *     src/scripts/the669-observed-candidates.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PARTY_ROLE_IDS, NORM_ONTOLOGY, TYPING_PROMPT_VERSION } from '@thearchitect/shared';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

interface Doc {
  source: string;
  regulationKey: string;
  paragraphNumber?: string;
  title?: string;
  typing?: {
    partyRole?: string | null;
    partyRoleObserved?: string;
    promptVersion?: string;
    status?: string;
  };
}

/** Mechanische Normalisierung — Schreibvarianten, keine Bedeutung. */
function normalize(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Markiert Kandidaten, die vermutlich eine DUBLETTE einer bestehenden Rolle
 * sind (AC-5): Der Wert deckt sich mit einer E6-Id oder einem Wort aus deren
 * Label. Solche Treffer sind Klasse A der Adjudikation (Rolle existiert,
 * Extraktion hat sie verfehlt) — sie dürfen nicht als neue Klasse zählen.
 */
function knownRoleMatch(normalized: string): string | null {
  for (const id of PARTY_ROLE_IDS) {
    if (normalized === id || normalized === id.replace(/_/g, ' ')) return id;
  }
  for (const role of NORM_ONTOLOGY.partyRoles) {
    const labelWords = role.label
      .toLowerCase()
      .split(/[\/—–\-()]/)
      .map((w) => w.trim())
      .filter((w) => w.length > 3);
    if (labelWords.some((w) => normalized === w)) return role.id;
  }
  return null;
}

async function main(): Promise<void> {
  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt.');
  const conn = await getCorpusConnection().asPromise();
  const docs = (await conn
    .collection('regulations')
    .find(
      {},
      { projection: { source: 1, regulationKey: 1, paragraphNumber: 1, title: 1, typing: 1 } }
    )
    .toArray()) as unknown as Doc[];

  // Eigene Regel: eine leere Messung ist kein Bestehen.
  if (docs.length === 0) throw new Error('Korpus lieferte 0 Bestimmungen — Abfrage prüfen.');

  const tp4 = docs.filter((d) => d.typing?.promptVersion === TYPING_PROMPT_VERSION);
  if (tp4.length === 0) {
    throw new Error(
      `Kein Dokument trägt promptVersion=${TYPING_PROMPT_VERSION} — der Batch ist noch nicht gelaufen.`
    );
  }

  const ohneRolle = tp4.filter((d) => !d.typing?.partyRole);
  const beobachtet = ohneRolle.filter((d) => d.typing?.partyRoleObserved);

  // Kandidaten gruppieren — mechanisch, mit gespeicherten Zuordnungen (AC-6).
  interface Candidate {
    beleg: number;
    laws: Map<string, number>;
    raw: Set<string>;
    keys: string[];
    dubletteVon: string | null;
  }
  const candidates = new Map<string, Candidate>();
  for (const d of beobachtet) {
    const raw = d.typing!.partyRoleObserved!;
    const norm = normalize(raw);
    const fresh: Candidate = {
      beleg: 0,
      laws: new Map<string, number>(),
      raw: new Set<string>(),
      keys: [],
      dubletteVon: knownRoleMatch(norm),
    };
    const c = candidates.get(norm) ?? fresh;
    c.beleg += 1;
    const law = d.source.replace(/-(de|en)$/, '');
    c.laws.set(law, (c.laws.get(law) ?? 0) + 1);
    c.raw.add(raw);
    c.keys.push(d.regulationKey);
    candidates.set(norm, c);
  }

  const sorted = [...candidates.entries()].sort((a, b) => b[1].beleg - a[1].beleg);
  const neue = sorted.filter(([, c]) => !c.dubletteVon);
  const dubletten = sorted.filter(([, c]) => c.dubletteVon);
  const ueberSchwelle = neue.filter(([, c]) => c.beleg >= 5);

  const md = [
    '# THE-669 — Kandidatenliste aus dem Beobachtungskanal',
    '',
    `**Erzeugt am 2026-08-12** · Prompt-Stand \`${TYPING_PROMPT_VERSION}\` · Ontologie \`${NORM_ONTOLOGY.ontologyVersion}\``,
    '',
    '| | |',
    '|---|---|',
    `| Korpus-Bestimmungen | ${docs.length} |`,
    `| davon auf ${TYPING_PROMPT_VERSION} getypt | ${tp4.length} |`,
    `| davon ohne Adressatenklasse | ${ohneRolle.length} |`,
    `| davon mit Beobachtung | **${beobachtet.length}** |`,
    `| verschiedene Kandidaten | ${candidates.size} (${neue.length} neu · ${dubletten.length} mutmaßliche Dubletten) |`,
    `| Kandidaten ≥ 5 Belege | **${ueberSchwelle.length}** |`,
    '',
    `Schwelle aus THE-654/667: **≥ 5 Belege** je Kandidat → Vorschlag für die Ontologie (Mensch entscheidet per PR).`,
    `Sprechquote des Kanals: ${beobachtet.length}/${ohneRolle.length} rollenlosen Bestimmungen — der Rest blieb bewusst still.`,
    '',
    '## Kandidaten (keine bekannte Rolle)',
    '',
    '| Kandidat | Belege | Gesetze | Schreibvarianten |',
    '|---|---|---|---|',
    ...neue.map(([norm, c]) => {
      const laws = [...c.laws.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ');
      const mark = c.beleg >= 5 ? ' **←**' : '';
      return `| ${norm}${mark} | ${c.beleg} | ${laws} | ${[...c.raw].slice(0, 3).join(' · ')} |`;
    }),
    '',
    '## Mutmaßliche Dubletten bestehender Rollen (Klasse A — Extraktion, nicht Typraum)',
    '',
    dubletten.length === 0
      ? '*keine*'
      : ['| Beobachtung | Belege | deckt sich mit |', '|---|---|---|',
         ...dubletten.map(([norm, c]) => `| ${norm} | ${c.beleg} | \`${c.dubletteVon}\` |`)].join('\n'),
    '',
    '## Zuordnungen (AC-6 — nachrechenbar ohne neuen Lauf)',
    '',
    'Vollständige Schlüssel-Listen im JSON neben diesem Bericht.',
    '',
  ].join('\n');

  const outMd = resolve(__dirname, '../../../../docs/evals/the669-observed-candidates.md');
  const outJson = resolve(__dirname, '../../../../docs/evals/the669-observed-candidates.json');
  writeFileSync(outMd, md);
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: '2026-08-12',
        promptVersion: TYPING_PROMPT_VERSION,
        ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
        totals: { docs: docs.length, tp4: tp4.length, ohneRolle: ohneRolle.length, beobachtet: beobachtet.length },
        candidates: sorted.map(([norm, c]) => ({
          candidate: norm,
          beleg: c.beleg,
          dubletteVon: c.dubletteVon,
          laws: Object.fromEntries(c.laws),
          rawVariants: [...c.raw],
          regulationKeys: c.keys,
        })),
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n  tp-4-Dokumente     : ${tp4.length} von ${docs.length}`);
  console.log(`  ohne Rolle         : ${ohneRolle.length}`);
  console.log(`  mit Beobachtung    : ${beobachtet.length}`);
  console.log(`  Kandidaten         : ${candidates.size} (${neue.length} neu, ${dubletten.length} Dubletten)`);
  console.log(`  ≥ 5 Belege         : ${ueberSchwelle.length}`);
  for (const [norm, c] of ueberSchwelle.slice(0, 10)) console.log(`    ${String(c.beleg).padStart(4)}  ${norm}`);
  console.log(`\n  → ${outMd}\n  → ${outJson}\n`);
  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
