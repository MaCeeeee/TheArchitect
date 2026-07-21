/**
 * typing-kappa — Doppel-Labeling-Werkzeug für die Term-Typing-Achsen
 * (normKind/bindingness/obligationKind/partyRole/provisionKind; RUBRIC.md §7,
 * THE-421/THE-430). Zweite Hälfte des Agreement-Messblocks — Gegenstück zu
 * golden-kappa.ts (Mapping: Set-Zugehörigkeit, binäre Labels). Hier ist jede
 * Achse eine Multi-Klassen-Einordnung gegen einen geschlossenen E6-Raum, daher
 * eigene Vergleichslogik über cohenKappaMulti statt der binären cohenKappa.
 *
 *   npm run typing:blind -- <in.json> <out.json>
 *     Erzeugt eine BLINDE Kopie für Annotator B.
 *
 *   npm run typing:kappa -- <a.json> <b.json>
 *     Kappa je Achse + Abweichungsliste. Kappa >= 0.6 auf jeder Achse ist das
 *     Freeze-Gate (RUBRIC.md §7); darunter wird die Rubrik geschärft, nicht
 *     das Modell getunt.
 *
 * Linear: THE-421 (Slice T) · Vorbild: golden-kappa.ts (THE-379)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadTypingGolden, TYPING_AXES, type TypingGoldenSet, type TypingAxis } from '../evals/typingGolden';
import { cohenKappaMulti } from '../evals/metrics';

// ─── Reine Logik (testbar) ──────────────────────────────────────

/** null (bewusst "nicht anwendbar") wird zur eigenen Klasse — Konvention aus typingMetrics.ts. */
const NA = '__na__';

export interface TypingAxisDisagreement {
  caseId: string;
  axis: TypingAxis;
  a: string | null;
  b: string | null;
}

export interface AxisKappaResult {
  /** Paare, bei denen BEIDE Seiten einen Wert gesetzt haben (string oder null) — gehen in Kappa ein. */
  pairs: number;
  /** Paare, bei denen GENAU eine Seite die Achse offen (undefined) gelassen hat — nicht vergleichbar. */
  skipped: number;
  agreementRate: number;
  kappa: number;
  /**
   * Wahr, wenn mindestens ein Annotator über ALLE verglichenen Paare nur EINE
   * Klasse vergeben hat. Dann ist Kappa rechnerisch festgenagelt und trägt
   * keine Aussage: die erwartete Zufallsübereinstimmung wird gleich der
   * beobachteten, Kappa fällt auf 0 — auch bei 95 % Rohübereinstimmung.
   *
   * Das ist KEINE Uneinigkeit, sondern ein Messartefakt (Prävalenz-Paradox).
   * Auf einem Korpus aus unmittelbar geltenden Gesetzgebungsakten sind
   * `normKind` und `bindingness` konstruktionsbedingt konstant — die Achse hat
   * auf diesem Material schlicht keine Varianz. Darauf mit „Rubrik schärfen"
   * zu reagieren, würde eine funktionierende Rubrik für ein Problem umbauen,
   * das sie nicht hat. Solche Achsen werden daher ausgewiesen und vom
   * Freeze-Tor ausgenommen, statt es fälschlich zu reißen.
   */
  degenerate: boolean;
}

export interface TypingKappaComparison {
  sharedCases: number;
  perAxis: Record<TypingAxis, AxisKappaResult>;
  disagreements: TypingAxisDisagreement[];
  /** Cases, die nur in einem der beiden Sets vorkommen (nicht verglichen). */
  unmatchedCaseIds: string[];
}

/**
 * Vergleicht zwei Typing-Golden-Sets: pro gemeinsamem Case und pro Achse wird
 * geprüft, ob BEIDE Annotatoren die Achse gelabelt haben (string ODER
 * bewusstes null zählen als "gelabelt"; undefined = offen). Nur Paare, bei
 * denen beide Seiten einen Wert haben, gehen in Kappa ein — ein Paar, bei dem
 * nur einer offen gelassen hat, zählt als `skipped`, nicht als Nichtübereinstimmung
 * (das wäre eine falsche Attribution: "offen" ist keine Typ-Entscheidung).
 */
export function compareTypingSets(a: TypingGoldenSet, b: TypingGoldenSet): TypingKappaComparison {
  const bByCase = new Map(b.cases.map((c) => [c.caseId, c]));
  const disagreements: TypingAxisDisagreement[] = [];
  const unmatched: string[] = [];
  let sharedCases = 0;

  const labelsByAxis: Record<TypingAxis, { a: string[]; b: string[]; skipped: number }> = {
    normKind: { a: [], b: [], skipped: 0 },
    bindingness: { a: [], b: [], skipped: 0 },
    obligationKind: { a: [], b: [], skipped: 0 },
    partyRole: { a: [], b: [], skipped: 0 },
    provisionKind: { a: [], b: [], skipped: 0 },
  };

  for (const caseA of a.cases) {
    const caseB = bByCase.get(caseA.caseId);
    if (!caseB) {
      unmatched.push(caseA.caseId);
      continue;
    }
    sharedCases++;

    for (const axis of TYPING_AXES) {
      const va = caseA.labels[axis];
      const vb = caseB.labels[axis];
      const aOpen = va === undefined;
      const bOpen = vb === undefined;

      if (aOpen && bOpen) continue; // beide offen — nichts zu vergleichen, kein Skip
      if (aOpen || bOpen) {
        labelsByAxis[axis].skipped++;
        continue;
      }

      const keyA = va === null ? NA : va!;
      const keyB = vb === null ? NA : vb!;
      labelsByAxis[axis].a.push(keyA);
      labelsByAxis[axis].b.push(keyB);
      if (keyA !== keyB) {
        disagreements.push({ caseId: caseA.caseId, axis, a: va ?? null, b: vb ?? null });
      }
    }
  }
  for (const caseB of b.cases) {
    if (!a.cases.some((c) => c.caseId === caseB.caseId)) unmatched.push(caseB.caseId);
  }

  const perAxis = {} as Record<TypingAxis, AxisKappaResult>;
  for (const axis of TYPING_AXES) {
    const { a: la, b: lb, skipped } = labelsByAxis[axis];
    const pairs = la.length;
    if (pairs === 0) {
      // Beide Annotatoren haben die Achse überall offen gelassen (oder nur
      // Skips) — kein Signal, kein Absturz: neutraler Nullwert statt NaN.
      perAxis[axis] = { pairs: 0, skipped, agreementRate: 0, kappa: 0, degenerate: false };
      continue;
    }
    const agree = la.filter((v, i) => v === lb[i]).length;
    perAxis[axis] = {
      pairs,
      skipped,
      agreementRate: agree / pairs,
      kappa: cohenKappaMulti(la, lb),
      degenerate: new Set(la).size === 1 || new Set(lb).size === 1,
    };
  }

  return { sharedCases, perAxis, disagreements, unmatchedCaseIds: unmatched };
}

/**
 * Blinde Kopie für Annotator B.
 *
 * WARUM (Anti-Anchoring — das ist der Zweck dieser Funktion, nicht ein
 * Detail): Das Worksheet für Annotator A füllt jede Karte mit dem
 * LLM-Vorschlag vor, weil das für A Adjudikation ist (schneller, gewollt).
 * Würde B DIESELBE vorbelegte Kopie bekommen, wären beide Annotatoren auf
 * denselben Vorschlag geankert — sie würden sich vor allem deshalb einig
 * sein, weil beide dem Modell zugestimmt haben, nicht weil sie unabhängig
 * zum selben Schluss kamen. Der gemessene Kappa wäre künstlich aufgebläht
 * und das Freeze-Gate (>= 0.6) wertlos. Darum werden hier ALLE Achsen-Werte
 * UND jede Spur des ersten Durchgangs entfernt (annotator/notes/ambiguous/
 * labeledAt) — B sieht nur Gesetzestext + die Optionslisten, genau wie A vor
 * der Vorbelegung. Wer das später "optimiert" (z. B. weil B dann ja doch
 * schneller wäre), zerstört das Gate — bitte nicht ohne Rücksprache ändern.
 */
export function makeBlindTypingCopy(set: TypingGoldenSet): TypingGoldenSet {
  return {
    ...set,
    version: `${set.version}-blind`,
    frozen: false,
    cases: set.cases.map((c) => ({
      ...c,
      labels: {
        normKind: undefined,
        bindingness: undefined,
        obligationKind: undefined,
        partyRole: undefined,
        provisionKind: undefined,
      },
      ambiguous: undefined,
      notes: undefined,
      annotator: undefined,
      labeledAt: undefined,
    })),
  };
}

// ─── CLI ────────────────────────────────────────────────────────

function main(): void {
  const [mode, arg1, arg2] = process.argv.slice(2);

  if (mode === 'blind' && arg1 && arg2) {
    const set = loadTypingGolden(path.resolve(arg1));
    const blind = makeBlindTypingCopy(set);
    fs.writeFileSync(path.resolve(arg2), JSON.stringify(blind, null, 2));
    console.log(
      `[typing-kappa] blind copy: ${blind.cases.length} cases → ${arg2}\n` +
        `[typing-kappa] Annotator B labelt alle Achsen nach RUBRIC.md (ohne A's Vorschlag/Notizen zu sehen).`,
    );
    return;
  }

  if (mode === 'compare' && arg1 && arg2) {
    const a = loadTypingGolden(path.resolve(arg1));
    const b = loadTypingGolden(path.resolve(arg2));
    const r = compareTypingSets(a, b);

    console.log(`[typing-kappa] shared cases: ${r.sharedCases}`);
    for (const axis of TYPING_AXES) {
      const ax = r.perAxis[axis];
      console.log(
        `[typing-kappa] ${axis}: pairs=${ax.pairs} skipped=${ax.skipped} ` +
          `agreement=${(ax.agreementRate * 100).toFixed(1)}% kappa=${ax.kappa.toFixed(3)}` +
          (ax.degenerate ? '  ⚠️ KONSTANT (nur eine Klasse vergeben — Kappa ohne Aussage)' : ''),
      );
    }
    if (r.unmatchedCaseIds.length > 0) {
      console.log(`[typing-kappa] not compared (only in one file): ${r.unmatchedCaseIds.join(', ')}`);
    }
    if (r.disagreements.length === 0) {
      console.log('[typing-kappa] keine Abweichungen — direkt adjudizieren/freezen.');
    } else {
      console.log(`\n[typing-kappa] ${r.disagreements.length} Abweichungen zur Adjudikation:`);
      for (const d of r.disagreements) {
        console.log(`  - ${d.caseId} · ${d.axis}: A=${d.a ?? 'n/a'} vs B=${d.b ?? 'n/a'}`);
      }
    }

    // Konstante Achsen sind vom Tor ausgenommen: ihr Kappa ist ein Artefakt,
    // kein Uneinigkeits-Signal (siehe AxisKappaResult.degenerate). Sie werden
    // aber ausdrücklich ausgewiesen, damit die Ausnahme sichtbar bleibt und
    // niemand sie später für ein bestandenes Tor hält.
    const degenerate = TYPING_AXES.filter((ax) => r.perAxis[ax].pairs > 0 && r.perAxis[ax].degenerate);
    if (degenerate.length) {
      console.log(
        `\n[kappa] ℹ️ Konstante Achsen (vom Tor ausgenommen): ${degenerate.join(', ')} — ` +
          `auf diesem Korpus ohne Varianz. Rohübereinstimmung berichten, Kappa nicht interpretieren.`,
      );
    }

    const failing = TYPING_AXES.filter(
      (ax) => r.perAxis[ax].pairs > 0 && !r.perAxis[ax].degenerate && r.perAxis[ax].kappa < 0.6,
    );
    if (failing.length) {
      console.log(`\n[kappa] ⚠️ Kappa < 0.6 auf: ${failing.join(', ')} — Rubrik schärfen, nicht das Modell tunen.`);
      process.exitCode = 1;
    }
    return;
  }

  console.error(
    'Usage:\n' +
      '  typing-kappa blind   <in.json> <out.json>   # blinde Kopie für Annotator B\n' +
      '  typing-kappa compare <a.json> <b.json>      # Kappa je Achse + Abweichungsliste',
  );
  process.exitCode = 2;
}

if (require.main === module) {
  main();
}
