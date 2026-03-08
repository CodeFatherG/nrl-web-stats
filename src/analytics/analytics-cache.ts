/**
 * Version-based analytics cache with TTL.
 * Keyed by {type}-{teamCode}-{year} or {type}-{year}-{round}.
 * Version hash from repository data counts triggers invalidation.
 * 10-minute max TTL as safety net.
 */

interface CacheEntry<T> {
  value: T;
  version: string;
  timestamp: number;
}

const MAX_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class AnalyticsCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string, currentVersion: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > MAX_TTL_MS) {
      this.store.delete(key);
      return null;
    }

    if (entry.version !== currentVersion) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, version: string): void {
    this.store.set(key, {
      value,
      version,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
