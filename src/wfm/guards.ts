export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

export function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readStringWithDefault(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = readString(record, key);
  return value ?? fallback;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readNumberWithDefault(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = readNumber(record, key);
  return value ?? fallback;
}

export function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readBooleanWithDefault(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = readBoolean(record, key);
  return value ?? fallback;
}

export function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined);
}

export function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function readPositiveInteger(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = readNumber(record, key);
  if (value === undefined || value < 1) return fallback;
  return Math.floor(value);
}
