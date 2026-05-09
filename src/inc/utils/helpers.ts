import { AsArray } from "../types/global";

export function toArray<R>(value: R): AsArray<R> | R {
  if (Array.isArray(value)) return value as AsArray<R>;

  if (value === null || value === undefined) return [] as AsArray<R>;
  return value;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const root = slugify(base) || "segment";
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}-${i}`)) i++;
  return `${root}-${i}`;
}

export function randomId(prefix = "seg"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
