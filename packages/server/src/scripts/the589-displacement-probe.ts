/**
 * THE-589, die tragende Frage: Greift das Verdraengungs-Gate, wenn eine Pflicht
 * als generisches `obligated_enterprise` ankommt statt als `financial_entity`?
 * READ-ONLY, kein LLM.
 */
import { evaluateDisplacement } from '../services/displacementGate.service';

const CASES: Array<[string, { source: string; addresseeClass: string }, { source: string; addresseeClass: string }]> = [
  ['heute: DORA(financial) × NIS2(essential)',
    { source: 'dora', addresseeClass: 'financial_entity' },
    { source: 'nis2', addresseeClass: 'essential_important_entity' }],
  ['heute: DORA(financial) × NIS2(financial)',
    { source: 'dora', addresseeClass: 'financial_entity' },
    { source: 'nis2', addresseeClass: 'financial_entity' }],
  ['WEG A: DORA(obligated_enterprise) × NIS2(essential)',
    { source: 'dora', addresseeClass: 'obligated_enterprise' },
    { source: 'nis2', addresseeClass: 'essential_important_entity' }],
  ['WEG A: DORA(obligated_enterprise) × NIS2(obligated_enterprise)',
    { source: 'dora', addresseeClass: 'obligated_enterprise' },
    { source: 'nis2', addresseeClass: 'obligated_enterprise' }],
  ['WEG A: DORA(financial) × NIS2(obligated_enterprise)',
    { source: 'dora', addresseeClass: 'financial_entity' },
    { source: 'nis2', addresseeClass: 'obligated_enterprise' }],
];

console.log(`${'FALL'.padEnd(56)} GATE`);
for (const [label, a, b] of CASES) {
  const v = evaluateDisplacement(a, b);
  console.log(`${label.padEnd(56)} ${v ? `GREIFT — ${v.displaced} faellt (ueber ${v.addresseeClass})` : '❌ greift NICHT — Paar geht an den Richter'}`);
}
