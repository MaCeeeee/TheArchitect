/**
 * Security-Audit H10: `email.service` setzte `inviterName`/`projectName` und die
 * Wartelisten-Felder ungeprüft in Betreff und HTML. Ein Angreifer setzte
 * Profil- oder Projektnamen auf HTML, lud eine beliebige Adresse ein — und der
 * Empfänger bekam vom Angreifer verfasste Inhalte von noreply@thearchitect.site
 * mit gültigem SPF/DKIM. Die Warteliste war dafür nicht einmal angemeldet.
 */
const mockSendMail = jest.fn(async (_mail: { subject: string; html: string }) => ({}));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail: mockSendMail }) } }));

import { sendProjectInvitationEmail, sendWaitlistAdminNotification } from '../services/email.service';

const PAYLOAD = '<a href="https://evil.example/login">Your account is locked — sign in here</a><img src=x onerror=alert(1)>';

beforeAll(() => {
  process.env.SMTP_HOST = 'smtp.test';
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
});
beforeEach(() => mockSendMail.mockClear());

function lastMail() {
  return mockSendMail.mock.calls.at(-1)![0];
}

describe('Einladungs-Mail (Security-Audit H10)', () => {
  it('escapes HTML in inviter and project name — der ganze Zweck', async () => {
    await sendProjectInvitationEmail('victim@corp.com', PAYLOAD, PAYLOAD, 'viewer', 'tok', 7);
    const { html } = lastMail();
    expect(html).not.toContain('<a href="https://evil.example');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;a href=&quot;https://evil.example/login&quot;&gt;');
  });

  it('keeps the subject a single, bounded header line', async () => {
    await sendProjectInvitationEmail('victim@corp.com', 'Eve\r\nBcc: all@corp.com', 'P'.repeat(500), 'viewer', 'tok', 7);
    const { subject } = lastMail();
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(200);
  });

  it('still renders the real accept link', async () => {
    await sendProjectInvitationEmail('victim@corp.com', 'Alice', 'Core Banking', 'editor', 'tok123', 7);
    const { html } = lastMail();
    expect(html).toContain('/invitations/tok123');
    expect(html).toContain('Core Banking');
  });
});

describe('Wartelisten-Benachrichtigung (Security-Audit H10)', () => {
  it('escapes every unauthenticated field', async () => {
    await sendWaitlistAdminNotification(
      { email: 'a@b.co', name: PAYLOAD, company: PAYLOAD, referrer: PAYLOAD },
      42,
    );
    const { html } = lastMail();
    expect(html).not.toContain('<a href="https://evil.example');
    expect(html).not.toContain('<img');
  });
});
