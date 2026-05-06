/**
 * Manual Reset-Token Generator
 *
 * Generates a password-reset token for a user and prints the reset URL,
 * bypassing the email service. Use when SMTP fails on production and a
 * user needs to reset their password through a side channel.
 *
 * Usage:
 *   tsx scripts/manual-reset-token.ts <user-email>
 *
 * Output: a single URL to be shared with the user via Slack/Email/etc.
 */
import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../src/models/User';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx scripts/manual-reset-token.ts <user-email>');
  process.exit(1);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.error(`User not found: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  const clientUrl = process.env.CLIENT_URL || 'https://thearchitect.site';
  const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

  console.log('\n================================================================');
  console.log(`Reset URL for ${user.email} (valid 1 hour):`);
  console.log(resetUrl);
  console.log('================================================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
