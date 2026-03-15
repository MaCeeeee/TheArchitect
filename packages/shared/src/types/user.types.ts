export type UserRole =
  | 'chief_architect'
  | 'enterprise_architect'
  | 'solution_architect'
  | 'data_architect'
  | 'business_architect'
  | 'analyst'
  | 'viewer';

export type ProjectRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  bio: string;
  avatarUrl: string;
  role: UserRole;
  permissions: string[];
  mfaEnabled: boolean;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  language: string;
  timezone: string;
  notifications: {
    emailOnApproval: boolean;
    emailOnMention: boolean;
    emailOnProjectUpdate: boolean;
    inAppOnApproval: boolean;
    inAppOnMention: boolean;
    inAppOnProjectUpdate: boolean;
  };
  accessibility: {
    fontSize: 'small' | 'medium' | 'large';
    reduceMotion: boolean;
    highContrast: boolean;
  };
}

export interface Session {
  token: string;
  device: string;
  ip: string;
  lastActive: string;
}

export interface Collaborator {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  projectId: string;
  cursor?: { x: number; y: number; z: number };
}
