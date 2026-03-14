import { create } from 'zustand';
import { settingsAPI } from '../services/api';
import type { ProfileData, ApiKeyInfo, SessionInfo, BillingInfo } from '@thearchitect/shared';

interface SettingsState {
  profile: ProfileData | null;
  preferences: Record<string, unknown> | null;
  apiKeys: ApiKeyInfo[];
  sessions: SessionInfo[];
  billing: BillingInfo | null;
  loading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  updateProfile: (data: { name?: string; bio?: string; avatarUrl?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (data: Record<string, unknown>) => Promise<void>;
  fetchSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  fetchApiKeys: () => Promise<void>;
  createApiKey: (data: { name: string; permissions?: string[]; expiresInDays?: number }) => Promise<string>;
  revokeApiKey: (keyId: string) => Promise<void>;
  fetchBilling: () => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  profile: null,
  preferences: null,
  apiKeys: [],
  sessions: [],
  billing: null,
  loading: false,
  error: null,

  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.getProfile();
      set({ profile: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  updateProfile: async (updates) => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.updateProfile(updates);
      set((s) => ({
        profile: s.profile ? { ...s.profile, ...data } : null,
        loading: false,
      }));
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ loading: true, error: null });
    try {
      await settingsAPI.changePassword(currentPassword, newPassword);
      set({ loading: false });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message;
      set({ error: message, loading: false });
      throw err;
    }
  },

  fetchPreferences: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.getPreferences();
      set({ preferences: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  updatePreferences: async (updates) => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.updatePreferences(updates);
      set({ preferences: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.getSessions();
      set({ sessions: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  revokeSession: async (sessionId) => {
    try {
      await settingsAPI.revokeSession(sessionId);
      set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== sessionId) }));
    } catch (err: unknown) {
      set({ error: (err as Error).message });
    }
  },

  fetchApiKeys: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.getApiKeys();
      set({ apiKeys: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createApiKey: async (params) => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.createApiKey(params);
      set((s) => ({
        apiKeys: [{ id: data.id, name: data.name, prefix: data.prefix, permissions: data.permissions, createdAt: data.createdAt, lastUsedAt: null, expiresAt: data.expiresAt }, ...s.apiKeys],
        loading: false,
      }));
      return data.key;
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  revokeApiKey: async (keyId) => {
    try {
      await settingsAPI.revokeApiKey(keyId);
      set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== keyId) }));
    } catch (err: unknown) {
      set({ error: (err as Error).message });
    }
  },

  fetchBilling: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await settingsAPI.getBilling();
      set({ billing: data, loading: false });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
