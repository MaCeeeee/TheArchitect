/**
 * requirementChain.service — die ISO-Kette als Produktions-Orchestrierung
 * (THE-561/THE-562, Phase 1 von ADR-0008; Kette nach ADR-0007).
 *
 * ── EIN CODEPFAD, ZWEI KONSUMENTEN ──
 *
 * Dieser Service ERFINDET nichts: Prompts, Parser, Singularitätstor
 * (`isSingular`/`splitByAction`), ImplFreedom-Lexikon und Fristparser
 * (`deriveDeadline`) kommen aus `@thearchitect/shared` — derselben Quelle,
 * die Lauf 4 (THE-545) getragen hat. `evaluateReqtrace` bleibt bewusst
 * unangetastet (eingefrorenes Messgerät); nur die ~30 Zeilen Schleife
 * existieren dort mit Mess-, hier mit Persistenz-Statistik.
 *
 * ── QUOTEN NIE STILL ──
 *
 * Jede Auffälligkeit wird GEZÄHLT statt geschluckt: unlesbare Extraktion
 * (Lauf-Befund), Klausel ohne Anforderung (gültiges Ergebnis!), Aufteilung
 * am Singularitätstor, Implementierungs-Bindung (mitgeführt mit Flag —
 * verworfen wird erst am Save-Gate, sonst versteckte Fehlerquote),
 * unlesbare SysReq-Transformation.
 *
 * Die Frist hängt an der KLAUSEL, nicht am transformierten Text — gemessen
 * THE-549: dsgvo:art33 trägt 2 Frist-Signale im Rohtext und 0 in den 18
 * transformierten Anforderungen.
 *
 * REIN bzgl. DB — liefert Plain-Objekte; die Persistenz macht der Save-Pfad.
 */
import {
  STAKEHOLDER_REQ_SYSTEM,
  SYSTEM_REQ_SYSTEM,
  buildStakeholderReqUserPrompt,
  buildSystemReqUserPrompt,
  parseStakeholderCandidates,
  parseSystemReq,
  isSingular,
  splitByAction,
  deriveDeadline,
  type StakeholderCandidate,
  type SystemRequirement,
  type Deadline,
} from '@thearchitect/shared';

export type AskFn = (system: string, user: string) => Promise<string>;

/** Eine Klausel, wie der Segmenter sie liefert (Snapshot-Felder). */
export interface ChainClauseInput {
  contentId: string;
  positionalId?: string;
  path?: string;
  text: string;
}

export interface ChainItem {
  clause: ChainClauseInput;
  /** Singulär — nicht-singuläre Kandidaten wurden aufgeteilt. */
  candidate: StakeholderCandidate;
  /** Aus dem KLAUSELTEXT abgeleitet; `null` = die Klausel trägt keine Frist. */
  deadline: Deadline | null;
  /** `null` = Stufe-2-Antwort unlesbar (gezählt in stats). */
  sysReq: SystemRequirement | null;
}

export interface ChainStats {
  clauses: number;
  unreadableExtractions: number;
  splitCount: number;
  clausesWithoutRequirement: number;
  implFreedomViolations: number;
  unreadableSysReqs: number;
}

export interface ChainDerivation {
  items: ChainItem[];
  stats: ChainStats;
}

export async function deriveChain(
  clauses: ChainClauseInput[],
  ctx: { ask: AskFn },
): Promise<ChainDerivation> {
  const items: ChainItem[] = [];
  const stats: ChainStats = {
    clauses: clauses.length,
    unreadableExtractions: 0,
    splitCount: 0,
    clausesWithoutRequirement: 0,
    implFreedomViolations: 0,
    unreadableSysReqs: 0,
  };

  for (const clause of clauses) {
    const raw = await ctx.ask(
      STAKEHOLDER_REQ_SYSTEM,
      buildStakeholderReqUserPrompt({ id: clause.contentId, path: clause.path ?? '', text: clause.text }),
    );
    const candidates = parseStakeholderCandidates(raw);
    if (candidates === null) {
      stats.unreadableExtractions += 1;
      continue;
    }
    if (candidates.length === 0) {
      stats.clausesWithoutRequirement += 1;
      continue;
    }

    // Frist einmal je Klausel — sie ist eine Eigenschaft des Rechtstexts,
    // nicht der einzelnen Transformation.
    const deadline = deriveDeadline(clause.text);

    for (const c of candidates) {
      const singularParts = isSingular(c) ? [c] : splitByAction(c);
      if (singularParts.length > 1) stats.splitCount += 1;

      for (let i = 0; i < singularParts.length; i++) {
        const candidate = singularParts[i];
        const sysRaw = await ctx.ask(SYSTEM_REQ_SYSTEM, buildSystemReqUserPrompt(candidate));
        // Vorläufige Herkunfts-Ref: Position im Lauf. Der Save-Pfad ersetzt
        // sie durch die echte StakeholderRequirement-Id.
        const sysReq = parseSystemReq(sysRaw, [`item:${items.length}`]);
        if (sysReq === null) stats.unreadableSysReqs += 1;
        else if (!sysReq.implementationFree) stats.implFreedomViolations += 1;
        items.push({ clause, candidate, deadline, sysReq });
      }
    }
  }

  return { items, stats };
}
