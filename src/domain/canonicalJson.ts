function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const next = record[key];
      if (next !== undefined) {
        sorted[key] = sortValue(next);
      }
    }
    return sorted;
  }
  return value;
}

/** Serialize any JSON-safe object with lexicographically sorted keys for reproducible hashing. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
