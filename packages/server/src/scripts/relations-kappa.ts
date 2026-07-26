/**
 * relations-kappa — Doppel-Labeling-Werkzeug für das Relations-Golden-Set
 * (Cross-Norm-Paar + Relationstyp + Richtung; RUBRIC.md §7, THE-421). Zweite
 * Hälfte des Relations-Messblocks — Gegenstück zu typing-kappa.ts (Task 7),
 * hier aber für die Relations-Achse: EINE Klasse pro Case (nicht mehrere
 * Achsen), aus `relationLabelForKappa` (relationsGolden.ts) — type+direction
 * kombiniert, weil "wer verdrängt wen" die eigentliche Aussage ist.
 *
 *   npm run relations:blind -- <in.json> <out.json>
 *     Erzeugt eine BLINDE Kopie für Annotator B.
 *
 *   npm run relations:kappa -- <a.json> <b.json>
 *     Aggregat-Kappa + Kappa je Relationstyp (nur ab n>=10) + Abweichungsliste.
 *     Kappa >= 0.6 (Aggregat) ist das Freeze-Gate (RUBRIC.md §7); darunter
 *     wird die Rubrik geschärft, nicht das Modell getunt.
 *
 * Linear: THE-421 (Slice T, Task 15) · Vorbild: typing-kappa.ts (THE-421/THE-430, Task 7)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  loadRelationsGolden,
  relationLabelForKappa,
  type RelationsGoldenSet,
  type RelationsGoldenCase,
} from '../evals/relationsGolden';
import { cohenKappaMulti } from '../evals/metrics';

// ─── Reine Logik (testbar) ──────────────────────────────────────

/** Per-type Kappa ist bei kleiner n statistisch bedeutungslos — Rule aus der Task-Spec. */
const MIN_N_FOR_PER_TYPE = 10;

export interface RelationsDisagreement {
  caseId: string;
  /** relationLabelForKappa(...)-Wert von Annotator A: '__none__' | 'TYPE:direction'. */
  a: string;
  /** relationLabelForKappa(...)-Wert von Annotator B. */
  b: string;
}

export interface OverallKappaResult {
  /** Shared cases, bei denen BEIDE Seiten gelabelt haben (relation gesetzt — string oder null). */
  pairs: number;
  /** Shared cases, bei denen mindestens eine Seite offen (relation === undefined) gelassen hat. */
  skipped: number;
  agreementRate: number;
  kappa: number;
}

export interface PerTypeKappaResult {
  /** Anzahl Cases, bei denen MINDESTENS EIN Annotator diesen Typ vergeben hat. */
  n: number;
  /** Nur gesetzt, wenn n >= 10 — sonst ist das Kappa Rauschen. */
  kappa?: number;
  /** Gesetzt, wenn n < 10 — zu dünn für eine belastbare Typ-Aussage. */
  tooThin?: true;
}

export interface RelationsKappaComparison {
  sharedCases: number;
  overall: OverallKappaResult;
  /** Nie ein Eintrag für '__none__' — die Negativ-Klasse ist kein "Typ". */
  perType: Record<string, PerTypeKappaResult>;
  disagreements: RelationsDisagreement[];
  /** Cases, die nur in einem der beiden Sets vorkommen (nicht verglichen). */
  unmatchedCaseIds: string[];
}

/** Extrahiert den Relationstyp aus einem relationLabelForKappa-Wert. null für '__none__'/'__open__'. */
function baseTypeOf(label: string): string | null {
  if (label === '__none__' || label === '__open__') return null;
  const sep = label.indexOf(':');
  return sep === -1 ? label : label.slice(0, sep);
}

/**
 * Vergleicht zwei Relations-Golden-Sets: pro gemeinsamem Case wird geprüft,
 * ob BEIDE Annotatoren die Relation gelabelt haben (relation === null "keine
 * Relation" ODER eine Relations-ID zählen als "gelabelt"; relation ===
 * undefined = offen). Nur Paare, bei denen BEIDE Seiten gelabelt haben, gehen
 * in Kappa ein — ein Paar, bei dem mindestens einer offen gelassen hat, zählt
 * als `skipped`, nicht als Nichtübereinstimmung (das wäre eine falsche
 * Attribution: "offen" ist keine Relations-Entscheidung).
 *
 * Direction ist Teil der Klasse (relationLabelForKappa kombiniert
 * type+direction) — zwei Annotatoren, die sich beim Typ einig sind aber bei
 * der Richtung nicht, disagreen ECHT.
 *
 * Per-Typ-Kappa: n = Anzahl Cases, bei denen mindestens ein Annotator diesen
 * Typ vergeben hat (auch wenn der andere '__none__' oder einen anderen Typ
 * sagt — das IST die Meinungsverschiedenheit, die gemessen werden soll). Nur
 * ab n >= 10 wird ein Kappa berichtet; darunter ist die Stichprobe zu dünn
 * für eine belastbare Typ-Aussage und das Gesamt-Kappa trägt die Entscheidung.
 * '__none__' bekommt NIE einen eigenen Typ-Eintrag, zählt aber im Aggregat.
 */
export function compareRelationsSets(a: RelationsGoldenSet, b: RelationsGoldenSet): RelationsKappaComparison {
  const bByCase = new Map(b.cases.map((c) => [c.caseId, c]));
  const disagreements: RelationsDisagreement[] = [];
  const unmatched: string[] = [];
  let sharedCases = 0;
  let skipped = 0;

  const allA: string[] = [];
  const allB: string[] = [];
  const perTypeLabels = new Map<string, { a: string[]; b: string[] }>();

  for (const caseA of a.cases) {
    const caseB = bByCase.get(caseA.caseId);
    if (!caseB) {
      unmatched.push(caseA.caseId);
      continue;
    }
    sharedCases++;

    const aOpen = caseA.relation === undefined;
    const bOpen = caseB.relation === undefined;
    if (aOpen || bOpen) {
      skipped++;
      continue;
    }

    const labelA = relationLabelForKappa(caseA);
    const labelB = relationLabelForKappa(caseB);
    allA.push(labelA);
    allB.push(labelB);
    if (labelA !== labelB) {
      disagreements.push({ caseId: caseA.caseId, a: labelA, b: labelB });
    }

    const types = new Set<string>();
    const ta = baseTypeOf(labelA);
    const tb = baseTypeOf(labelB);
    if (ta) types.add(ta);
    if (tb) types.add(tb);
    for (const t of types) {
      const acc = perTypeLabels.get(t) ?? { a: [], b: [] };
      acc.a.push(labelA);
      acc.b.push(labelB);
      perTypeLabels.set(t, acc);
    }
  }
  for (const caseB of b.cases) {
    if (!a.cases.some((c) => c.caseId === caseB.caseId)) unmatched.push(caseB.caseId);
  }

  const pairs = allA.length;
  const overall: OverallKappaResult =
    pairs === 0
      ? { pairs: 0, skipped, agreementRate: 0, kappa: 0 } // all-open guard — never call cohenKappaMulti on []
      : {
          pairs,
          skipped,
          agreementRate: allA.filter((v, i) => v === allB[i]).length / pairs,
          kappa: cohenKappaMulti(allA, allB),
        };

  const perType: Record<string, PerTypeKappaResult> = {};
  for (const [type, { a: la, b: lb }] of perTypeLabels) {
    const n = la.length;
    perType[type] = n >= MIN_N_FOR_PER_TYPE ? { n, kappa: cohenKappaMulti(la, lb) } : { n, tooThin: true };
  }

  return { sharedCases, overall, perType, disagreements, unmatchedCaseIds: unmatched };
}

/**
 * Blinde Kopie für Annotator B.
 *
 * WARUM (Anti-Anchoring — siehe typing-kappa.ts makeBlindTypingCopy für die
 * volle Begründung): Annotator A adjudiziert einen LLM-Vorschlag; würde B
 * dieselbe vorbelegte Kopie sehen, wäre Kappa künstlich aufgebläht (beide
 * einig wegen desselben Anker-Vorschlags, nicht wegen unabhängiger
 * Einschätzung). Darum werden relation/direction UND jede Spur des ersten
 * Durchgangs entfernt (annotator/notes/ambiguous/labeledAt) — B sieht nur
 * BEIDE Paragraphtexte + die Optionsliste, genau wie A vor der Vorbelegung.
 */
export function makeBlindRelationsCopy(set: RelationsGoldenSet): RelationsGoldenSet {
  return {
    ...set,
    version: `${set.version}-blind`,
    frozen: false,
    cases: set.cases.map(
      (c): RelationsGoldenCase => ({
        ...c,
        relation: undefined,
        direction: undefined,
        ambiguous: undefined,
        notes: undefined,
        annotator: undefined,
        labeledAt: undefined,
        // Auch ein Ausfall-Vermerk ist eine Spur des ersten Durchgangs und
        // damit ein Anker — er gehört in A's Datei, nicht in B's blinde Kopie.
        measurementFailed: undefined,
        // THE-519: evidence trägt den Beleg-Satz + die Slots (Begriff/Operator) —
        // der STÄRKSTE Anker überhaupt; languageTwinOf verrät „Zwilling eines
        // gelabelten Falls". Beide raus, sonst ist die Kopie nicht blind.
        evidence: undefined,
        languageTwinOf: undefined,
      }),
    ),
  };
}

// ─── Kohärenz-Gate (THE-519) ─────────────────────────────────────

/** Häufigster nicht-leerer annotator-Tag über die gelabelten Fälle. */
export function dominantAnnotator(set: RelationsGoldenSet): string {
  const counts = new Map<string, number>();
  for (const c of set.cases) {
    if (c.annotator) counts.set(c.annotator, (counts.get(c.annotator) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [tag, n] of counts) {
    if (n > bestN) {
      best = tag;
      bestN = n;
    }
  }
  return best;
}

/**
 * Harte Leakage-Sperre fürs Kohärenz-Gate (Plan Task 5, Leitplanke „Leakage
 * unmöglich"). Rater A darf NICHT das getestete Prod-Modell (Haiku) sein —
 * sonst labelt das Modell seine eigene Wahrheit. Rater B MUSS das Cross-House-
 * Modell (OpenRouter/GPT-5) sein — sonst misst das Gate keine Haus-übergreifende
 * Kohärenz. Gibt die Verletzungsgründe zurück (leer = ok).
 */
export function leakageViolations(annotatorA: string, annotatorB: string): string[] {
  const out: string[] = [];
  if (!annotatorA) out.push('Rater A (Datei 1) trägt keinen annotator-Tag.');
  else if (/haiku/i.test(annotatorA))
    out.push(`Rater A ist Haiku (annotator="${annotatorA}") — das getestete Prod-Modell darf die Wahrheit nicht selbst labeln.`);
  if (!annotatorB) out.push('Rater B (Datei 2) trägt keinen annotator-Tag.');
  else if (!/openrouter/i.test(annotatorB))
    out.push(`Rater B ist nicht Cross-House (annotator="${annotatorB}" ohne "openrouter") — das Gate braucht ein Fremd-Haus-Modell.`);
  return out;
}

/** Klassen-Verteilung (relationLabelForKappa) über ein Set — für B4a-Ausweis konstanter Klassen. */
export function classComposition(set: RelationsGoldenSet): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of set.cases) {
    const label = relationLabelForKappa(c);
    if (label === '__open__') continue; // ungelabelt zählt nicht als Klasse
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return m;
}

// ─── CLI ────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const flagValue = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
  };
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--only'));
  const [mode, arg1, arg2] = positional;

  if (mode === 'blind' && arg1 && arg2) {
    const set = loadRelationsGolden(path.resolve(arg1));
    // --only <sidecar.json>: auf die eingefrorene Audit-Teilmenge (caseIds)
    // beschränken — die vorregistrierte Kohärenz-Gate-Menge (THE-519).
    const onlyPath = flagValue('--only');
    let source = set;
    if (onlyPath) {
      const sidecar = JSON.parse(fs.readFileSync(path.resolve(onlyPath), 'utf8')) as { caseIds?: string[] };
      const ids = new Set(sidecar.caseIds ?? []);
      if (ids.size === 0) throw new Error(`--only: ${onlyPath} enthält keine caseIds`);
      const kept = set.cases.filter((c) => ids.has(c.caseId));
      const missing = [...ids].filter((id) => !kept.some((c) => c.caseId === id));
      if (missing.length > 0)
        console.error(`[relations-kappa] ⚠️ ${missing.length} Teilmengen-caseIds nicht im Set: ${missing.join(', ')}`);
      source = { ...set, cases: kept };
      console.error(`[relations-kappa] --only: ${kept.length}/${ids.size} Teilmengen-Fälle behalten.`);
    }
    const blind = makeBlindRelationsCopy(source);
    fs.writeFileSync(path.resolve(arg2), JSON.stringify(blind, null, 2));
    console.log(
      `[relations-kappa] blind copy: ${blind.cases.length} cases → ${arg2}\n` +
        `[relations-kappa] Annotator B labelt relation+direction nach RUBRIC.md (ohne A's Vorschlag/Notizen zu sehen).`,
    );
    return;
  }

  if (mode === 'compare' && arg1 && arg2) {
    const a = loadRelationsGolden(path.resolve(arg1));
    const b = loadRelationsGolden(path.resolve(arg2));
    const gate = flags.has('--gate');

    // --gate: harte Leakage-Sperre VOR jeder Zahl (Kohärenz-Gate THE-519).
    // arg1 = Rater A (Opus, nicht Haiku), arg2 = Rater B (OpenRouter/GPT-5).
    if (gate) {
      const annA = dominantAnnotator(a);
      const annB = dominantAnnotator(b);
      const violations = leakageViolations(annA, annB);
      if (violations.length > 0) {
        console.error('[relations-kappa] ⛔ KOHÄRENZ-GATE ABGEBROCHEN — Leakage-Sperre:');
        for (const v of violations) console.error(`  - ${v}`);
        process.exitCode = 3;
        return;
      }
      console.log(`[relations-kappa] Gate-Leakage-Check ✓ · Rater A="${annA}" · Rater B="${annB}"`);
    }

    const r = compareRelationsSets(a, b);

    console.log(`[relations-kappa] shared cases: ${r.sharedCases}`);
    console.log(
      `[relations-kappa] overall: pairs=${r.overall.pairs} skipped=${r.overall.skipped} ` +
        `agreement=${(r.overall.agreementRate * 100).toFixed(1)}% kappa=${r.overall.kappa.toFixed(3)}`,
    );
    for (const type of Object.keys(r.perType).sort()) {
      const pt = r.perType[type];
      if (pt.tooThin) {
        console.log(`[relations-kappa] ${type}: n=${pt.n} — too thin for per-type kappa (need n>=10)`);
      } else {
        console.log(`[relations-kappa] ${type}: n=${pt.n} kappa=${pt.kappa!.toFixed(3)}`);
      }
    }
    if (r.unmatchedCaseIds.length > 0) {
      console.log(`[relations-kappa] not compared (only in one file): ${r.unmatchedCaseIds.join(', ')}`);
    }
    if (r.disagreements.length === 0) {
      console.log('[relations-kappa] keine Abweichungen — direkt adjudizieren/freezen.');
    } else {
      console.log(`\n[relations-kappa] ${r.disagreements.length} Abweichungen zur Adjudikation:`);
      for (const d of r.disagreements) {
        console.log(`  - ${d.caseId}: A=${d.a} vs B=${d.b}`);
      }
    }

    if (gate) {
      // Klassen-Komposition (B4a): eine konstante Klasse macht Kappa bedeutungslos.
      const compA = classComposition(a);
      const compB = classComposition(b);
      const fmt = (m: Map<string, number>): string =>
        [...m.entries()].sort().map(([k, n]) => `${k}=${n}`).join(', ') || '—';
      console.log(`\n[relations-kappa] Klassen A: ${fmt(compA)}`);
      console.log(`[relations-kappa] Klassen B: ${fmt(compB)}`);
      if (compA.size <= 1) console.log(`[relations-kappa] ⚠️ Rater A hat nur ${compA.size} Klasse(n) — Kappa degeneriert (B4a).`);
      if (compB.size <= 1) console.log(`[relations-kappa] ⚠️ Rater B hat nur ${compB.size} Klasse(n) — Kappa degeneriert (B4a).`);

      const THRESHOLD = 0.8;
      if (r.overall.kappa >= THRESHOLD) {
        console.log(`\n[relations-kappa] ✅ KOHÄRENZ-GATE BESTANDEN — Kappa ${r.overall.kappa.toFixed(3)} ≥ ${THRESHOLD} (Cross-House, rp-3).`);
      } else {
        console.log(`\n[relations-kappa] ❌ KOHÄRENZ-GATE GERISSEN — Kappa ${r.overall.kappa.toFixed(3)} < ${THRESHOLD}. Zurück zu Task 3/4 (Schablone/Regeln schärfen → neue Prompt-Version → frisches blindes Rating), niemals still nach-editieren.`);
        process.exitCode = 1;
      }
      return;
    }

    if (r.overall.pairs > 0 && r.overall.kappa < 0.6) {
      console.log(`\n[relations-kappa] ⚠️ Aggregat-Kappa ${r.overall.kappa.toFixed(3)} < 0.6 — Rubrik schärfen, nicht das Modell tunen.`);
      process.exitCode = 1;
    }
    return;
  }

  console.error(
    'Usage:\n' +
      '  relations-kappa blind   <in.json> <out.json> [--only <sidecar.json>]   # blinde Kopie (optional auf Audit-Teilmenge)\n' +
      '  relations-kappa compare <a.json> <b.json> [--gate]                     # Aggregat/Typ-Kappa (+ Gate: Leakage-Sperre, Kappa≥0.80, Komposition)',
  );
  process.exitCode = 2;
}

if (require.main === module) {
  main();
}
