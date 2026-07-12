/**
 * Operational notifications (THE-448 AC-4). Builds Slack/Teams Block Kit payloads for the
 * critical path and SLA escalations, and delivers them via a configured incoming webhook.
 *
 * Delivery degrades gracefully: no webhook configured → no-op; any error is swallowed and
 * logged. This module NEVER throws — a notification failure must not break the deterministic
 * engine (THE-448 AC-5). The outbound reply to a reporter is NOT here — that stays a
 * human-gated `reply_reporter` proposed action (Asilomar #16).
 */
import { log } from '../config/logger';

export interface NotifiableEntry {
  title: string;
  systemComponent: string;
  pScore: number;
  routingPath: string;
  severity: number;
  chainId: unknown; // ObjectId or string
}

type Block = Record<string, unknown>;

export function buildCriticalBlocks(e: NotifiableEntry): Block[] {
  return [
    { type: 'header', text: { type: 'plain_text', text: '🔴 Critical defect', emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Component:*\n${e.systemComponent}` },
        { type: 'mrkdwn', text: `*Score:*\n${e.pScore} (${e.routingPath})` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*${e.title}*` } },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Register chain \`${String(e.chainId)}\` · severity ${e.severity}` },
      ],
    },
  ];
}

export function buildEscalationBlocks(e: NotifiableEntry): Block[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⏰ SLA breached — escalation proposed', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${e.title}* on *${e.systemComponent}* (score ${e.pScore})`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Register chain \`${String(e.chainId)}\` — approve the escalation in the register (human gate).`,
        },
      ],
    },
  ];
}

export interface DeliveryResult {
  delivered: boolean;
  reason?: string;
  status?: number;
}

/**
 * Deliver Block Kit blocks to the ops channel via the `OPS_NOTIFY_WEBHOOK_URL` incoming webhook.
 * No webhook → no-op. Any error is caught. NEVER throws (THE-448 AC-5).
 */
export async function deliverBlocks(blocks: Block[]): Promise<DeliveryResult> {
  const url = process.env.OPS_NOTIFY_WEBHOOK_URL;
  if (!url) {
    log.debug('[opsNotify] no OPS_NOTIFY_WEBHOOK_URL configured — skipping delivery');
    return { delivered: false, reason: 'no webhook configured' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    return {
      delivered: res.ok,
      status: res.status,
      reason: res.ok ? undefined : `webhook responded ${res.status}`,
    };
  } catch (err) {
    log.warn({ err }, '[opsNotify] delivery failed');
    return { delivered: false, reason: 'delivery error' };
  }
}

export async function notifyCritical(e: NotifiableEntry): Promise<DeliveryResult> {
  return deliverBlocks(buildCriticalBlocks(e));
}

export async function notifyEscalation(e: NotifiableEntry): Promise<DeliveryResult> {
  return deliverBlocks(buildEscalationBlocks(e));
}
