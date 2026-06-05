import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GuideManual = {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  updated_at: string;
};

export type GuideNode = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "link";
  name: string;
  url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const MANUAL_KEY = ["lmp-guide", "manual"] as const;
const NODES_KEY = ["lmp-guide", "nodes"] as const;

export function useGuideManual() {
  return useQuery({
    queryKey: MANUAL_KEY,
    queryFn: async (): Promise<GuideManual | null> => {
      const { data, error } = await supabase
        .from("lmp_guide_manual" as any)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return ((data as unknown) as GuideManual | null) ?? null;
    },
  });
}

export function useSaveManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; url: string; description?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        title: input.title,
        url: input.url,
        description: input.description ?? null,
        updated_by: u?.user?.id ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from("lmp_guide_manual" as any).update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lmp_guide_manual" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MANUAL_KEY }),
  });
}

export function useGuideNodes() {
  return useQuery({
    queryKey: NODES_KEY,
    queryFn: async (): Promise<GuideNode[]> => {
      const { data, error } = await supabase
        .from("lmp_guide_nodes" as any)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as GuideNode[]) ?? [];
    },
  });
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { parent_id: string | null; kind: "folder" | "link"; name: string; url?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("lmp_guide_nodes" as any).insert({
        parent_id: input.parent_id,
        kind: input.kind,
        name: input.name,
        url: input.kind === "link" ? (input.url ?? null) : null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; url?: string | null }) => {
      const patch: Record<string, any> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.url !== undefined) patch.url = input.url;
      const { error } = await supabase.from("lmp_guide_nodes" as any).update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lmp_guide_nodes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}
