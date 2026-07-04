/**
 * Email Service — Reserved-TLD Recipient Guard (Unit Tests)
 *
 * Guards against sending real mail to reserved / non-deliverable TLDs
 * (RFC 2606 & RFC 6761). Prevents integration test registrations from
 * hard-bouncing via Resend and degrading sender reputation. See THE-397.
 *
 * Pure function — no server, DB, or SMTP required.
 *
 * Run: cd packages/server && npx jest src/__tests__/email.service.guard.test.ts --verbose
 */

import {
  isUndeliverableRecipient,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProjectInvitationEmail,
} from '../services/email.service';

describe('isUndeliverableRecipient', () => {
  describe('blocks reserved / non-deliverable TLDs', () => {
    const undeliverable = [
      'remed-admin-abc123@thearchitect-test.local',
      'roadmap-viewer@thearchitect-test.local',
      'someone@example.test',
      'user@foo.example',
      'user@bar.invalid',
      'MixedCase@Domain.LOCAL',
    ];
    it.each(undeliverable)('blocks %s', (addr) => {
      expect(isUndeliverableRecipient(addr)).toBe(true);
    });
  });

  describe('allows real, deliverable domains', () => {
    const deliverable = [
      'macee@thearchitect.site',
      'noreply@thearchitect.site',
      'customer@gmail.com',
      'person@company.de',
      'a.user@sub.domain.co.uk',
      'admin@localhost.com', // ".local" must match only as a TLD, not a substring
    ];
    it.each(deliverable)('allows %s', (addr) => {
      expect(isUndeliverableRecipient(addr)).toBe(false);
    });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(isUndeliverableRecipient('  test@thearchitect-test.local  ')).toBe(true);
  });
});

describe('send functions short-circuit on undeliverable recipients', () => {
  // Force a "configured transporter" path so we prove the guard runs BEFORE
  // any SMTP attempt (not just the dev no-transporter fallback). Bogus creds:
  // if the guard failed to short-circuit, sendMail would try to connect/throw.
  const OLD = { ...process.env };
  beforeAll(() => {
    process.env.SMTP_HOST = 'smtp.invalid.test';
    process.env.SMTP_USER = 'resend';
    process.env.SMTP_PASS = 'unused-should-never-be-reached';
  });
  afterAll(() => { process.env = OLD; });

  let logSpy: jest.SpyInstance;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('sendVerificationEmail returns true and logs skip for a .local recipient', async () => {
    await expect(sendVerificationEmail('remed-admin@thearchitect-test.local', 'tok')).resolves.toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping verification email'));
  });

  it('sendPasswordResetEmail returns true and logs skip for a .local recipient', async () => {
    await expect(sendPasswordResetEmail('user@thearchitect-test.local', 'tok')).resolves.toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping password reset email'));
  });

  it('sendProjectInvitationEmail returns true and logs skip for a .local recipient', async () => {
    await expect(
      sendProjectInvitationEmail('viewer@thearchitect-test.local', 'Alice', 'Proj', 'viewer', 'tok', 7),
    ).resolves.toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping project invitation email'));
  });
});
