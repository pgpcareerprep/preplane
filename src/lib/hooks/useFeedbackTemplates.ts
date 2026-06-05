import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  type Audience,
  type FeedbackTemplate,
  fallbackTemplate,
  defaultTheme,
} from "@/lib/feedbackForm";

export function useFeedbackTemplate(audience: Audience) {
  return useQuery({
    queryKey: ["feedback-template", audience],
    queryFn: async (): Promise<FeedbackTemplate> => {
      const { data, error } = await supabase
        .from("feedback_form_templates")
        .select("audience,title,subtitle,submit_label,fields,theme")
        .eq("audience", audience)
        .maybeSingle();
      if (error) throw error;
      if (!data) return fallbackTemplate(audience);
      return {
        audience: data.audience as Audience,
        title: data.title ?? "",
        subtitle: data.subtitle ?? "",
        submit_label: data.submit_label ?? "Submit",
        fields: (data.fields as any) ?? [],
        theme: ((data as any).theme as any) ?? defaultTheme(audience),
      };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useSaveFeedbackTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: FeedbackTemplate) => {
      const { error } = await supabase
        .from("feedback_form_templates")
        .upsert(
          {
            audience: tpl.audience,
            title: tpl.title,
            subtitle: tpl.subtitle,
            submit_label: tpl.submit_label,
            fields: tpl.fields as any,
            theme: tpl.theme as any,
          },
          { onConflict: "audience" },
        );
      if (error) throw error;
      return tpl;
    },
    onSuccess: (tpl) => {
      qc.invalidateQueries({ queryKey: ["feedback-template", tpl.audience] });
      qc.refetchQueries({ queryKey: ["feedback-template", tpl.audience] });
      toast({ title: "Form saved", description: `${tpl.audience === "student" ? "Student" : "POC"} feedback form updated.` });
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });
}
