/**
 * Resolves a UI `Mentor` (which may be MU/ALU/EXT) to a real `public.mentors.id`.
 * Inserts a fresh row only when no match is found.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Mentor } from "@/lib/mentor";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveMentorDbId(mentor: Mentor): Promise<string | null> {
  const normEmail = (mentor.email || "").trim().toLowerCase();
  const normLinkedin = (mentor.linkedin || "").trim();

  if (UUID_RE.test(mentor.id)) {
    const { data } = await supabase.from("mentors").select("id").eq("id", mentor.id).maybeSingle();
    if (data?.id) return data.id;
  }
  if (normEmail) {
    const { data } = await supabase.from("mentors").select("id").ilike("email", normEmail).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (normLinkedin) {
    const { data } = await supabase.from("mentors").select("id").eq("linkedin", normLinkedin).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (mentor.name) {
    let q = supabase.from("mentors").select("id").ilike("name", mentor.name);
    if (mentor.company) q = q.ilike("company", mentor.company);
    const { data } = await q.limit(1).maybeSingle();
    if (data?.id) return data.id;
  }

  const payload: any = {
    name: mentor.name,
    email: normEmail || null,
    role: mentor.role || null,
    company: mentor.company || null,
    linkedin: normLinkedin || null,
    designation: mentor.role || null,
    source: (mentor.source as string) || "EXT",
    sync_source: "app_shortlist",
    availability: "available",
  };
  const ins = normEmail
    ? await supabase.from("mentors").upsert(payload, { onConflict: "email" }).select("id").maybeSingle()
    : await supabase.from("mentors").insert(payload).select("id").maybeSingle();
  if (ins.data?.id) return ins.data.id;
  if (normEmail) {
    const { data } = await supabase.from("mentors").select("id").ilike("email", normEmail).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}
