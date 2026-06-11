import type { Mentor } from "@/lib/mentor";
import type { LmpMentorRow } from "@/lib/hooks/useLmpMentorsLive";
import { deriveInitials, pickAvatarColor } from "@/lib/avatarColors";



/** Map a joined lmp_mentors row (mentor join) into the UI `Mentor` shape. */
export function lmpMentorRowToMentor(row: LmpMentorRow): Mentor | null {
  const m = row.mentor;
  if (!m) return null;
  const source: Mentor["source"] = m.source === "MU" || m.source === "ALU" ? m.source : "EXT";
  return {
    id: m.id,
    name: m.name ?? "",
    initials: deriveInitials(m.name ?? ""),
    color: pickAvatarColor(m.id ?? m.name ?? ""),
    role: m.designation ?? m.role ?? "",
    company: m.company ?? "",
    source,
    score: Math.round(((m.rating ?? 0) as number) * 20),
    scores: { role: 0, skills: 0, company: 0, industry: 0, seniority: 0 },
    layer: "",
    decisionTags: [],
    rating: Number(m.rating ?? 0),
    reviews: 0,
    outcome: 0,
    availability: (m.availability ?? "available") as Mentor["availability"],
    email: m.email ?? "",
    phone: m.phone
      ?? (m as typeof m & { contact_number?: string | null }).contact_number
      ?? (m as typeof m & { mobile?: string | null }).mobile
      ?? (m as typeof m & { mentor_phone?: string | null }).mentor_phone
      ?? "",
    seniority: (m.seniority ?? "Mid") as Mentor["seniority"],
    linkedin: m.linkedin ?? undefined,
  };
}
