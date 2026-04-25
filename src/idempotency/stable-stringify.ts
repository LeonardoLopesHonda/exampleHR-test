export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (k) =>
      JSON.stringify(k) +
      ':' +
      stableStringify((value as Record<string, unknown>)[k]),
  );
  return '{' + entries.join(',') + '}';
}
