export type PageCacheEntry<T> = {
  identity: string;
  menuId: number;
  value: T;
};

export class PageCacheStore<T> {
  readonly #capacity: number;
  readonly #entries = new Map<string, PageCacheEntry<T>>();

  constructor(capacity = 10) {
    this.#capacity = capacity;
  }

  upsert(entry: PageCacheEntry<T>): void {
    this.#entries.delete(entry.identity);
    this.#entries.set(entry.identity, entry);

    while (this.#entries.size > this.#capacity) {
      const oldestIdentity = this.#entries.keys().next().value;

      if (oldestIdentity === undefined) {
        return;
      }

      this.#entries.delete(oldestIdentity);
    }
  }

  retain(predicate: (entry: PageCacheEntry<T>) => boolean): void {
    for (const [identity, entry] of this.#entries) {
      if (!predicate(entry)) {
        this.#entries.delete(identity);
      }
    }
  }

  clear(): void {
    this.#entries.clear();
  }

  values(): PageCacheEntry<T>[] {
    return [...this.#entries.values()];
  }
}

export function toPageCacheIdentity(
  menuId: number,
  params: Readonly<Record<string, unknown>>,
): string {
  return `${menuId}:${stableSerialize(params)}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}
