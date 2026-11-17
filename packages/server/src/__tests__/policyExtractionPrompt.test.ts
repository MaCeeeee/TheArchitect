/**
 * THE-773 / REQ THE-774: Die Status-Werte im Policy-Extraktions-Prompt müssen
 * exakt dem Element-Enum entsprechen. Ein erfundener Wert wie "deprecated"
 * erzeugt Regeln, die immer (not_equals) oder nie (equals) erfüllt sind.
 */
import { ELEMENT_STATUSES } from '@thearchitect/shared';
import { buildPolicyExtractionSystemPrompt } from '../prompts/policyExtraction.prompt';

function statusValuesIn(prompt: string): string[] {
  const line = prompt.split('\n').find((l) => l.startsWith('- status values:'));
  if (!line) throw new Error('Prompt enthält keine Zeile "- status values:"');
  return [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('Policy-Extraktions-Prompt', () => {
  const prompt = buildPolicyExtractionSystemPrompt({
    architectureContext: 'CTX',
    normLabel: 'LkSG (2023)',
    sectionText: '### §1 Test\nInhalt',
  });

  it('nennt genau die Status-Werte des Element-Enums', () => {
    expect(statusValuesIn(prompt)).toEqual([...ELEMENT_STATUSES]);
  });
});
