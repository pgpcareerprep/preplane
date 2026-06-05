/**
 * Single source of truth for avatar background/text color tokens.
 * Used by mentor cards and any other deterministic-color avatar
 * (initials → consistent palette slot based on hash of a seed).
 */
export const AVATAR_PALETTE = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-sage-200 text-sage-600",
  "bg-yellow-200 text-yellow-600",
  "bg-plum-400/30 text-plum-400",
] as const;

export function deriveInitials(name: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function pickAvatarColor(seed: string): string {
  let h = 0;
  const s = seed ?? "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
