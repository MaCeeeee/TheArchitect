import nodemailer from 'nodemailer';

const APP_NAME = 'TheArchitect';
const ACCENT = '#00ff41';
const BG_DARK = '#0a0a0a';
const BG_PANEL = '#111111';
const TEXT_PRIMARY = '#e2e8f0';
const TEXT_MUTED = '#7a8a7a';
const TEXT_DIM = '#4a5a4a';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function getClientUrl(): string {
  return process.env.CLIENT_URL || 'http://localhost:3000';
}

function getFrom(): string {
  return process.env.SMTP_FROM || `${APP_NAME} <noreply@thearchitect.site>`;
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: ${BG_DARK}; color: ${TEXT_PRIMARY}; border-radius: 12px; border: 1px solid #1a2a1a;">
      <h2 style="color: ${ACCENT}; margin: 0 0 16px 0; font-size: 20px; text-shadow: 0 0 10px rgba(0,255,65,0.3);">${APP_NAME}</h2>
      ${content}
    </div>
  `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: ${ACCENT}; color: #000000; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">${label}</a>`;
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<boolean> {
  const transporter = getTransporter();
  const verifyUrl = `${getClientUrl()}/auth/verify-email?token=${token}`;

  if (!transporter) {
    console.log(`\n[DEV] Email verification link for ${to}:\n${verifyUrl}\n`);
    return true;
  }

  await transporter.sendMail({
    from: getFrom(),
    to,
    subject: `${APP_NAME} — Verify your email`,
    html: emailWrapper(`
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: ${TEXT_MUTED};">
        Welcome to <strong style="color: ${TEXT_PRIMARY};">TheArchitect</strong>! Please verify your email address to activate your account. This link expires in <strong style="color: ${TEXT_PRIMARY};">24 hours</strong>.
      </p>
      ${ctaButton(verifyUrl, 'Verify Email')}
      <p style="margin: 24px 0 0 0; font-size: 12px; color: ${TEXT_DIM}; line-height: 1.5;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    `),
  });

  return true;
}

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
): Promise<boolean> {
  const transporter = getTransporter();
  const resetUrl = `${getClientUrl()}/reset-password?token=${resetToken}`;

  if (!transporter) {
    console.log(`\n[DEV] Password reset link for ${to}:\n${resetUrl}\n`);
    return true;
  }

  await transporter.sendMail({
    from: getFrom(),
    to,
    subject: `${APP_NAME} — Password Reset`,
    html: emailWrapper(`
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: ${TEXT_MUTED};">
        You requested a password reset. Click the button below to set a new password. This link expires in <strong style="color: ${TEXT_PRIMARY};">1 hour</strong>.
      </p>
      ${ctaButton(resetUrl, 'Reset Password')}
      <p style="margin: 24px 0 0 0; font-size: 12px; color: ${TEXT_DIM}; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
      </p>
    `),
  });

  return true;
}

export async function sendWaitlistAdminNotification(
  signup: { email: string; name?: string | null; company?: string | null; referrer?: string | null },
  totalSignups: number,
): Promise<boolean> {
  const transporter = getTransporter();
  const adminTo = process.env.WAITLIST_ADMIN_EMAIL || 'macee@thearchitect.site';

  if (!transporter) {
    console.log(`\n[DEV] Waitlist signup (would notify ${adminTo}): ${signup.email}\n`);
    return true;
  }

  const row = (label: string, value: string | null | undefined) => value
    ? `<tr><td style="padding: 4px 12px 4px 0; color: ${TEXT_DIM}; font-size: 12px;">${label}</td><td style="padding: 4px 0; color: ${TEXT_PRIMARY}; font-size: 13px;">${value}</td></tr>`
    : '';

  await transporter.sendMail({
    from: getFrom(),
    to: adminTo,
    subject: `[Waitlist] #${totalSignups} — ${signup.email}`,
    html: emailWrapper(`
      <p style="margin: 0 0 16px 0; font-size: 14px; color: ${TEXT_MUTED};">New waitlist signup (#${totalSignups}):</p>
      <div style="background: ${BG_PANEL}; border: 1px solid #1a2a1a; border-radius: 8px; padding: 16px; margin: 0 0 16px 0;">
        <table style="border-collapse: collapse; width: 100%;">
          ${row('Email', signup.email)}
          ${row('Name', signup.name)}
          ${row('Company', signup.company)}
          ${row('Referrer', signup.referrer)}
        </table>
      </div>
      <p style="margin: 0; font-size: 12px; color: ${TEXT_DIM};">Sent from thearchitect.site</p>
    `),
  });

  return true;
}

export async function sendProjectInvitationEmail(
  to: string,
  inviterName: string,
  projectName: string,
  role: string,
  token: string,
  expiresInDays: number,
): Promise<boolean> {
  const transporter = getTransporter();
  const acceptUrl = `${getClientUrl()}/invitations/${token}`;

  if (!transporter) {
    console.log(`\n[DEV] Project invitation for ${to}:\n  Project: ${projectName}\n  Role: ${role}\n  Accept: ${acceptUrl}\n`);
    return true;
  }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const ROLE_DESCRIPTIONS: Record<string, string> = {
    editor: 'You will be able to create, edit, and organize architecture elements within the project.',
    reviewer: 'You will be able to view the architecture and leave comments and reviews.',
    viewer: 'You will be able to view the architecture in read-only mode.',
  };

  const roleDesc = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.viewer;

  await transporter.sendMail({
    from: getFrom(),
    to,
    subject: `${inviterName} invited you to collaborate on "${projectName}"`,
    html: emailWrapper(`
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: ${TEXT_MUTED};">
        <strong style="color: ${TEXT_PRIMARY};">${inviterName}</strong> has invited you to join an architecture project on <strong style="color: ${TEXT_PRIMARY};">TheArchitect</strong> — a platform for visualizing, managing, and governing enterprise architecture.
      </p>
      <div style="background: ${BG_PANEL}; border: 1px solid #1a2a1a; border-radius: 8px; padding: 16px; margin: 0 0 8px 0;">
        <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: ${TEXT_PRIMARY};">${projectName}</p>
        <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">Your role: <span style="color: ${ACCENT}; font-weight: 600;">${roleLabel}</span></p>
      </div>
      <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.5; color: ${TEXT_DIM};">
        ${roleDesc}
      </p>
      ${ctaButton(acceptUrl, 'Accept Invitation')}
      <p style="margin: 24px 0 0 0; font-size: 12px; color: ${TEXT_DIM}; line-height: 1.5;">
        This invitation expires in ${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}. Click the button above to accept or decline.${' '}
        If you don't have an account yet, you'll be able to create one after clicking the link.
      </p>
      <p style="margin: 12px 0 0 0; font-size: 11px; color: ${TEXT_DIM}; line-height: 1.5;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `),
  });

  return true;
}
