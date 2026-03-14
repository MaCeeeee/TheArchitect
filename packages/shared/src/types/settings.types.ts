export interface NotificationPreferences {
  emailOnApproval: boolean;
  emailOnMention: boolean;
  emailOnProjectUpdate: boolean;
  inAppOnApproval: boolean;
  inAppOnMention: boolean;
  inAppOnProjectUpdate: boolean;
}

export interface AccessibilityPreferences {
  fontSize: 'small' | 'medium' | 'large';
  reduceMotion: boolean;
  highContrast: boolean;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface SessionInfo {
  id: string;
  device: string;
  ip: string;
  lastActive: string;
  current: boolean;
}

export interface OAuthProviderInfo {
  provider: 'google' | 'github' | 'microsoft';
  email: string;
  linkedAt: string;
}

export interface BillingInfo {
  plan: 'free' | 'professional' | 'enterprise';
  role: string;
  features: string[];
}

export interface ProfileData {
  name: string;
  email: string;
  bio: string;
  avatarUrl: string;
  oauthProviders: OAuthProviderInfo[];
}
