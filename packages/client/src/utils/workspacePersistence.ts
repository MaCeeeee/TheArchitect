import { workspaceAPI } from '../services/api';

import type { Workspace } from '../stores/workspaceStore';

export type NewWorkspace = Pick<Workspace, 'id' | 'name' | 'source' | 'color' | 'offsetX'>;

/** Thrown when the server did not create the workspace. Callers must not write elements afterwards. */
export class WorkspaceCreateError extends Error {
  constructor(name: string, detail: string) {
    super(`Could not create workspace "${name}" on the server (${detail}). Nothing was imported.`);
    this.name = 'WorkspaceCreateError';
  }
}

/** The server's reason for a failed request (e.g. "Workspace not found"), for user-facing error messages. */
export const serverErrorDetail = (err: unknown): string =>
  ((err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err instanceof Error ? err.message : undefined))
  ?? 'unknown error';

/**
 * Creates the workspace on the server BEFORE anything else happens (THE-775).
 * Swallowing this error (`.catch(() => {})`) let imports write elements whose workspace never existed.
 */
export async function persistNewWorkspace(projectId: string, ws: NewWorkspace): Promise<void> {
  try {
    await workspaceAPI.create(projectId, ws);
  } catch (err) {
    throw new WorkspaceCreateError(ws.name, serverErrorDetail(err));
  }
}
