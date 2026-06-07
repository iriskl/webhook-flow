export function toJsonText(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJsonText<T = unknown>(value: string | null | undefined): T {
  if (!value) return null as T;
  return JSON.parse(value) as T;
}
