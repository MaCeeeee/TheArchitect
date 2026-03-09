export type UserRole =
  | 'chief_architect'
  | 'enterprise_architect'
  | 'data_architect'
  | 'business_architect'
  | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
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
}

export interface Session {
  token: string;
  device: string;
  ip: string;
  lastActive: string;
}

export interface Collaborator {
  userId: string;
  role: UserRole;
  joinedAt: string;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  projectId: string;
  cursor?: { x: number; y: number; z: number };
}
