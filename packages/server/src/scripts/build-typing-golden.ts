/**
 * build-typing-golden — baut aus den Projekt-Regulations einen Typing-Golden-
 * DRAFT (Labels leer bzw. LLM-vorgeschlagen), aus dem `typing:worksheet` die
 * HTML-Adjudikationsvorlage erzeugt.
 *
 * Workflow (User-Entscheidung 2026-07-12: LLM-vorlabeln → Mensch adjudiziert):
 *   1. build-typing-golden  → Draft (eine Provision = ein Case, Labels undefined)
 *   2. [optional] LLM-Prelabel füllt `labels` als VORSCHLAG (leakage dokumentiert)
 *   3. typing:worksheet     → HTML mit Dropdowns, auf Vorschlag vorbelegt
 *   4. Mensch adjudiziert, exportiert, Kappa ≥ 0.6 → `frozen: true`
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   npm run typing:build -- --source dsgvo --out src/evals/golden/typing.draft.json
 *   npm run typing:build -- --source nis2  --out /tmp/typing-nis2.json
 *
 * Der Draft ist bewusst LLM-FREI (kein Kosten-/Modell-Entscheid hier); der
 * Prelabel-Schritt ist separat + flag-gated, damit dieser Build deterministisch
 * + testbar bleibt.
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster: build-self-golden.ts (THE-379)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { TypingGoldenSetSchema, type TypingGoldenCase } from '../evals/typingGolden';
import { mulberry32 } from '../evals/metrics';

// ─── Reine Transformation (ohne I/O — testbar) ──────────────────

interface ApiRegulation {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
  jurisdiction: string;
}

export function slugifyCaseId(source: string, paragraphNumber: string): string {
  return `${source}-${paragraphNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface TypingDraft {
  version: string;
  frozen: false;
  ontologyVersion: string;
  rubricRef: string;
  cases: TypingGoldenCase[];
}

export interface BuildTypingDraftOptions {
  ontologyVersion?: string;
  version?: string;
  /** Ziel-Case-Zahl; weggelassen → altes Verhalten (alle eligiblen Provisions). */
  targetSize?: number;
  /** Seed für den deterministischen PRNG (mulberry32) hinter der Stratifikation. */
  seed?: number;
  /**
   * caseIds, die IMMER enthalten sein müssen, unabhängig von der Stratifikation.
   *
   * Warum: die Stratifikation streut über Quelle und Sprache und bildet damit die
   * NATÜRLICHE Verteilung des Korpus ab. Geltungsbereichs- und Definitions-
   * Provisions sind darin naturgemäß selten (ein Gesetz hat ein bis zwei davon
   * gegenüber Dutzenden Pflichten-Artikeln) — im ersten 70er-Entwurf kamen sie auf
   * 5 bzw. 2 Fälle. Für die Messung sind sie aber die WICHTIGSTEN Klassen: die
   * Priorisierung von Geltungsbereichs-Provisions im Retrieval ist der Grund,
   * warum die Achse überhaupt existiert. Eine Aussage über fünf Fälle trägt nicht.
   *
   * Diese Liste erzwingt daher gezielte Über-Abtastung seltener, aber wichtiger
   * Klassen — dasselbe Prinzip wie der Pflichtanteil an Negativ-Fällen in der
   * Zuordnungs-Rubrik (§ 5). Die Auswahl bleibt label-UNABHÄNGIG: gewählt wird
   * über die Artikel-Position (Art. 1-3 sind praktisch immer Gegenstand,
   * Anwendungsbereich, Begriffsbestimmungen), nicht über ein vermutetes Label.
   */
  mustInclude?: string[];
  /**
   * caseIds, die aus dem Kandidaten-Pool entfernt werden, BEVOR stratifiziert
   * wird (Golden v2: Disjunktheit zu v1). Siehe `excludeCases` für das Warum.
   */
  excludeCaseIds?: string[];
  /**
   * Exakt diese caseIds wählen (Audit-Topf) — Positivliste statt Stichprobe,
   * daher nicht mit targetSize/mustInclude kombinierbar. Siehe `pickOnlyCases`.
   */
  onlyCaseIds?: string[];
}

/**
 * Entfernt Fälle, deren caseId in `excludeIds` steht — und zwar VOR der
 * Stratifikation, nicht danach.
 *
 * Warum: v2 muss DISJUNKT zu v1 sein (Out-of-Sample-Garantie). Würden
 * v1-Fälle erst nach der Auswahl gestrichen, hätte die Stratifikation ihre
 * Quote teilweise mit später verworfenem Material gefüllt — der Satz
 * schrumpfte still unter die Zielgröße. So sieht der Stratifizierer die
 * v1-Fälle nie und füllt die Quote aus genuin frischem Material.
 */
export function excludeCases(cases: TypingGoldenCase[], excludeIds: string[]): TypingGoldenCase[] {
  const excluded = new Set(excludeIds);
  return cases.filter((c) => !excluded.has(c.caseId));
}

/**
 * Wählt EXAKT die angeforderten caseIds, in der Reihenfolge der Id-Liste —
 * der Audit-Topf ist eine Positivliste (z. B. 22 Verdachtsfälle), keine
 * Stichprobe: keine Stratifikation, keine Zielgröße.
 *
 * Fehlt auch nur eine Id im Pool, ist das ein HARTER Fehler mit allen
 * fehlenden Ids in der Meldung. Ein Audit-Satz, der fehlende Fälle still
 * verschluckt, würde Vollständigkeit vortäuschen: die Fehlerquote der
 * Verdachtsfälle würde über einen kleineren Nenner gemessen und sähe besser
 * aus, als sie ist.
 */
export function pickOnlyCases(cases: TypingGoldenCase[], onlyIds: string[]): TypingGoldenCase[] {
  const byId = new Map(cases.map((c) => [c.caseId, c]));
  const missing = onlyIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(
      `--only-cases: ${missing.length} caseId(s) nicht im Pool: ${missing.join(', ')}`
    );
  }
  return onlyIds.map((id) => byId.get(id)!);
}

/**
 * Deterministische Stratifikation: Round-Robin über `source`, innerhalb einer
 * Quelle alternierend über die vorhandenen Sprachen — damit ein Quoten-Pull
 * nicht ein einzelnes Gesetz leerzieht, bevor andere überhaupt drankommen.
 * Reihenfolge von Quellen/Sprachen/Cases wird per Seed gemischt (Fisher-Yates),
 * also reproduzierbar bei gleichem (cases, seed) und unterschiedlich bei
 * unterschiedlichem Seed. Kann die Quote nicht gefüllt werden (zu wenig
 * Material), werden NIE Duplikate nachgefüllt — es wird einfach das gegeben.
 */
function stratifiedSelect(
  allCases: TypingGoldenCase[],
  targetSize: number,
  seed: number,
  mustInclude: string[] = []
): TypingGoldenCase[] {
  if (allCases.length <= targetSize) return allCases;

  // Pflicht-Fälle vorab herausnehmen: sie sind gesetzt und belegen Quote.
  // Der Rest wird wie bisher stratifiziert über die verbleibenden Plätze.
  const forcedIds = new Set(mustInclude);
  const forced = allCases.filter((c) => forcedIds.has(c.caseId));
  const remaining = allCases.filter((c) => !forcedIds.has(c.caseId));
  const slotsLeft = targetSize - forced.length;
  if (slotsLeft <= 0) return forced.slice(0, targetSize);
  allCases = remaining;
  targetSize = slotsLeft;

  const rand = mulberry32(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  // source -> language -> cases (sortierte Keys vor dem Mischen: rand-Verbrauch
  // hängt so nur von den Daten ab, nie von Map-Iterationsreihenfolge).
  const bySource = new Map<string, Map<string, TypingGoldenCase[]>>();
  for (const c of allCases) {
    let langs = bySource.get(c.source);
    if (!langs) {
      langs = new Map();
      bySource.set(c.source, langs);
    }
    const list = langs.get(c.language) ?? [];
    list.push(c);
    langs.set(c.language, list);
  }

  const sources = shuffle([...bySource.keys()].sort());

  // Pro Quelle eine Warteschlange, die die Sprachen im Round-Robin alterniert.
  const queues = new Map<string, TypingGoldenCase[]>();
  for (const source of sources) {
    const langs = bySource.get(source)!;
    const langKeys = shuffle([...langs.keys()].sort());
    const shuffledByLang = new Map(langKeys.map((l) => [l, shuffle(langs.get(l)!)]));
    const queue: TypingGoldenCase[] = [];
    const idx = Object.fromEntries(langKeys.map((l) => [l, 0])) as Record<string, number>;
    let more = true;
    while (more) {
      more = false;
      for (const l of langKeys) {
        const list = shuffledByLang.get(l)!;
        if (idx[l] < list.length) {
          queue.push(list[idx[l]]);
          idx[l]++;
          more = true;
        }
      }
    }
    queues.set(source, queue);
  }

  // Round-Robin über Quellen bis targetSize erreicht oder alles erschöpft ist.
  const selected: TypingGoldenCase[] = [];
  const srcIdx = Object.fromEntries(sources.map((s) => [s, 0])) as Record<string, number>;
  let more = true;
  while (selected.length < targetSize && more) {
    more = false;
    for (const source of sources) {
      if (selected.length >= targetSize) break;
      const queue = queues.get(source)!;
      if (srcIdx[source] < queue.length) {
        selected.push(queue[srcIdx[source]]);
        srcIdx[source]++;
        more = true;
      }
    }
  }

  // Pflicht-Fälle zuerst, danach die stratifizierte Auswahl.
  return [...forced, ...selected];
}

/** Ein Case je Provision, `labels` LEER (undefined-Achsen) — der Labeler/Prelabel füllt. */
export function buildTypingDraft(
  regulations: ApiRegulation[],
  opts: BuildTypingDraftOptions = {}
): TypingDraft {
  const {
    ontologyVersion = NORM_ONTOLOGY.ontologyVersion,
    version = 'v1-draft',
    targetSize,
    seed = 42,
  } = opts;

  // Positivliste und Stichproben-Parameter schließen sich aus: eine "Quote"
  // oder ein "Pflichtanteil" über einer festen Liste wäre widersprüchlich.
  if (opts.onlyCaseIds && (targetSize !== undefined || opts.mustInclude)) {
    throw new Error(
      'onlyCaseIds ist nicht mit targetSize/mustInclude kombinierbar: der Audit-Topf ist eine feste Positivliste, keine Stichprobe.'
    );
  }

  const seen = new Set<string>();
  const allCases: TypingGoldenCase[] = [];
  for (const r of regulations) {
    if (!r.fullText || r.fullText.length < 50) continue;
    let caseId = slugifyCaseId(r.source, r.paragraphNumber);
    while (seen.has(caseId)) caseId = `${caseId}-x`;
    seen.add(caseId);
    allCases.push({
      caseId,
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language === 'en' ? 'en' : 'de',
      jurisdiction: r.jurisdiction || 'EU',
      labels: {}, // alle Achsen offen — bewusst kein Default-Label
    });
  }

  // Ausschluss VOR jeder Auswahl — siehe excludeCases (Disjunktheits-Garantie).
  const candidates = opts.excludeCaseIds ? excludeCases(allCases, opts.excludeCaseIds) : allCases;

  const cases = opts.onlyCaseIds
    ? pickOnlyCases(candidates, opts.onlyCaseIds)
    : targetSize === undefined
      ? candidates
      : stratifiedSelect(candidates, targetSize, seed, opts.mustInclude ?? []);

  return { version, frozen: false, ontologyVersion, rubricRef: '../RUBRIC.md', cases };
}

/**
 * Vereinigt die BEIDEN Pflicht-Quellen zu einer deduplizierten Liste:
 * `--must-include-paragraphs` (Artikel-Nummern → caseIds je Quelle) und
 * `--must-include-cases` (fertige caseId-Liste). Beide füttern denselben
 * `mustInclude`-Topf; die Reihenfolge ist Paragraphen-Herkunft zuerst, danach
 * die Fall-Liste, jede Id nur einmal (doppelte Ids würden sonst Quote doppelt
 * verbrauchen).
 *
 * Warum überhaupt eine zweite Quelle: Der Stratifizierer schneidet nach
 * Quelle × Sprache und bildet damit die natürliche Korpus-Verteilung ab. Für
 * SELTENE Klassen ist das der falsche Schnitt — sie kämen mit ein, zwei Fällen
 * an und die Messung trüge nichts (derselbe Fehler wie einst bei
 * `provisionKind` mit 5 bzw. 2 Fällen). OntoLearner (arXiv:2607.01977, P1)
 * baut Splits deshalb „based on the least frequent associated type of each
 * term". Über Artikel-Nummern ist ein ADRESSAT nicht adressierbar; nur über
 * eine vorab label-unabhängig (Volltext-Begriff) ermittelte Fall-Liste.
 *
 * `missing` meldet Ids der Fall-Liste, die es im Pool nicht gibt — sie bleiben
 * bewusst in `forced` (der Kern ignoriert unbekannte Pflicht-Ids ohnehin) und
 * werden vom Aufrufer nur gewarnt, siehe Begründung an der CLI-Flag.
 */
export interface ForcedCaseResolution {
  forced: string[];
  missing: string[];
}

export function resolveForcedCaseIds(
  fromParagraphs: string[],
  fromCaseFile: string[],
  poolCaseIds: string[]
): ForcedCaseResolution {
  const pool = new Set(poolCaseIds);
  const seen = new Set<string>();
  const forced: string[] = [];
  for (const id of [...fromParagraphs, ...fromCaseFile]) {
    if (seen.has(id)) continue;
    seen.add(id);
    forced.push(id);
  }
  const missing = [...new Set(fromCaseFile)].filter((id) => !pool.has(id));
  return { forced, missing };
}

// ─── API-Glue ───────────────────────────────────────────────────

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
}

/**
 * CLI-Rumpf mit explizitem argv statt `process.argv` — so sind die
 * Eingabe-Fehlerpfade (exit 2) testbar, ohne einen Kindprozess zu starten.
 */
export async function runCli(argv: string[]): Promise<void> {
  const outArg = argValue(argv, '--out');
  const sourceArg = argValue(argv, '--source');
  const sourcesArg = argValue(argv, '--sources');
  const targetSizeArg = argValue(argv, '--target-size');
  const seedArg = argValue(argv, '--seed');
  const excludeFileArg = argValue(argv, '--exclude-file');
  const onlyCasesArg = argValue(argv, '--only-cases');

  // --only-cases (Audit-Topf) ist eine feste Positivliste — Stichproben-Flags
  // daneben wären widersprüchlich und werden hart abgewiesen statt ignoriert.
  // Auch --must-include-cases gehört dazu: --only-cases IST bereits die
  // gesamte Auswahl, ein Pflicht-Einschluss obendrauf ist bedeutungslos und
  // würde einen Denkfehler still überdecken (die Ids sind entweder schon
  // drin oder sie sollen gar nicht in den Audit-Topf).
  if (
    onlyCasesArg &&
    (targetSizeArg !== undefined ||
      seedArg !== undefined ||
      argValue(argv, '--must-include-paragraphs') ||
      argValue(argv, '--must-include-cases'))
  ) {
    console.error(
      '--only-cases ist nicht mit --target-size/--seed/--must-include-paragraphs/--must-include-cases ' +
        'kombinierbar: der Audit-Topf ist eine feste Positivliste, keine Stichprobe.'
    );
    process.exitCode = 2;
    return;
  }

  // --sources a,b,c stratifiziert über mehrere Gesetze; --source bleibt der
  // Ein-Gesetz-Kurzweg (Default 'dsgvo', unverändertes Verhalten).
  const sources = sourcesArg
    ? sourcesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [sourceArg || 'dsgvo'];
  const targetSize = targetSizeArg !== undefined ? Number(targetSizeArg) : undefined;
  const seed = seedArg !== undefined ? Number(seedArg) : undefined;

  const outPath = path.resolve(
    outArg
      ? outArg
      : path.join(__dirname, '..', 'evals', 'golden', `typing.${sources.join('-')}.draft.json`)
  );

  // Zwei Beschaffungswege:
  //
  //   --from-file <pool.json>   Provisions aus einer lokalen Datei (Array von
  //                             ApiRegulation-Objekten). Gedacht für einen
  //                             KORPUS-weiten Prüfsatz: der projekt-bezogene
  //                             Endpunkt unten liefert nur die Regulierungen,
  //                             die einem Projekt zugeordnet sind — für ein
  //                             Demo-Projekt sind das eine Handvoll, nicht die
  //                             ~1500 Paragraphen des Korpus. Den Pool zieht man
  //                             read-only aus der Korpus-Datenbank; so muss für
  //                             einen Prüfsatz nichts in ein Projekt importiert
  //                             (und damit verändert) werden.
  //   ohne Flag                 wie bisher über die Projekt-API (TA_*).
  const fromFileArg = argValue(argv, '--from-file');

  const regulations: ApiRegulation[] = [];
  if (fromFileArg) {
    const poolPath = path.resolve(fromFileArg);
    const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8')) as ApiRegulation[];
    if (!Array.isArray(pool)) throw new Error(`--from-file: ${poolPath} enthält kein Array`);
    const wanted = new Set(sources);
    // Bei --only-cases bestimmt allein die Id-Liste die Auswahl — ein
    // Quellen-Filter davor würde Ids quer über Gesetze künstlich „fehlen"
    // lassen und den harten Vollständigkeits-Check grundlos auslösen.
    regulations.push(...(onlyCasesArg ? pool : pool.filter((r) => wanted.has(r.source))));
    if (regulations.length === 0) {
      console.error(
        `--from-file: keine Provisions für ${sources.join(',')} in ${poolPath} ` +
          `(vorhandene Quellen: ${[...new Set(pool.map((r) => r.source))].sort().join(', ')})`
      );
      process.exitCode = 2;
      return;
    }
  } else {
    const api = process.env.TA_API || 'http://localhost:3000/api';
    const key = process.env.TA_KEY;
    const projectId = process.env.TA_PROJECT;
    if (!key || !projectId) {
      console.error('TA_KEY und TA_PROJECT müssen gesetzt sein (oder --from-file benutzen).');
      process.exitCode = 2;
      return;
    }
    const headers = { 'X-API-Key': key };
    for (const source of sources) {
      const regRes = await fetch(`${api}/projects/${projectId}/regulations?source=${source}&limit=300`, { headers });
      if (!regRes.ok) throw new Error(`GET regulations (${source}): HTTP ${regRes.status}`);
      const items = ((await regRes.json()) as { data: { items: ApiRegulation[] } }).data.items;
      regulations.push(...items);
    }
  }

  // --must-include-paragraphs 1,2,3  erzwingt bestimmte Artikel-Nummern JE QUELLE
  // in der Auswahl. Angegeben werden Paragraphen-Nummern (nicht caseIds), weil das
  // die fachliche Absicht ist: „Art. 1-3 jedes Gesetzes sind Gegenstand,
  // Anwendungsbereich und Begriffsbestimmungen". Die caseId-Bildung ist ein
  // internes Detail und wird hier über dieselbe Slugify-Regel aufgelöst wie im
  // Aufbau, damit beide Seiten nicht auseinanderlaufen können.
  const mustIncludeArg = argValue(argv, '--must-include-paragraphs');
  let mustIncludeFromParagraphs: string[] = [];
  if (mustIncludeArg) {
    const wanted = new Set(
      mustIncludeArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    mustIncludeFromParagraphs = regulations
      .filter((r) => wanted.has(r.paragraphNumber))
      .map((r) => slugifyCaseId(r.source, r.paragraphNumber));
    console.log(
      `[typing-build] Pflicht-Einschluss: ${mustIncludeFromParagraphs.length} Fälle ` +
        `(Paragraphen ${[...wanted].join(',')} je Quelle)`
    );
  }

  // --must-include-cases <ids.json>  erzwingt eine vorab ermittelte FALL-Liste
  // (JSON-Array von caseIds) in der Auswahl. Gedacht für die Über-Abtastung
  // seltener Klassen: der Stratifizierer schneidet nach Quelle × Sprache, ein
  // seltener Adressat (z. B. die vier neuen partyRole-Werte) käme darin mit ein
  // bis zwei Fällen an — eine Kappa-Zahl darüber trüge nichts. OntoLearner
  // stratifiziert genau deshalb nach der SELTENSTEN zugehörigen Klasse (P1).
  // Über Artikel-Nummern ist ein Akteur nicht adressierbar, daher diese zweite
  // Quelle neben --must-include-paragraphs; beide fließen VEREINIGT (dedupliziert)
  // in denselben mustInclude-Topf, siehe resolveForcedCaseIds.
  //
  // Lesefehler sind HART (exit 2): eine still ignorierte Pflicht-Liste würde
  // genau den Zweck der Flag aushebeln — der Satz sähe gebaut aus, hätte die
  // seltenen Klassen aber nicht drin.
  const mustIncludeCasesArg = argValue(argv, '--must-include-cases');
  let mustIncludeFromCases: string[] = [];
  if (mustIncludeCasesArg) {
    const casesPath = path.resolve(mustIncludeCasesArg);
    try {
      const parsed = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
        throw new Error('erwartet ein JSON-Array von caseId-Strings');
      }
      mustIncludeFromCases = parsed as string[];
    } catch (err) {
      console.error(
        `--must-include-cases: ${casesPath} nicht lesbar/parsebar: ${err instanceof Error ? err.message : err}`
      );
      process.exitCode = 2;
      return;
    }
  }

  const { forced, missing } = resolveForcedCaseIds(
    mustIncludeFromParagraphs,
    mustIncludeFromCases,
    regulations.map((r) => slugifyCaseId(r.source, r.paragraphNumber))
  );
  if (mustIncludeCasesArg) {
    console.log(
      `[typing-build] Pflicht-Einschluss (Fall-Liste): ` +
        `${mustIncludeFromCases.length - missing.length}/${mustIncludeFromCases.length} Ids im Pool gefunden`
    );
  }
  if (missing.length > 0) {
    // WARNEN, nicht abbrechen — anders als bei --only-cases. Dort trägt die
    // Vollständigkeit die Aussage: der Audit-Topf misst eine Fehlerquote über
    // einem festen Nenner, eine fehlende Id würde diesen Nenner verkleinern und
    // die Quote geschönt aussehen lassen. Hier ist die Liste eine Über-Abtastung
    // seltener Klassen — eine fehlende Id verkleinert nur diese Über-Abtastung,
    // verfälscht aber keine Kennzahl. Ein harter Abbruch wäre also unangemessen
    // streng; verschweigen darf man es trotzdem nicht.
    console.warn(
      `[typing-build] WARN: ${missing.length} erzwungene caseId(s) nicht im Pool ` +
        `(Über-Abtastung entsprechend kleiner): ${missing.join(', ')}`
    );
  }
  // Leer bleibt undefined: eine leere Pflichtliste ist KEIN Pflicht-Einschluss
  // (und würde in buildTypingDraft fälschlich als Konflikt mit onlyCaseIds gelten).
  const mustInclude = forced.length > 0 ? forced : undefined;

  // --exclude-file <golden.json>  entfernt die caseIds eines bestehenden
  // Golden/Drafts aus dem Kandidaten-Pool, BEVOR stratifiziert wird — v2 muss
  // disjunkt zu v1 sein (Out-of-Sample). Lesefehler sind HART (exit 2): ein
  // stiller Fallback ohne die v1-Ids würde die Disjunktheits-Garantie lautlos
  // brechen und der Prüfsatz wäre wertlos, ohne dass es jemand merkt.
  let excludeCaseIds: string[] | undefined;
  if (excludeFileArg) {
    const excludePath = path.resolve(excludeFileArg);
    try {
      const parsed = JSON.parse(fs.readFileSync(excludePath, 'utf8')) as {
        cases?: { caseId?: string }[];
      };
      if (!Array.isArray(parsed.cases)) throw new Error('enthält keine cases[]-Liste');
      excludeCaseIds = parsed.cases
        .map((c) => c.caseId)
        .filter((id): id is string => typeof id === 'string');
    } catch (err) {
      console.error(
        `--exclude-file: ${excludePath} nicht lesbar/parsebar: ${err instanceof Error ? err.message : err}`
      );
      process.exitCode = 2;
      return;
    }
    const excludeSet = new Set(excludeCaseIds);
    const matched = regulations.filter((r) =>
      excludeSet.has(slugifyCaseId(r.source, r.paragraphNumber))
    ).length;
    console.log(
      `[typing-build] Disjunktheit: ${matched} Pool-Fälle ausgeschlossen ` +
        `(${excludeCaseIds.length} Ids aus ${path.basename(excludePath)})`
    );
  }

  // --only-cases <ids.json>  wählt exakt die gelisteten caseIds (Audit-Topf).
  // Datei = JSON-Array von caseId-Strings; Reihenfolge wird übernommen.
  let onlyCaseIds: string[] | undefined;
  if (onlyCasesArg) {
    const onlyPath = path.resolve(onlyCasesArg);
    try {
      const parsed = JSON.parse(fs.readFileSync(onlyPath, 'utf8')) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
        throw new Error('erwartet ein JSON-Array von caseId-Strings');
      }
      onlyCaseIds = parsed as string[];
    } catch (err) {
      console.error(
        `--only-cases: ${onlyPath} nicht lesbar/parsebar: ${err instanceof Error ? err.message : err}`
      );
      process.exitCode = 2;
      return;
    }
  }

  let draft: TypingDraft;
  try {
    draft = buildTypingDraft(regulations, { targetSize, seed, mustInclude, excludeCaseIds, onlyCaseIds });
  } catch (err) {
    // Daten-Probleme (z. B. fehlende Audit-Ids im Pool) sind exit 2 wie die
    // anderen Eingabe-Fehler oben — kein Crash-Exit 1, damit Skripte den
    // Unterschied zwischen "kaputt" und "falsche Eingabe" sehen.
    console.error(`[typing-build] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 2;
    return;
  }
  // Schema-Validierung vor dem Schreiben (fängt kaputte Cases sofort).
  TypingGoldenSetSchema.parse(draft);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

  console.log(
    `[typing-build] ${draft.cases.length} Provisions (${sources.join(',')}) · E6 ${draft.ontologyVersion}\n` +
      `[typing-build] → ${outPath}\n` +
      `[typing-build] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error('[typing-build] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
