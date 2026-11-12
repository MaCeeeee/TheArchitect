interface ChangeOperation {
  elementId: string;
  userId: string;
  timestamp: number;
  field: string;
  value: unknown;
}

interface ElementVersion {
  elementId: string;
  version: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
}

const elementVersions = new Map<string, ElementVersion>();
const pendingChanges = new Map<string, ChangeOperation[]>();

// Versionen und Locks gelten je PROJEKT: Element-Ids kommen vom Client, und
// ein Socket darf über eine fremde Id nie den Zustand eines anderen
// Mandanten berühren (Lock, Version) oder ihn sehen (locks:state).
const scoped = (projectId: string, elementId: string) => `${projectId}\u0000${elementId}`;

export function getElementVersion(projectId: string, elementId: string): ElementVersion {
  const key = scoped(projectId, elementId);
  if (!elementVersions.has(key)) {
    elementVersions.set(key, {
      elementId,
      version: 0,
      lastModifiedBy: '',
      lastModifiedAt: 0,
    });
  }
  return elementVersions.get(key)!;
}

export function resolveConflict(
  projectId: string,
  elementId: string,
  userId: string,
  changes: Record<string, unknown>,
  clientVersion?: number
): {
  accepted: boolean;
  resolvedChanges: Record<string, unknown>;
  newVersion: number;
  conflict?: { field: string; serverValue: unknown; clientValue: unknown }[];
} {
  const current = getElementVersion(projectId, elementId);

  // If client provides a version and it matches, accept directly (no conflict)
  if (clientVersion === undefined || clientVersion >= current.version) {
    current.version++;
    current.lastModifiedBy = userId;
    current.lastModifiedAt = Date.now();

    return {
      accepted: true,
      resolvedChanges: changes,
      newVersion: current.version,
    };
  }

  // Version mismatch - Last Writer Wins with notification
  current.version++;
  current.lastModifiedBy = userId;
  current.lastModifiedAt = Date.now();

  return {
    accepted: true,
    resolvedChanges: changes,
    newVersion: current.version,
    conflict: Object.entries(changes).map(([field, value]) => ({
      field,
      serverValue: undefined, // Would need element state to provide real server value
      clientValue: value,
    })),
  };
}

// Element locking
const elementLocks = new Map<string, { projectId: string; elementId: string; userId: string; userName: string; lockedAt: number }>();
const LOCK_TIMEOUT = 30_000; // 30 seconds

export function lockElement(
  projectId: string,
  elementId: string,
  userId: string,
  userName: string
): { success: boolean; lockedBy?: string } {
  const key = scoped(projectId, elementId);
  const existing = elementLocks.get(key);

  if (existing) {
    // Check if lock expired
    if (Date.now() - existing.lockedAt > LOCK_TIMEOUT) {
      elementLocks.delete(key);
    } else if (existing.userId !== userId) {
      return { success: false, lockedBy: existing.userName };
    }
  }

  elementLocks.set(key, { projectId, elementId, userId, userName, lockedAt: Date.now() });
  return { success: true };
}

export function unlockElement(projectId: string, elementId: string, userId: string): boolean {
  const key = scoped(projectId, elementId);
  const lock = elementLocks.get(key);
  if (lock && lock.userId === userId) {
    elementLocks.delete(key);
    return true;
  }
  return false;
}

/** Gibt alle Locks des Nutzers in diesem Projekt frei; liefert die Element-Ids. */
export function unlockAllForUser(projectId: string, userId: string): string[] {
  const unlocked: string[] = [];
  for (const [key, lock] of elementLocks) {
    if (lock.projectId === projectId && lock.userId === userId) {
      elementLocks.delete(key);
      unlocked.push(lock.elementId);
    }
  }
  return unlocked;
}

export function getLockedElements(projectId: string): { elementId: string; userId: string; userName: string }[] {
  const now = Date.now();
  const result: { elementId: string; userId: string; userName: string }[] = [];

  for (const [key, lock] of elementLocks) {
    if (now - lock.lockedAt > LOCK_TIMEOUT) {
      elementLocks.delete(key);
    } else if (lock.projectId === projectId) {
      result.push({ elementId: lock.elementId, userId: lock.userId, userName: lock.userName });
    }
  }

  return result;
}
