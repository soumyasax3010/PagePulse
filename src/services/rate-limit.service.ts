export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface ClientWindow {
  requestCount: number;
  expiresAt: number;
}

const MAX_CLEANUP_INTERVAL_MS = 60_000;

export class RateLimitService {
  private readonly clientWindows = new Map<string, ClientWindow>();
  private readonly windowMilliseconds: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly requestLimit: number,
    windowSeconds: number,
  ) {
    if (!Number.isSafeInteger(requestLimit) || requestLimit < 1) {
      throw new Error('Rate-limit request limit must be a positive integer.');
    }

    if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
      throw new Error('Rate-limit window must be a positive integer.');
    }

    this.windowMilliseconds = windowSeconds * 1000;
    this.cleanupTimer = setInterval(
      () => {
        this.removeExpiredWindows();
      },
      Math.min(this.windowMilliseconds, MAX_CLEANUP_INTERVAL_MS),
    );
    this.cleanupTimer.unref();
  }

  check(clientIp: string): RateLimitDecision {
    const now = Date.now();
    const clientWindow = this.clientWindows.get(clientIp);

    if (clientWindow === undefined || clientWindow.expiresAt <= now) {
      this.clientWindows.set(clientIp, {
        requestCount: 1,
        expiresAt: now + this.windowMilliseconds,
      });

      return {
        allowed: true,
        retryAfterSeconds: 0,
      };
    }

    if (clientWindow.requestCount >= this.requestLimit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((clientWindow.expiresAt - now) / 1000)),
      };
    }

    clientWindow.requestCount += 1;

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  private removeExpiredWindows(): void {
    const now = Date.now();

    for (const [clientIp, clientWindow] of this.clientWindows) {
      if (clientWindow.expiresAt <= now) {
        this.clientWindows.delete(clientIp);
      }
    }
  }
}
