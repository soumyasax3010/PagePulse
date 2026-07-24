export interface CacheHit<T> {
  value: T;
  ageSeconds: number;
}

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
}

const MAX_CLEANUP_INTERVAL_MS = 60_000;

export class InMemoryCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMilliseconds: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(ttlSeconds: number) {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('Cache TTL must be a positive integer.');
    }

    this.ttlMilliseconds = ttlSeconds * 1000;
    this.cleanupTimer = setInterval(
      () => {
        this.removeExpiredEntries();
      },
      Math.min(this.ttlMilliseconds, MAX_CLEANUP_INTERVAL_MS),
    );
    this.cleanupTimer.unref();
  }

  get(key: string): CacheHit<T> | null {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return null;
    }

    const now = Date.now();

    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }

    return {
      value: entry.value,
      ageSeconds: Math.floor((now - entry.createdAt) / 1000),
    };
  }

  set(key: string, value: T): void {
    const createdAt = Date.now();

    this.entries.set(key, {
      value,
      createdAt,
      expiresAt: createdAt + this.ttlMilliseconds,
    });
  }

  private removeExpiredEntries(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
