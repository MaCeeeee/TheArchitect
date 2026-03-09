import axios from 'axios';

export interface OAuthProfile {
  provider: 'google' | 'github' | 'microsoft';
  providerId: string;
  email: string;
  name: string;
}

// ── Google ──────────────────────────────────────────────

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    grant_type: 'authorization_code',
  });

  const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
  });

  return {
    provider: 'google',
    providerId: profileRes.data.sub,
    email: profileRes.data.email,
    name: profileRes.data.name,
  };
}

// ── GitHub ───────────────────────────────────────────────

export async function exchangeGithubCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_CALLBACK_URL,
    },
    { headers: { Accept: 'application/json' } }
  );

  const accessToken = tokenRes.data.access_token;

  const profileRes = await axios.get('https://api.github.com/user', {
    headers: { Authorization: `token ${accessToken}` },
  });

  // GitHub may hide the primary email if set to private
  let email = profileRes.data.email;
  if (!email) {
    const emailsRes = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `token ${accessToken}` },
    });
    const primary = emailsRes.data.find(
      (e: { primary: boolean; verified: boolean; email: string }) => e.primary && e.verified
    );
    email = primary?.email;
  }

  if (!email) {
    throw new Error('GitHub account has no verified primary email address');
  }

  return {
    provider: 'github',
    providerId: String(profileRes.data.id),
    email,
    name: profileRes.data.name || profileRes.data.login,
  };
}

// ── Microsoft Entra ID ──────────────────────────────────

export async function exchangeMicrosoftCode(code: string): Promise<OAuthProfile> {
  const tenantId = process.env.ENTRA_TENANT_ID || 'common';

  const params = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID!,
    client_secret: process.env.ENTRA_CLIENT_SECRET!,
    code,
    redirect_uri: process.env.ENTRA_CALLBACK_URL!,
    grant_type: 'authorization_code',
    scope: 'openid email profile',
  });

  const tokenRes = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const profileRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
  });

  return {
    provider: 'microsoft',
    providerId: profileRes.data.id,
    email: profileRes.data.mail || profileRes.data.userPrincipalName,
    name: profileRes.data.displayName,
  };
}
