import crypto from 'crypto';
import type { RegisterKind, RegisterSource, RegisterStatus, ScoreInput } from '@thearchitect/shared';
import { scoreAndRoute, urgencyFromOccurrences } from '@thearchitect/shared';
import { RegisterEntry } from '../models/RegisterEntry';
import type { IRegisterEntry, ProposedAction } from '../models/RegisterEntry';
import { createAuditEntry } from '../middleware/audit.middleware';

/**
 * Operational Governance Engine service (THE-445). Orchestrates the deterministic path:
 * score → route → propose (never execute) → persist ONE WORM row → audit each step.
 */

export interface ActorContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface IngestInput {
  /** Defaults to 'defect' for slice-1 manual ingest. */
  kind?: RegisterKind;
  source: RegisterSource;
  systemComponent: string;
  environment: string;
  title: string;
  description?: string;
  stackTrace?: string;
  /** e.g. 'TypeError' — part of the stable fingerprint (THE-446 AC-2) */
  errorType?: string;
  /** upstream event id (e.g. Sentry event_id) — kept as occurrence evidence, not in the fingerprint */
  eventId?: string;
  severity: number;
  urgency: number;
  criticality: number;
  mitigation?: number;
  owner?: string;
}

export class RegisterNotFoundError extends Error {
  constructor(entryId: string) {
    super(`RegisterEntry ${entryId} not found`);
    this.name = 'RegisterNotFoundError';
  }
}

/**
 * Stable dedup fingerprint (THE-446 AC-2): hash(component + errorType + normalized top stack
 * frame). Never the free-text title alone — a reworded report of the same fault still collides.
 * The top frame is normalized (lowercased, line/column numbers stripped) so the same fault
 * survives a reformulated message AND small line shifts across releases. Deterministic
 * (sha256 hex, first 16 chars).
 */
export function computeFingerprint(input: {
  systemComponent: string;
  stackTrace?: string;
  title: string;
  errorType?: string;
}): string {
  const topFrameRaw = (input.stackTrace ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  // strip :line and :line:col so parser.ts:142 and parser.ts:150 are the same fault
  const topFrame = topFrameRaw?.toLowerCase().replace(/:\d+(:\d+)?/g, '');
  const parts = [
    input.errorType?.trim().toLowerCase(),
    topFrame ?? input.title.trim().toLowerCase(),
  ].filter(Boolean);
  const basis = `${input.systemComponent.trim().toLowerCase()}::${parts.join('::')}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

/** Statuses a new occurrence can attach to. Terminal/decided chains start a fresh defect. */
const OPEN_STATUSES: ReadonlySet<RegisterStatus> = new Set([
  'open',
  'assessed',
  'triaging',
  'mitigating',
]);

function occurrenceRecord(input: IngestInput): Record<string, unknown> {
  return {
    title: input.title,
    source: input.source,
    eventId: input.eventId ?? null,
    environment: input.environment,
    at: new Date().toISOString(),
  };
}

/** Build human-gated proposed actions from the routing path. None execute in slice 1. */
function proposeActions(routingPath: string): ProposedAction[] {
  const gate = (
    type: ProposedAction['type'],
    description: string,
  ): ProposedAction => ({ type, description, requiresApproval: true, status: 'proposed' });

  switch (routingPath) {
    case 'critical':
      return [
        gate('page_oncall', 'Page the on-call engineer'),
        gate('create_blocker', 'Create a blocker ticket'),
      ];
    case 'noise':
      return [
        gate('reject_noise', 'Reject as noise (not a defect) — needs human confirmation'),
      ];
    default:
      return [gate('create_backlog_item', 'Create a backlog item for the owning team')];
  }
}

async function audit(
  actor: ActorContext,
  projectId: string,
  action: string,
  entityId: string | undefined,
  after: Record<string, unknown>,
): Promise<void> {
  // Convention: audit is guarded by an authenticated user (mirrors regulations.routes).
  if (!actor.userId) return;
  await createAuditEntry({
    userId: actor.userId,
    projectId,
    action,
    entityType: 'RegisterEntry',
    entityId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    riskLevel: 'low',
    after,
  });
}

/**
 * Ingest one incident/defect (THE-445 AC-1/AC-3/AC-4/AC-5 + THE-446 AC-3). Body is validated
 * upstream (route zod). Dedup first: if an open chain with the same fingerprint exists, this is
 * a re-occurrence — no new defect, the chain's counter is incremented (WORM: via a new
 * superseding row). Otherwise a fresh defect is created. Score is deterministic; consequent
 * actions are proposed, not executed (human gate).
 */
export async function ingestEntry(
  projectId: string,
  input: IngestInput,
  actor: ActorContext,
): Promise<IRegisterEntry> {
  const kind = input.kind ?? 'defect';
  const fingerprint = computeFingerprint(input);

  // THE-446 AC-3: dedup against the chain head (latest row wins; WORM chains never mutate).
  const latest = await RegisterEntry.findOne({ projectId, kind, fingerprint }).sort({
    createdAt: -1,
    _id: -1,
  });
  if (latest && OPEN_STATUSES.has(latest.status)) {
    return recordOccurrence(projectId, latest, input, actor);
  }

  const scoreInput: ScoreInput = {
    severity: input.severity,
    urgency: input.urgency,
    criticality: input.criticality,
    mitigation: input.mitigation ?? 0,
  };
  const { pScore, routingPath, weightsVersion } = scoreAndRoute(scoreInput);

  await audit(actor, projectId, 'register.ingest', undefined, {
    source: input.source,
    systemComponent: input.systemComponent,
    kind,
  });
  await audit(actor, projectId, 'register.scored', undefined, {
    pScore,
    weightsVersion,
    ...scoreInput,
  });
  await audit(actor, projectId, 'register.routed', undefined, { routingPath, pScore });

  const entry = new RegisterEntry({
    projectId,
    kind,
    fingerprint,
    source: input.source,
    systemComponent: input.systemComponent,
    environment: input.environment,
    title: input.title,
    description: input.description,
    stackTrace: input.stackTrace,
    errorType: input.errorType,
    severity: input.severity,
    urgency: input.urgency,
    criticality: input.criticality,
    mitigation: input.mitigation ?? 0,
    pScore,
    weightsVersion,
    routingPath,
    status: 'assessed',
    owner: input.owner ?? null,
    evidence: { occurrences: [occurrenceRecord(input)] },
    proposedActions: proposeActions(routingPath),
    createdBy: actor.userId ?? null,
  });
  await entry.save();
  return entry;
}

/**
 * Record a re-occurrence of a known defect (THE-446 AC-3/AC-4). WORM-conform: writes a NEW row
 * that supersedes the chain head — occurrence_counter+1, urgency re-derived from the counter
 * (log2 escalation, max'd with the reported urgency), score recomputed deterministically.
 * The incoming report is linked as evidence; the chain keeps its canonical title. Human
 * decisions already taken on proposed actions are carried over by action type.
 */
async function recordOccurrence(
  projectId: string,
  latest: IRegisterEntry,
  input: IngestInput,
  actor: ActorContext,
): Promise<IRegisterEntry> {
  const occurrenceCounter = latest.occurrenceCounter + 1;
  const scoreInput: ScoreInput = {
    severity: Math.max(latest.severity, input.severity),
    urgency: Math.max(input.urgency, urgencyFromOccurrences(occurrenceCounter)),
    criticality: Math.max(latest.criticality, input.criticality),
    mitigation: input.mitigation ?? latest.mitigation,
  };
  const { pScore, routingPath, weightsVersion } = scoreAndRoute(scoreInput);

  await audit(actor, projectId, 'register.occurrence', latest._id.toString(), {
    fingerprint: latest.fingerprint,
    occurrenceCounter,
    pScore,
    routingPath,
    incomingTitle: input.title,
  });

  const evidence = (latest.evidence ?? {}) as Record<string, unknown>;
  const occurrences = Array.isArray(evidence.occurrences) ? evidence.occurrences : [];

  // re-propose for the (possibly escalated) route, but keep human decisions by action type
  const decided = new Map(
    latest.proposedActions
      .filter((a) => a.status !== 'proposed')
      .map((a) => [a.type, a.status] as const),
  );
  const proposedActions = proposeActions(routingPath).map((a) =>
    decided.has(a.type) ? { ...a, status: decided.get(a.type)! } : a,
  );

  const next = new RegisterEntry({
    projectId,
    kind: latest.kind,
    fingerprint: latest.fingerprint,
    source: input.source,
    systemComponent: latest.systemComponent,
    environment: input.environment,
    title: latest.title, // canonical first title; the incoming one lands in evidence
    description: latest.description,
    stackTrace: latest.stackTrace ?? input.stackTrace,
    errorType: latest.errorType ?? input.errorType,
    severity: scoreInput.severity,
    urgency: scoreInput.urgency,
    criticality: scoreInput.criticality,
    mitigation: scoreInput.mitigation,
    pScore,
    weightsVersion,
    routingPath,
    occurrenceCounter,
    parentRef: latest.parentRef ?? null,
    supersedes: latest._id,
    status: latest.status,
    owner: latest.owner ?? null,
    evidence: { ...evidence, occurrences: [...occurrences, occurrenceRecord(input)] },
    proposedActions,
    createdBy: actor.userId ?? latest.createdBy ?? null,
  });
  await next.save();
  return next;
}

/**
 * Human gate decision on a proposed action (THE-445 AC-4). WORM: writes a NEW row that supersedes
 * the current one, with the action marked approved/rejected. Slice 1 records the decision but does
 * NOT execute the outward action (paging/ticketing/reply wiring lands in later slices).
 */
export async function decideGate(
  projectId: string,
  entryId: string,
  actionType: string,
  decision: 'approve' | 'reject',
  actor: ActorContext,
): Promise<IRegisterEntry> {
  const current = await RegisterEntry.findOne({ _id: entryId, projectId });
  if (!current) {
    throw new RegisterNotFoundError(entryId);
  }

  const nextActions: ProposedAction[] = current.proposedActions.map((a) =>
    a.type === actionType
      ? { ...a, status: decision === 'approve' ? 'approved' : 'rejected' }
      : a,
  );
  // Confirming a 'reject_noise' proposal is the one status change slice 1 makes.
  const nextStatus =
    decision === 'approve' && actionType === 'reject_noise' ? 'noise' : current.status;

  const base = current.toObject() as unknown as Record<string, unknown>;
  delete base._id;
  delete base.createdAt;
  delete base.updatedAt;
  delete base.__v;

  const next = new RegisterEntry({
    ...base,
    supersedes: current._id,
    status: nextStatus,
    proposedActions: nextActions,
    createdBy: actor.userId ?? current.createdBy ?? null,
  });
  await next.save();

  await audit(actor, projectId, 'register.gate', entryId, {
    actionType,
    decision,
    nextStatus,
    supersededBy: next._id.toString(),
  });
  return next;
}
