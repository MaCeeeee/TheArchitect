import nodemailer from 'nodemailer';

const APP_NAME = 'TheArchitect';

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

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
): Promise<boolean> {
  const transporter = getTransporter();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

  if (!transporter) {
    // Dev mode: log the reset link to console
    console.log(`\n[DEV] Password reset link for ${to}:\n${resetUrl}\n`);
    return true;
  }

  const from = process.env.SMTP_FROM || `${APP_NAME} <noreply@thearchitect.site>`;

  await transporter.sendMail({
    from,
    to,
    subject: `${APP_NAME} — Password Reset`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f172a; color: #e2e8f0; border-radius: 12px;">
        <h2 style="color: #7c3aed; margin: 0 0 16px 0; font-size: 20px;">${APP_NAME}</h2>
        <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
          You requested a password reset. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Reset Password
        </a>
        <p style="margin: 24px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `,
  });

  return true;
}
