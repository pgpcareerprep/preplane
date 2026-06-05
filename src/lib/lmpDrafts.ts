import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { ParsedJD } from "@/components/lmp/wizard/AIPreviewPanel";
import type { Candidate } from "@/lib/lmpProcessMutations";

export type LmpDraft = {
  id: string;
  created_by: string;
  created_by_name: string | null;
  step: number;
  company: string | null;
  role: string | null;
  domain: string | null;
  type: string | null;
  jd_text: string | null;
  jd_file_name: string | null;
  selected_candidates: Candidate[];
  parsed_jd: ParsedJD | null;
  selection: any | null;
  created_at: string;
  updated_at: string;
};

export type DraftPayload = {
  step: number;
  company?: string | null;
  role?: string | null;
  domain?: string | null;
  type?: string | null;
  jd_text?: string | null;
  jd_file_name?: string | null;
  selected_candidates?: Candidate[];
  parsed_jd?: ParsedJD | null;
  selection?: any | null;
  created_by_name?: string | null;
};

export async function listDrafts(): Promise<LmpDraft[]> {
  const { data, error } = await supabase
    .from("lmp_process_drafts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LmpDraft[];
}

export async function getDraft(id: string): Promise<LmpDraft | null> {
  const { data, error } = await supabase
    .from("lmp_process_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LmpDraft) ?? null;
}

export async function saveDraft(payload: DraftPayload, draftId?: string | null): Promise<string> {
  const row = {
    step: payload.step,
    company: payload.company ?? null,
    role: payload.role ?? null,
    domain: payload.domain ?? null,
    type: payload.type ?? "Full Time",
    jd_text: payload.jd_text ?? null,
    jd_file_name: payload.jd_file_name ?? null,
    selected_candidates: (payload.selected_candidates ?? []) as any,
    parsed_jd: (payload.parsed_jd ?? null) as any,
    selection: (payload.selection ?? null) as any,
    created_by_name: payload.created_by_name ?? null,
  };

  if (draftId) {
    const { data, error } = await supabase
      .from("lmp_process_drafts")
      .update(row)
      .eq("id", draftId)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  const { data, error } = await supabase
    .from("lmp_process_drafts")
    .insert({ ...row, created_by: uid })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from("lmp_process_drafts").delete().eq("id", id);
  if (error) throw error;
}

export function useDrafts() {
  return useQuery({
    queryKey: ["lmp-drafts"],
    queryFn: listDrafts,
    staleTime: 30_000,
  });
}
