/**
 * scope + lift Tests (.2 / THE-353) — Gate G5 + Semantik-Hebung.
 */
import fs from 'fs';
import path from 'path';
import { sanitizeN8nWorkflow } from '../services/wfcomp/sanitize';
import { detectGdprScope, isPiiKey } from '../services/wfcomp/scope';
import { liftCompliance, isEuDomain } from '../services/wfcomp/lift';

const FIX = path.join(__dirname, 'fixtures', 'wfcomp');
const sani = (name: string) =>
  sanitizeN8nWorkflow(JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf-8')));

describe('detectGdprScope (.2 / THE-353) — G5', () => {
  it('flags personal-data workflows true', () => {
    expect(detectGdprScope(sani('clean-compliant'))).toBe(true);
    expect(detectGdprScope(sani('missing-recipient'))).toBe(true);
    expect(detectGdprScope(sani('pindata-leak'))).toBe(true);
  });

  it('flags a no-personal-data workflow false (Art. 30 not applicable)', () => {
    expect(detectGdprScope(sani('no-personal-data'))).toBe(false);
  });

  it('isPiiKey: matches personal field names, not bucketName/operation', () => {
    expect(isPiiKey('email')).toBe(true);
    expect(isPiiKey('firstName')).toBe(true);
    expect(isPiiKey('iban')).toBe(true);
    expect(isPiiKey('bucketName')).toBe(false);
    expect(isPiiKey('operation')).toBe(false);
  });
});

describe('liftCompliance (.2 / THE-353)', () => {
  it('lifts an EU recipient + personal data_object for clean-compliant', () => {
    const g = liftCompliance(sani('clean-compliant'));
    const recipient = g.elements.find(e => e.attrs.role === 'Recipient');
    expect(recipient).toBeDefined();
    expect(recipient?.attrs.domain).toBe('api.cleverreach.de');
    expect(recipient?.attrs.thirdCountry).toBe(false); // .de = EU
    expect(g.elements.some(e => e.type === 'data_object' && e.attrs.personal === true)).toBe(true);
    // process —flow→ recipient edge exists
    const proc = g.elements.find(e => e.type === 'process')!;
    expect(g.edges.some(ed => ed.from === proc.id && ed.to === recipient!.id && ed.rel === 'flow')).toBe(true);
  });

  it('lifts NO recipient when the workflow only stores internally', () => {
    const g = liftCompliance(sani('missing-recipient'));
    expect(g.elements.some(e => e.attrs.role === 'Recipient')).toBe(false);
  });

  it('isEuDomain: .de EU, .com non-EU', () => {
    expect(isEuDomain('api.cleverreach.de')).toBe(true);
    expect(isEuDomain('api.mailchimp.com')).toBe(false);
  });
});
