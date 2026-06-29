/** Parse final_converted_names from LMP rows into display names. */
const CONVERTED_NAME_JUNK = new Set(["", "-", "--", "na", "n/a", "nil", "none", "tbd", "n.a."]);

export function parseConvertedNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0 && !CONVERTED_NAME_JUNK.has(s.toLowerCase()));
}

export function normalizeConvertedName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}
