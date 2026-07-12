import crypto from 'crypto';
import mongoose from 'mongoose';
import type {
  RegisterKind,
  RegisterSource,
  RegisterStatus,
  RoutingPath,
  ScoreInput,
} from '@thearchitect/shared';
import { scoreAndRoute, urgencyFromOccurrences, slaDeadlineFrom } from '@thearchitect/shared';
import { RegisterEntry } from '../models/RegisterEntry';
import type { IRegisterEntry, ProposedAction } from '../models/RegisterEntry';
import { createAuditEntry } from '../middleware/audit.middleware';
import { notifyCritical, notifyEscalation } from './opsNotify.service';

/** Compute the SLA deadline as a Date (or null) for a given first-seen instant + routing path. */
function slaDeadlineDate(firstSeenMs: number, routingPath: RoutingPath): Date | null {
  const ms = slaDeadlineFrom(firstSeenMs, routingPath);
  return ms == null ? null : new Date(ms);
}

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

  // chainId == this first row's _id (stable logical identity for the whole WORM chain).
  const chainId = new mongoose.Types.ObjectId();
  const firstSeenMs = Date.now();

  const entry = new RegisterEntry({
    _id: chainId,
    chainId,
    firstSeenAt: new Date(firstSeenMs),
    slaDeadline: slaDeadlineDate(firstSeenMs, routingPath),
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
  // THE-448 AC-4: alert the ops channel on the critical path — fire-and-forget, never blocks.
  if (routingPath === 'critical') void notifyCritical(entry).catch(() => undefined);
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
    chainId: latest.chainId,
    firstSeenAt: latest.firstSeenAt,
    // SLA clock stays anchored on first-seen; deadline may tighten if the route escalated.
    slaDeadline: slaDeadlineDate(latest.firstSeenAt.getTime(), routingPath),
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
  // Notify only when this occurrence *escalated* the chain into the critical path.
  if (routingPath === 'critical' && latest.routingPath !== 'critical') {
    void notifyCritical(next).catch(() => undefined);
  }
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

// ─── Closed loop (THE-447) ──────────────────────────────────────────────────

/** Load the current head (latest row) of a chain by its stable chainId. */
export async function loadHead(
  projectId: string,
  chainId: string,
): Promise<IRegisterEntry | null> {
  return RegisterEntry.findOne({ projectId, chainId }).sort({ createdAt: -1, _id: -1 });
}

/** The current head (latest row) of every chain in a project, optionally filtered by kind. */
export async function chainHeads(
  projectId: string,
  kind?: RegisterKind,
): Promise<IRegisterEntry[]> {
  const match: Record<string, unknown> = {
    projectId: new mongoose.Types.ObjectId(projectId),
  };
  if (kind) match.kind = kind;
  const rows = await RegisterEntry.aggregate([
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: '$chainId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);
  return rows.map((r) => RegisterEntry.hydrate(r));
}

/**
 * Append a new WORM row that supersedes `head`, applying `changes` (status/evidence/actions).
 * Carries the stable chainId + firstSeenAt (they live in the copied base). Audits the transition.
 */
async function appendRow(
  projectId: string,
  head: IRegisterEntry,
  changes: Record<string, unknown>,
  actor: ActorContext,
  auditAction: string,
  auditAfter: Record<string, unknown>,
): Promise<IRegisterEntry> {
  const base = head.toObject() as unknown as Record<string, unknown>;
  delete base._id;
  delete base.createdAt;
  delete base.updatedAt;
  delete base.__v;

  const next = new RegisterEntry({
    ...base,
    ...changes,
    supersedes: head._id,
    createdBy: actor.userId ?? head.createdBy ?? null,
  });
  await next.save();
  await audit(actor, projectId, auditAction, head.chainId.toString(), auditAfter);
  return next;
}

export interface CloseInput {
  /** Fix evidence — the defect only resolves when tests are green. */
  testsGreen?: boolean;
  fixRef?: string;
  /** ISO instant the fix was applied; a recurrence after it blocks closure. */
  appliedAt?: string;
  note?: string;
}

export interface CloseResult {
  entry: IRegisterEntry;
  verified: boolean;
  cascade?: { incidentsClosed: number; problemResolved: boolean };
}

/**
 * Close a defect with verification (THE-447 AC-1/AC-2/AC-4). A close only succeeds when the fix
 * is verified — tests green AND no recurrence after the fix was applied. Verified → a `resolved`
 * WORM row + cascade (child incidents closed, parent problem resolved when all its defects are
 * closed). Not verified → a `reopen` WORM row with the reason. Never mutates in place.
 */
export async function closeEntry(
  projectId: string,
  chainId: string,
  input: CloseInput,
  actor: ActorContext,
): Promise<CloseResult> {
  const head = await loadHead(projectId, chainId);
  if (!head) {
    throw new RegisterNotFoundError(chainId);
  }

  const appliedAtMs = input.appliedAt ? Date.parse(input.appliedAt) : Date.now();
  const evidence = { ...((head.evidence ?? {}) as Record<string, unknown>) };
  const occurrences = Array.isArray(evidence.occurrences)
    ? (evidence.occurrences as Array<{ at?: string }>)
    : [];
  const recurredAfterFix = occurrences.some(
    (o) => o?.at && Date.parse(o.at) > appliedAtMs,
  );
  const verified = input.testsGreen === true && !recurredAfterFix;

  if (!verified) {
    const reason =
      input.testsGreen !== true
        ? 'fix not verified — tests not green'
        : 'defect recurred after the fix was applied';
    evidence.reopen = { reason, note: input.note ?? null, by: actor.userId ?? null };
    const reopened = await appendRow(
      projectId,
      head,
      { status: 'open', evidence },
      actor,
      'register.reopened',
      { chainId, reason },
    );
    return { entry: reopened, verified: false };
  }

  evidence.closure = {
    verified: true,
    fixRef: input.fixRef ?? null,
    appliedAt: input.appliedAt ?? null,
    by: actor.userId ?? null,
  };
  const resolved = await appendRow(
    projectId,
    head,
    { status: 'resolved', evidence },
    actor,
    'register.closed',
    { chainId, fixRef: input.fixRef ?? null },
  );
  const cascade = await cascadeResolve(projectId, resolved, actor);
  return { entry: resolved, verified: true, cascade };
}

/**
 * Cascade a resolved defect (THE-447 AC-2): close its still-open child incidents, then propagate
 * to the parent problem — a problem resolves once all of its child defects are resolved.
 */
async function cascadeResolve(
  projectId: string,
  resolvedDefect: IRegisterEntry,
  actor: ActorContext,
): Promise<{ incidentsClosed: number; problemResolved: boolean }> {
  // 1. child incidents linked to this defect's chain
  const childChainIds: mongoose.Types.ObjectId[] = await RegisterEntry.find({
    projectId,
    parentRef: resolvedDefect.chainId,
  }).distinct('chainId');

  let incidentsClosed = 0;
  for (const cid of childChainIds) {
    const head = await loadHead(projectId, cid.toString());
    if (head && OPEN_STATUSES.has(head.status)) {
      const evidence = { ...((head.evidence ?? {}) as Record<string, unknown>) };
      evidence.closure = {
        verified: true,
        cascadedFrom: resolvedDefect.chainId.toString(),
      };
      await appendRow(
        projectId,
        head,
        { status: 'resolved', evidence },
        actor,
        'register.cascade_closed',
        { chainId: cid.toString(), from: resolvedDefect.chainId.toString() },
      );
      incidentsClosed++;
    }
  }

  // 2. propagate to the parent problem when all its child defects are resolved
  let problemResolved = false;
  if (resolvedDefect.parentRef) {
    const problemChainId = resolvedDefect.parentRef.toString();
    const siblingChainIds: mongoose.Types.ObjectId[] = await RegisterEntry.find({
      projectId,
      parentRef: resolvedDefect.parentRef,
      kind: 'defect',
    }).distinct('chainId');
    const heads = await Promise.all(
      siblingChainIds.map((s) => loadHead(projectId, s.toString())),
    );
    const allResolved = heads.every((h) => h != null && !OPEN_STATUSES.has(h.status));
    if (allResolved) {
      const problemHead = await loadHead(projectId, problemChainId);
      if (problemHead && OPEN_STATUSES.has(problemHead.status)) {
        const evidence = { ...((problemHead.evidence ?? {}) as Record<string, unknown>) };
        evidence.closure = { verified: true, reason: 'all child defects resolved' };
        await appendRow(
          projectId,
          problemHead,
          { status: 'resolved', evidence },
          actor,
          'register.problem_resolved',
          { chainId: problemChainId },
        );
        problemResolved = true;
      }
    }
  }

  return { incidentsClosed, problemResolved };
}

export interface SlaBreach {
  chainId: string;
  slaDeadline: string | null;
  pScore: number;
  routingPath: string;
}

/**
 * Sweep for SLA-breached open entries (THE-447 AC-3). For each open chain head past its deadline
 * that has no pending escalation yet, append a WORM row proposing an `escalate` action — proposed,
 * NOT executed (Asilomar #16). Idempotent: a head already carrying a proposed escalation is
 * skipped. `nowMs` is injectable for deterministic tests.
 */
export async function sweepSla(
  projectId: string,
  actor: ActorContext,
  nowMs: number = Date.now(),
): Promise<SlaBreach[]> {
  const heads = await chainHeads(projectId);
  const breached: SlaBreach[] = [];
  for (const head of heads) {
    if (!OPEN_STATUSES.has(head.status)) continue;
    if (!head.slaDeadline) continue;
    if (head.slaDeadline.getTime() >= nowMs) continue;
    if (head.proposedActions.some((a) => a.type === 'escalate' && a.status === 'proposed')) {
      continue;
    }
    const escalateAction: ProposedAction = {
      type: 'escalate',
      description: 'SLA breached — escalate to the next tier / owner',
      requiresApproval: true,
      status: 'proposed',
    };
    const next = await appendRow(
      projectId,
      head,
      { proposedActions: [...head.proposedActions, escalateAction] },
      actor,
      'register.sla_breach',
      { chainId: head.chainId.toString(), slaDeadline: head.slaDeadline.toISOString() },
    );
    void notifyEscalation(next).catch(() => undefined); // THE-448 AC-4
    breached.push({
      chainId: head.chainId.toString(),
      slaDeadline: head.slaDeadline.toISOString(),
      pScore: head.pScore,
      routingPath: head.routingPath,
    });
  }
  return breached;
}

export interface CreateProblemInput {
  title: string;
  defectChainIds: string[];
}

/**
 * Create a systemic Problem from a confirmed defect cluster (THE-448 AC-2). This is the HUMAN
 * confirmation step — the LLM only *suggests* clusters (registerEnrichment); a person calls this
 * to actually create the problem. Each linked defect gets a WORM row with parentRef → the new
 * problem, so the slice-3 cascade resolves the problem once all its defects are resolved.
 */
export async function createProblem(
  projectId: string,
  input: CreateProblemInput,
  actor: ActorContext,
): Promise<IRegisterEntry> {
  const defectHeads = (
    await Promise.all(input.defectChainIds.map((c) => loadHead(projectId, c)))
  ).filter((d): d is IRegisterEntry => d != null && d.kind === 'defect');

  const scoreInput: ScoreInput = {
    severity: Math.max(1, ...defectHeads.map((d) => d.severity)),
    urgency: Math.max(1, ...defectHeads.map((d) => d.urgency)),
    criticality: Math.max(1, ...defectHeads.map((d) => d.criticality)),
    mitigation: 0,
  };
  const { pScore, routingPath, weightsVersion } = scoreAndRoute(scoreInput);
  const chainId = new mongoose.Types.ObjectId();
  const firstSeenMs = Date.now();

  const problem = new RegisterEntry({
    _id: chainId,
    chainId,
    firstSeenAt: new Date(firstSeenMs),
    slaDeadline: slaDeadlineDate(firstSeenMs, routingPath),
    projectId,
    kind: 'problem',
    fingerprint: crypto
      .createHash('sha256')
      .update(`problem::${input.title.trim().toLowerCase()}`)
      .digest('hex')
      .slice(0, 16),
    source: 'manual',
    systemComponent: defectHeads[0]?.systemComponent ?? 'multiple',
    environment: defectHeads[0]?.environment ?? 'production',
    title: input.title,
    severity: scoreInput.severity,
    urgency: scoreInput.urgency,
    criticality: scoreInput.criticality,
    mitigation: 0,
    pScore,
    weightsVersion,
    routingPath,
    status: 'assessed',
    evidence: { cluster: { defectChainIds: defectHeads.map((d) => d.chainId.toString()) } },
    proposedActions: [],
    createdBy: actor.userId ?? null,
  });
  await problem.save();

  for (const d of defectHeads) {
    if (d.parentRef) continue; // don't re-parent a defect that already belongs to a problem
    await appendRow(
      projectId,
      d,
      { parentRef: problem._id },
      actor,
      'register.problem_linked',
      { problemChainId: problem._id.toString(), defectChainId: d.chainId.toString() },
    );
  }
  await audit(actor, projectId, 'register.problem_created', problem._id.toString(), {
    title: input.title,
    defectCount: defectHeads.length,
  });
  return problem;
}
