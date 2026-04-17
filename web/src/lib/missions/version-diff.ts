import type { Json } from "@/lib/supabase/types";

export type DiffChange = "added" | "removed" | "changed" | "unchanged";

export type DiffEntry = {
  path: string;
  left: Json | undefined;
  right: Json | undefined;
  change: DiffChange;
};

function isPlainObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(prefix: string, key: string | number): string {
  if (prefix === "") return String(key);
  if (typeof key === "number") return `${prefix}[${key}]`;
  return `${prefix}.${key}`;
}

function jsonEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!jsonEqual(a[i] as Json, b[i] as Json)) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!jsonEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function walk(
  left: Json | undefined,
  right: Json | undefined,
  path: string,
  out: DiffEntry[],
): void {
  if (left === undefined && right === undefined) return;

  if (left === undefined) {
    out.push({ path, left: undefined, right, change: "added" });
    return;
  }
  if (right === undefined) {
    out.push({ path, left, right: undefined, change: "removed" });
    return;
  }

  const leftIsObject = isPlainObject(left);
  const rightIsObject = isPlainObject(right);
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);

  if (leftIsObject && rightIsObject) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    if (keys.length === 0) {
      out.push({ path, left, right, change: "unchanged" });
      return;
    }
    for (const key of keys) {
      walk(left[key], right[key], joinPath(path, key), out);
    }
    return;
  }

  if (leftIsArray && rightIsArray) {
    const max = Math.max(left.length, right.length);
    if (max === 0) {
      out.push({ path, left, right, change: "unchanged" });
      return;
    }
    for (let i = 0; i < max; i += 1) {
      walk(
        i < left.length ? (left[i] as Json) : undefined,
        i < right.length ? (right[i] as Json) : undefined,
        joinPath(path, i),
        out,
      );
    }
    return;
  }

  if (jsonEqual(left, right)) {
    out.push({ path, left, right, change: "unchanged" });
    return;
  }
  out.push({ path, left, right, change: "changed" });
}

export function buildVersionDiff(left: Json | undefined, right: Json | undefined): DiffEntry[] {
  const entries: DiffEntry[] = [];
  walk(left, right, "", entries);
  return entries;
}
