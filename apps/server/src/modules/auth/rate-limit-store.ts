export const LOGIN_RATE_LIMIT_STORE = Symbol("LOGIN_RATE_LIMIT_STORE");

export type RateLimitStore = {
  record(key: string, nowMs: number): void;
  count(key: string, nowMs: number): number;
  reset(key: string): void;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly windowSeconds: number) {}

  record(key: string, nowMs: number): void {
    const timestamps = this.prune(key, nowMs);
    timestamps.push(nowMs);
    this.entries.set(key, timestamps);
  }

  count(key: string, nowMs: number): number {
    return this.prune(key, nowMs).length;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(key: string, nowMs: number): number[] {
    const cutoff = nowMs - this.windowSeconds * 1000;
    const timestamps = (this.entries.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    this.entries.set(key, timestamps);

    return timestamps;
  }
}
