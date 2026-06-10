/**
 * Resolves a UI `Mentor` (which may be MU/ALU/EXT) to a real `public.mentors.id`.
 * Inserts a fresh row only when no match is found.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Mentor } from "@/lib/mentor";

export async function resolveMentorDbId(mentor: Mentor): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("resolve_or_create_mentor", { p_mentor: mentor });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}
