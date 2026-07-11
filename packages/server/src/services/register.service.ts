import crypto from 'crypto';
import type { RegisterKind, RegisterSource, ScoreInput } from '@thearchitect/shared';
import { scoreAndRoute } from '@thearchitect/shared';
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
 * Stable dedup fingerprint. Derived from the affected component + an error signature (top
 * stacktrace frame, else the title), NOT the free-text title alone — so a reworded report of the
 * same fault still collides. Deterministic (sha256 hex, first 16 chars). Full stacktrace-frame
 * normalization is refined in REQ-.2 (Sentry).
 */
export function computeFingerprint(input: {
  systemComponent: string;
  stackTrace?: string;
  title: string;
}): string {
  const topFrame = (input.stackTrace ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const signature = topFrame ?? input.title.trim().toLowerCase();
  const basis = `${input.systemComponent.trim().toLowerCase()}::${signature}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
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
 * Ingest one incident/defect (THE-445 AC-1/AC-3/AC-4/AC-5). Body is validated upstream (route
 * zod). Score is deterministic; consequent actions are proposed, not executed (human gate).
 * Persists exactly one WORM row and audits ingest/score/route.
 */
export async function ingestEntry(
  projectId: string,
  input: IngestInput,
  actor: ActorContext,
): Promise<IRegisterEntry> {
  const kind = input.kind ?? 'defect';
  const scoreInput: ScoreInput = {
    severity: input.severity,
    urgency: input.urgency,
    criticality: input.criticality,
    mitigation: input.mitigation ?? 0,
  };
  const { pScore, routingPath, weightsVersion } = scoreAndRoute(scoreInput);
  const fingerprint = computeFingerprint(input);

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
    severity: input.severity,
    urgency: input.urgency,
    criticality: input.criticality,
    mitigation: input.mitigation ?? 0,
    pScore,
    weightsVersion,
    routingPath,
    status: 'assessed',
    owner: input.owner ?? null,
    evidence: {},
    proposedActions: proposeActions(routingPath),
    createdBy: actor.userId ?? null,
  });
  await entry.save();
  return entry;
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
