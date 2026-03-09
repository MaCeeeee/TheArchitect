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

export function getElementVersion(elementId: string): ElementVersion {
  if (!elementVersions.has(elementId)) {
    elementVersions.set(elementId, {
      elementId,
      version: 0,
      lastModifiedBy: '',
      lastModifiedAt: 0,
    });
  }
  return elementVersions.get(elementId)!;
}

export function resolveConflict(
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
  const current = getElementVersion(elementId);

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
const elementLocks = new Map<string, { userId: string; userName: string; lockedAt: number }>();
const LOCK_TIMEOUT = 30_000; // 30 seconds

export function lockElement(
  elementId: string,
  userId: string,
  userName: string
): { success: boolean; lockedBy?: string } {
  const existing = elementLocks.get(elementId);

  if (existing) {
    // Check if lock expired
    if (Date.now() - existing.lockedAt > LOCK_TIMEOUT) {
      elementLocks.delete(elementId);
    } else if (existing.userId !== userId) {
      return { success: false, lockedBy: existing.userName };
    }
  }

  elementLocks.set(elementId, { userId, userName, lockedAt: Date.now() });
  return { success: true };
}

export function unlockElement(elementId: string, userId: string): boolean {
  const lock = elementLocks.get(elementId);
  if (lock && lock.userId === userId) {
    elementLocks.delete(elementId);
    return true;
  }
  return false;
}

export function unlockAllForUser(userId: string): string[] {
  const unlocked: string[] = [];
  for (const [elementId, lock] of elementLocks) {
    if (lock.userId === userId) {
      elementLocks.delete(elementId);
      unlocked.push(elementId);
    }
  }
  return unlocked;
}

export function getLockedElements(): { elementId: string; userId: string; userName: string }[] {
  const now = Date.now();
  const result: { elementId: string; userId: string; userName: string }[] = [];

  for (const [elementId, lock] of elementLocks) {
    if (now - lock.lockedAt > LOCK_TIMEOUT) {
      elementLocks.delete(elementId);
    } else {
      result.push({ elementId, userId: lock.userId, userName: lock.userName });
    }
  }

  return result;
}
