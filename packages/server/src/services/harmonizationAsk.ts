/**
 * harmonizationAsk — der eine Anthropic-Anschluss fuer Klassifikation UND
 * Richter im Harmonisierungs-Vorschlag (THE-569). Getrennt vom Service,
 * damit dieser rein injizierbar bleibt (Tests ohne LLM).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AskFn } from './obligationAction.service';

export function makeHarmonizationAsk(client?: Anthropic): AskFn {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  return async (system, user) => {
    const response = await anthropic.messages.create({
      model,
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: 400,
    });
    const block = response.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  };
}
