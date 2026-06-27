/**
 * inferLegalFields Tests (.3 / THE-354) — Tier-A-Guards, LLM gemockt.
 * Prüft, dass die Pipeline JEDEN LLM-Output sicher behandelt (nicht: ob Haiku gut ist → Tier B / THE-363).
 */
import fs from 'fs';
import path from 'path';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';
import {
  inferLegalFields,
  parseAndGuard,
  isConcise,
  isVacuous,
  isGrounded,
} from '../services/wfcomp/inference';

const FIX = path.join(__dirname, 'fixtures', 'wfcomp');
const clean = sanitizeN8nWorkflow(
  JSON.parse(fs.readFileSync(path.join(FIX, 'clean-compliant.json'), 'utf-8')),
);

function mockAnthropic(responseText: string) {
  return {
    messages: { create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: responseText }] }) },
  } as any;
}
const resp = (suggestions: unknown[]) => JSON.stringify({ suggestions });

describe('Tier-A guards (deterministic)', () => {
  it('isConcise: ≤140 chars + ≤1 sentence', () => {
    expect(isConcise('Manage newsletter subscriptions')).toBe(true);
    expect(isConcise('a'.repeat(141))).toBe(false);
    expect(isConcise('One thing. Two things. Three.')).toBe(false);
  });

  it('isVacuous: rejects boilerplate', () => {
    expect(isVacuous('data processing')).toBe(true);
    expect(isVacuous('automation')).toBe(true);
    expect(isVacuous('Manage newsletter subscriptions')).toBe(false);
  });

  it('isGrounded: references real workflow concepts only', () => {
    expect(isGrounded('Manage newsletter subscriptions for subscribers', clean)).toBe(true);
    expect(isGrounded('Payroll processing for tax authorities', clean)).toBe(false);
  });
});

describe('parseAndGuard — drops bad suggestions (→ field stays ask)', () => {
  it('keeps a grounded, confident, concise suggestion', () => {
    const out = parseAndGuard(
      resp([{ litera: 'b', value: 'Manage newsletter subscriptions for subscribers', confidence: 0.85, rationale: 'signup → cleverreach' }]),
      clean,
    );
    expect(out).toHaveLength(1);
    expect(out[0].litera).toBe('b');
    expect(out[0].provenance).toBe('ai_generated');
  });

  it('G6: drops low-confidence (abstain on ambiguity)', () => {
    const out = parseAndGuard(
      resp([{ litera: 'b', value: 'Manage newsletter subscriptions', confidence: 0.3, rationale: 'unsure' }]),
      clean,
    );
    expect(out).toHaveLength(0);
  });

  it('G6/grounding: drops an ungrounded (hallucinated) purpose', () => {
    const out = parseAndGuard(
      resp([{ litera: 'b', value: 'Payroll processing for tax authorities', confidence: 0.95, rationale: 'invented' }]),
      clean,
    );
    expect(out).toHaveLength(0);
  });

  it('conciseness: drops a verbose suggestion', () => {
    const verbose = 'Manage newsletter subscriptions for subscribers '.repeat(4); // >140
    const out = parseAndGuard(resp([{ litera: 'b', value: verbose, confidence: 0.9, rationale: 'x' }]), clean);
    expect(out).toHaveLength(0);
  });

  it('vacuous: drops boilerplate', () => {
    const out = parseAndGuard(resp([{ litera: 'b', value: 'data processing', confidence: 0.9, rationale: 'x' }]), clean);
    expect(out).toHaveLength(0);
  });

  it('keeps at most one suggestion per field', () => {
    const out = parseAndGuard(
      resp([
        { litera: 'b', value: 'Manage newsletter subscriptions', confidence: 0.9, rationale: 'a' },
        { litera: 'b', value: 'Newsletter signup handling', confidence: 0.8, rationale: 'b' },
      ]),
      clean,
    );
    expect(out.filter(s => s.litera === 'b')).toHaveLength(1);
  });
});

describe('inferLegalFields (mock client integration)', () => {
  it('returns guarded suggestions from a mocked LLM', async () => {
    const client = mockAnthropic(
      resp([
        { litera: 'b', value: 'Manage newsletter subscriptions for subscribers', confidence: 0.85, rationale: 'r' },
        { litera: 'c', value: 'Newsletter subscribers', confidence: 0.8, rationale: 'r' },
      ]),
    );
    const out = await inferLegalFields(clean, { anthropicClient: client });
    expect(out.map(s => s.litera).sort()).toEqual(['b', 'c']);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });
});
