export function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** Async token bucket ported from the POC: one limiter per source IP. */
export class TokenBucket {
  private readonly capacity: number;
  private tokens: number;
  private updatedAt: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ratePerSecond: number,
    burst: number,
  ) {
    if (ratePerSecond <= 0) throw new Error("ratePerSecond must be positive");
    if (burst <= 0) throw new Error("burst must be positive");
    this.capacity = burst;
    this.tokens = burst;
    this.updatedAt = performance.now();
  }

  async take(): Promise<void> {
    const previous = this.queue;
    const next = Promise.withResolvers<void>();
    this.queue = next.promise;
    await previous;
    try {
      while (true) {
        const now = performance.now();
        const elapsedSeconds = (now - this.updatedAt) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.ratePerSecond);
        this.updatedAt = now;

        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }

        const waitMs = ((1 - this.tokens) / this.ratePerSecond) * 1000;
        await delay(waitMs);
      }
    } finally {
      next.resolve();
    }
  }
}
