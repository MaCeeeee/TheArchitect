/**
 * Security-Audit C3: die MFA-Prüfung ließ jeden Code durch, weil
 * `verifySync` ein Objekt `{ valid }` liefert und das Objekt als Boolean
 * gelesen wurde.
 *
 * otplib v13 zieht ESM-Abhängigkeiten (@scure/base), die ts-jest nicht lädt.
 * Deshalb zwei Ebenen: (1) der Vertrag der echten Bibliothek wird in einem
 * Node-Kindprozess festgenagelt, (2) der Helper läuft gegen ein Double, das
 * genau diesen Vertrag nachbildet.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const VALID_CODE = '424242';
jest.mock('otplib', () => ({
  verifySync: ({ token }: { token: string }) => ({ valid: token === '424242' }),
}));

import { isTotpCodeValid } from '../utils/totp';

describe('otplib-Vertrag (echte Bibliothek)', () => {
  it('verifySync returns an object { valid }, not a boolean — die Falle hinter C3', () => {
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        `const o = require('otplib');
         const secret = o.generateSecret();
         const wrong = o.verifySync({ token: '000000', secret });
         const right = o.verifySync({ token: o.generateSync({ secret }), secret });
         process.stdout.write(JSON.stringify({ wrong, right }));`,
      ],
      { cwd: __dirname, encoding: 'utf8' },
    );
    const { wrong, right } = JSON.parse(out);
    // Ein Objekt — also truthy, auch wenn der Code falsch ist.
    expect(typeof wrong).toBe('object');
    expect(typeof wrong.valid).toBe('boolean');
    expect(right.valid).toBe(true);
  });
});

describe('isTotpCodeValid — Security-Audit C3', () => {
  const secret = 'JBSWY3DPEHPK3PXP';

  it('accepts a valid code', () => {
    expect(isTotpCodeValid(VALID_CODE, secret)).toBe(true);
  });

  it('REJECTS a wrong code although verifySync returns a truthy object — der ganze Zweck', () => {
    expect(isTotpCodeValid('000000', secret)).toBe(false);
  });

  it.each([undefined, null, 123456, '', '12345', '1234567', 'abcdef', { valid: true }])(
    'rejects malformed input %p',
    (code) => {
      expect(isTotpCodeValid(code, secret)).toBe(false);
    },
  );

  it('no route or service calls verifySync directly — nur über isTotpCodeValid', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (entry.name.endsWith('.ts') && full !== path.join(__dirname, '..', 'utils', 'totp.ts')) {
          if (/\bverifySync\s*\(/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    walk(path.join(__dirname, '..'));
    expect(offenders).toEqual([]);
  });
});
