import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DynamicFeedbackForm } from "@/components/feedback/DynamicFeedbackForm";
import { useFeedbackTemplate } from "@/lib/hooks/useFeedbackTemplates";
import { initialValues, validateValues } from "@/lib/feedbackForm";

type Candidate = { id: string; name: string; submitted: boolean };
type TokenValidation = {
  valid: boolean;
  reason?: "invalid_token" | "expired" | "not_found" | "already_submitted" | "error";
  sessionId?: string;
  mentorName?: string | null;
  candidates?: Candidate[];
};

export default function StudentFeedbackPage() {
  const { token = "" } = useParams();
  const { data: validation, isLoading: validating, refetch } = useQuery<TokenValidation>({
    queryKey: ["feedback-token-validation", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("validate-feedback-token", {
        body: { token },
      });
      if (error) throw error;
      return (data as TokenValidation) ?? { valid: false, reason: "error" };
    },
    staleTime: 60_000,
    retry: false,
  });

  const { data: tpl, isLoading } = useFeedbackTemplate("student");
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [studentId, setStudentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tpl) setValues(initialValues(tpl.fields));
  }, [tpl]);

  const candidates = useMemo(() => validation?.candidates ?? [], [validation]);
  const availableCount = candidates.filter((c) => !c.submitted).length;

  // Pre-select if only one available candidate
  useEffect(() => {
    if (!studentId && availableCount === 1) {
      const only = candidates.find((c) => !c.submitted);
      if (only) setStudentId(only.id);
    }
  }, [availableCount, candidates, studentId]);

  if (validating) {
    return <Shell><div className="text-white/60 text-[13px] py-8 text-center">Validating link…</div></Shell>;
  }
  if (!validation?.valid) {
    return <Shell><ExpiredState reason={validation?.reason} /></Shell>;
  }
  if (submitted) return <Shell><SuccessState remaining={availableCount - 1} onAnother={() => {
    setSubmitted(false);
    setStudentId("");
    if (tpl) setValues(initialValues(tpl.fields));
    refetch();
  }} /></Shell>;
  if (isLoading || !tpl) {
    return <Shell><div className="text-white/60 text-[13px] py-8 text-center">Loading…</div></Shell>;
  }

  const ready = !!studentId && validateValues(tpl.fields, values);
  const mentorName = validation.mentorName ?? undefined;

  const handleSubmit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-student-feedback", {
        body: { token, studentId, feedback: values },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "submit_failed");
      setSubmitted(true);
    } catch (e: any) {
      toast.error(e?.message === "already_submitted" ? "Feedback already submitted for this candidate." : `Submission failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell surface={tpl.theme.surface} mode={tpl.theme.mode}>
      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: tpl.theme.text }}>{tpl.title}</h1>
      <p className="text-[13px] mt-1 opacity-60" style={{ color: tpl.theme.text }}>
        {tpl.subtitle}
        {mentorName && <> · with {mentorName}</>}
      </p>

      {candidates.length > 0 && (
        <div className="mt-5">
          <label className="block text-[12px] font-medium opacity-70 mb-2" style={{ color: tpl.theme.text }}>
            Who is submitting feedback?
          </label>
          <div className="flex flex-col gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={c.submitted}
                onClick={() => setStudentId(c.id)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 text-[14px] transition-colors flex items-center justify-between",
                  c.submitted
                    ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5"
                    : studentId === c.id
                      ? "border-orange-400 bg-orange-500/10"
                      : "border-white/15 bg-white/[0.03] hover:bg-white/[0.06]",
                )}
                style={{ color: tpl.theme.text }}
              >
                <span>{c.name}</span>
                {c.submitted ? (
                  <span className="text-[11px] text-sage-400 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Submitted</span>
                ) : studentId === c.id ? (
                  <span className="text-[11px] text-orange-400 font-medium">Selected</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <DynamicFeedbackForm
          fields={tpl.fields}
          values={values}
          onChange={(id, v) => setValues((s) => ({ ...s, [id]: v }))}
          theme={tpl.theme.mode}
          themeOverrides={tpl.theme}
        />
      </div>

      <button
        disabled={!ready || submitting}
        onClick={handleSubmit}
        className={cn(
          "mt-5 w-full h-11 rounded-xl text-[14px] font-semibold transition-colors text-white",
          (!ready || submitting) && "opacity-50 cursor-not-allowed",
        )}
        style={ready ? { backgroundColor: tpl.theme.accent } : undefined}
      >
        {submitting ? "Submitting…" : !studentId ? "Select your name to continue" : tpl.submit_label}
      </button>
    </Shell>
  );
}

function Shell({ children, surface, mode = "dark" }: { children: React.ReactNode; surface?: string; mode?: "dark" | "light" }) {
  const isDark = mode === "dark";
  return (
    <div className={cn("min-h-screen px-4 py-8", isDark ? "bg-[#0a0a0a]" : "bg-n50")}>
      <div
        className="mx-auto max-w-[520px] rounded-2xl border shadow-xl p-6 md:p-7"
        style={{
          backgroundColor: surface ?? (isDark ? "#141414" : "#ffffff"),
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SuccessState({ remaining, onAnother }: { remaining: number; onAnother: () => void }) {
  return (
    <div className="text-center py-6">
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto h-20 w-20 rounded-full bg-sage-500/15 border-2 border-sage-400 flex items-center justify-center"
      >
        <Check className="h-10 w-10 text-sage-400" strokeWidth={3} />
      </motion.div>
      <h2 className="text-[24px] font-semibold text-white mt-5">Thank you!</h2>
      <p className="text-[14px] text-white/50 mt-2">Your feedback has been submitted.</p>
      {remaining > 0 ? (
        <button
          onClick={onAnother}
          className="mt-6 h-10 px-6 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
        >
          Submit for another candidate ({remaining} left)
        </button>
      ) : (
        <button
          onClick={() => window.close()}
          className="mt-6 h-10 px-6 rounded-md bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium transition-colors"
        >
          Close
        </button>
      )}
    </div>
  );
}

function ExpiredState({ reason }: { reason?: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    already_submitted: { title: "Feedback already submitted", body: "All candidates on this session have already submitted feedback — thank you!" },
    not_found: { title: "Link not recognised", body: "This feedback link is invalid. Please contact your career services team." },
    invalid_token: { title: "Invalid link", body: "This feedback link is malformed. Please contact your career services team." },
    error: { title: "Something went wrong", body: "We couldn't validate this link. Please try again in a moment." },
  };
  const c = copy[reason ?? ""] ?? { title: "This link has expired", body: "Please contact your career services team to request a new feedback link." };
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-16 w-16 rounded-full bg-coral-500/15 border-2 border-coral-400 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-coral-400" />
      </div>
      <h2 className="text-[20px] font-semibold text-white mt-5">{c.title}</h2>
      <p className="text-[14px] text-white/50 mt-2">{c.body}</p>
    </div>
  );
}
