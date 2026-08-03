/**
 * chainGenerate.service — die ISO-Kette hinter dem Generator-Endpoint
 * (THE-561/THE-562, Phase 1 von ADR-0008).
 *
 * ── PREVIEW ──
 * Regulation-Text → Segmenter (THE-560, contentId) → `deriveChain` →
 * Kandidaten fürs Modal. Zwei Regeln:
 *   1. `linkedElementIds` bleibt LEER — die Ziel-Ebene ist eine Eigenschaft
 *      der Landschaft, nicht der Handlung (THE-551, 51,2 % vs Schwelle 70 %).
 *      Das Element-Mapping bleibt eine Einzelfall-Entscheidung des Nutzers.
 *   2. Nichts verschwindet still: implementierungsgebundene und unlesbare
 *      Items fehlen in den Kandidaten, stehen aber in `stats` — die Quoten
 *      sind Teil der Antwort, nicht des Logs.
 *
 * ── PERSIST (Confirm-Zweig) ──
 * `persistChainItem` schreibt StakeholderRequirement → ChainSystemRequirement
 * (mit echter StR-Id) und liefert die `chain`-Refs für das materialisierte
 * ComplianceRequirement. `createdBy` bleibt dabei beim Confirm `'human'` —
 * der Mensch kuratiert wie bisher; die KETTEN-Herkunft trägt das
 * `chain`-Subdoc. `createdBy: 'chain'` ist dem unkuratierten Auto-Persist
 * vorbehalten (Skripte, Phase 2).
 *
 * Der Anthropic-Anschluss ist injizierbar (`ask`) — Tests laufen ohne LLM.
 */
import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import {
  segmentClauses,
  type ReqtraceArticle,
} from '../evals/reqtrace/clauseSegmenter';
import {
  deriveChain,
  type AskFn,
  type ChainItem,
  type ChainStats,
} from './requirementChain.service';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import type { Deadline, StakeholderCandidate, SystemRequirement } from '@thearchitect/shared';

export interface ChainCandidateDTO {
  title: string;
  description: string;
  priority: 'must' | 'should' | 'may';
  /** Immer leer — Element-Mapping ist eine Landschafts-Entscheidung (THE-551). */
  linkedElementIds: string[];
  chain: {
    regulationKey: string;
    clauseContentId: string;
    clausePath?: string;
    clauseText: string;
    stakeholderRequirement: {
      text: string;
      slots: { action: string; recipient: string; modality: string; condition: string };
      kind: StakeholderCandidate['kind'];
      deadline: Deadline | null;
    };
    systemRequirement: Pick<
      SystemRequirement,
      'text' | 'schutzgut' | 'verpflichteter' | 'ausloeser' | 'nachweis' | 'implementationFree'
    >;
  };
}

export interface ChainPreviewResult {
  candidates: ChainCandidateDTO[];
  stats: ChainStats;
}

/** Modalität → Priorität, mechanisch: Pflicht und Verbot binden, Erlaubnis nicht. */
function priorityFor(candidate: StakeholderCandidate): 'must' | 'should' | 'may' {
  const m = candidate.modalitaeten[0];
  if (m === 'pflicht' || m === 'verbot') return 'must';
  return 'may';
}

/** Titel aus der singulären Handlung — Zod verlangt 5..200 Zeichen. */
function titleFor(candidate: StakeholderCandidate): string {
  const action = candidate.handlungen[0] ?? '';
  const title = action.trim() || candidate.text.trim();
  return title.length >= 5 ? title.slice(0, 200) : candidate.text.trim().slice(0, 200);
}

function toCandidateDTO(item: ChainItem, regulationKey: string): ChainCandidateDTO | null {
  // Ohne lesbare Systemanforderung gibt es keine description — das Item lebt
  // nur in den Quoten (unreadableSysReqs). Implementierungsgebundene Items
  // ebenso: der Server würde sie beim Confirm ohnehin ablehnen; sie hier zu
  // zeigen hieße, den Nutzer in eine 400 laufen zu lassen.
  if (item.sysReq === null || !item.sysReq.implementationFree) return null;
  return {
    title: titleFor(item.candidate),
    description: item.sysReq.text.slice(0, 2000),
    priority: priorityFor(item.candidate),
    linkedElementIds: [],
    chain: {
      regulationKey,
      clauseContentId: item.clause.contentId,
      clausePath: item.clause.path,
      clauseText: item.clause.text,
      stakeholderRequirement: {
        text: item.candidate.text,
        slots: {
          action: item.candidate.handlungen[0] ?? '',
          recipient: item.candidate.empfaenger[0] ?? '',
          modality: item.candidate.modalitaeten[0] ?? '',
          condition: item.candidate.bedingungen[0] ?? '',
        },
        kind: item.candidate.kind,
        deadline: item.deadline,
      },
      systemRequirement: {
        text: item.sysReq.text,
        schutzgut: item.sysReq.schutzgut,
        verpflichteter: item.sysReq.verpflichteter,
        ausloeser: item.sysReq.ausloeser,
        nachweis: item.sysReq.nachweis,
        implementationFree: item.sysReq.implementationFree,
      },
    },
  };
}

export async function chainPreview(args: {
  text: string;
  source: string;
  paragraphNumber: string;
  regulationKey: string;
  ask?: AskFn;
  anthropicClient?: Anthropic;
}): Promise<ChainPreviewResult> {
  // Pseudo-Artikel: der Segmenter braucht nur source/article/fullText — die
  // übrigen ReqtraceArticle-Felder sind Fixture-Metadaten des Evals.
  const article = {
    source: args.source,
    article: args.paragraphNumber,
    fullText: args.text,
  } as unknown as ReqtraceArticle;
  const clauses = segmentClauses(article).map((c) => ({
    contentId: c.contentId,
    positionalId: c.id,
    path: c.path,
    text: c.text,
  }));

  const ask = args.ask ?? makeAnthropicAsk(args.anthropicClient);
  const derivation = await deriveChain(clauses, { ask });

  const candidates = derivation.items
    .map((item) => toCandidateDTO(item, args.regulationKey))
    .filter((c): c is ChainCandidateDTO => c !== null);

  return { candidates, stats: derivation.stats };
}

/**
 * Persistiert die Kette EINES bestätigten Kandidaten und liefert die Refs für
 * das materialisierte ComplianceRequirement. Reihenfolge StR → SysReq; kein
 * Transaktions-Anspruch — bei Teilfehler bleibt eine StR ohne SysReq zurück
 * und ist über die fehlende Rückreferenz auffindbar (Grenze, dokumentiert).
 */
export async function persistChainItem(
  projectId: mongoose.Types.ObjectId,
  chain: ChainCandidateDTO['chain'],
): Promise<{
  clauseContentId: string;
  clausePath?: string;
  stakeholderRequirementIds: mongoose.Types.ObjectId[];
  systemRequirementId: mongoose.Types.ObjectId;
}> {
  const str = await StakeholderRequirement.create({
    projectId,
    regulationKey: chain.regulationKey,
    clause: {
      contentId: chain.clauseContentId,
      path: chain.clausePath,
      text: chain.clauseText,
    },
    text: chain.stakeholderRequirement.text,
    slots: chain.stakeholderRequirement.slots,
    kind: chain.stakeholderRequirement.kind,
    ...(chain.stakeholderRequirement.deadline ? { deadline: chain.stakeholderRequirement.deadline } : {}),
  });

  const sysReq = await ChainSystemRequirement.create({
    projectId,
    text: chain.systemRequirement.text,
    schutzgut: chain.systemRequirement.schutzgut,
    verpflichteter: chain.systemRequirement.verpflichteter,
    ausloeser: chain.systemRequirement.ausloeser,
    nachweis: chain.systemRequirement.nachweis,
    stakeholderRequirementIds: [str._id],
  });

  return {
    clauseContentId: chain.clauseContentId,
    clausePath: chain.clausePath,
    stakeholderRequirementIds: [str._id as mongoose.Types.ObjectId],
    systemRequirementId: sysReq._id as mongoose.Types.ObjectId,
  };
}

/** Produktions-`ask`: derselbe Client wie REQGEN, aber je Stufe ein Aufruf. */
function makeAnthropicAsk(client?: Anthropic): AskFn {
  const anthropic =
    client ??
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  return async (system, user) => {
    const response = await anthropic.messages.create({
      model,
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: 900,
    });
    const block = response.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  };
}
