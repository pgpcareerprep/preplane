export type VoicePocRosterRow = {
  name: string | null;
  aliases: string[] | null;
  primary_domain: string | null;
  role_type?: string | null;
};

/** Person-name mishear mappings generated from poc_profiles.aliases (not hardcoded). */
export function buildVoiceNameNormalizationBlock(pocs: VoicePocRosterRow[]): string {
  const lines: string[] = [];
  for (const p of pocs) {
    const canonical = (p.name || "").trim();
    if (!canonical) continue;
    const canonLower = canonical.toLowerCase();
    const tokens = new Set<string>();
    if (Array.isArray(p.aliases)) {
      for (const alias of p.aliases) {
        const a = String(alias || "").trim();
        if (!a) continue;
        if (a.toLowerCase() === canonLower) continue;
        tokens.add(a);
      }
    }
    if (!tokens.size) continue;
    const shown = [...tokens].slice(0, 10);
    lines.push(`  ${shown.join(", ")} -> ${canonical}`);
  }
  if (!lines.length) return "";
  return "\n\nPOC NAME NORMALISATION (from live roster — map mishears to canonical names):\n" + lines.join("\n");
}

export function buildVoicePocRosterBlock(pocs: VoicePocRosterRow[]): string {
  const active = pocs.filter((p) => p.name && p.role_type !== "outreach_poc");
  if (!active.length) return "";
  return "\n\nPOC ROSTER (canonical names for entity resolution):\n" +
    active.map((p) => {
      const aliasNote = Array.isArray(p.aliases) && p.aliases.length
        ? `; aliases: ${p.aliases.slice(0, 6).join(", ")}`
        : "";
      return `- ${p.name}${p.primary_domain ? ` (${p.primary_domain})` : ""}${aliasNote}`;
    }).join("\n");
}
