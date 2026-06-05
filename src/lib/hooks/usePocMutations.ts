import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearCachePrefix } from "@/lib/hooks/useDbData";

export type PocFormValues = {
  name: string;
  email?: string | null;
  role_type: string;
  status: "active" | "inactive";
  primary_domain?: string | null;
  domain_tags: string[];
  max_threshold: number;
  access_level?: "admin" | "allocator" | "poc";
};

const RLS_HINT = "Admin permission required to manage POCs.";

function isRlsError(err: any) {
  const m = String(err?.message ?? err ?? "").toLowerCase();
  return (
    m.includes("row-level security") ||
    m.includes("row level security") ||
    m.includes("rls") ||
    err?.code === "42501"
  );
}

function invalidatePocs(qc: ReturnType<typeof useQueryClient>) {
  // Bust module-level in-memory cache in useDbData (30s TTL) so refetch
  // doesn't short-circuit and return the pre-edit payload.
  clearCachePrefix('["db-all-poc-profiles"');
  clearCachePrefix('["db-poc-profiles"');
  clearCachePrefix('["db-poc-switcher-list"');
  clearCachePrefix('["db-poc-live-loads"');

  qc.invalidateQueries({ queryKey: ["db-all-poc-profiles"] });
  qc.invalidateQueries({ queryKey: ["db-poc-profiles"] });
  qc.invalidateQueries({ queryKey: ["db-poc-switcher-list"] });
  qc.invalidateQueries({ queryKey: ["db-poc-live-loads"] });
  qc.invalidateQueries({ queryKey: ["poc_profiles"] });
  qc.invalidateQueries({ queryKey: ["poc_registry"] });
  qc.invalidateQueries({ queryKey: ["poc-directory"] });
}

function pocDisplayPayload(values: PocFormValues) {
  const initials = values.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || values.name.slice(0, 2).toUpperCase();
  return {
    initials,
    label: values.role_type === "outreach_poc" ? "Outreach" : "Prep",
    color: "bg-orange-200 text-orange-600",
    max_threshold: values.max_threshold,
  };
}

export function useCreatePoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: PocFormValues) => {
      const { data, error } = await supabase
        .from("poc_profiles")
        .insert({
          name: values.name,
          email: values.email || null,
          role_type: values.role_type,
          status: values.status,
          primary_domain: values.primary_domain || null,
          domain_tags: values.domain_tags ?? [],
          access_level: values.access_level ?? "poc",
          ...pocDisplayPayload(values),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePocs(qc);
      toast.success("POC created");
    },
    onError: (err: any) => {
      toast.error(isRlsError(err) ? RLS_HINT : "Failed to create POC", {
        description: isRlsError(err) ? undefined : err?.message,
      });
    },
  });
}

export function useUpdatePoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      previousName,
    }: {
      id: string;
      values: PocFormValues;
      previousName?: string;
    }) => {
      const { error } = await supabase
        .from("poc_profiles")
        .update({
          name: values.name,
          email: values.email || null,
          role_type: values.role_type,
          status: values.status,
          primary_domain: values.primary_domain || null,
          domain_tags: values.domain_tags ?? [],
          access_level: values.access_level ?? "poc",
          ...pocDisplayPayload(values),
        })
        .eq("id", id);
      if (error) throw error;
      void previousName;
    },
    onSuccess: () => {
      invalidatePocs(qc);
      toast.success("POC updated");
    },
    onError: (err: any) => {
      toast.error(isRlsError(err) ? RLS_HINT : "Failed to update POC", {
        description: isRlsError(err) ? undefined : err?.message,
      });
    },
  });
}

export function useDeactivatePoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("poc_profiles")
        .update({ status: "inactive" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePocs(qc);
      toast.success("POC deactivated");
    },
    onError: (err: any) => {
      toast.error(isRlsError(err) ? RLS_HINT : "Failed to deactivate POC", {
        description: isRlsError(err) ? undefined : err?.message,
      });
    },
  });
}

export function useDeletePoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; name?: string }) => {
      const { error } = await supabase.from("poc_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePocs(qc);
      toast.success("POC deleted");
    },
    onError: (err: any) => {
      toast.error(isRlsError(err) ? RLS_HINT : "Failed to delete POC", {
        description: isRlsError(err) ? undefined : err?.message,
      });
    },
  });
}
