import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Copy, Loader2, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@/lib/session";
import { issueSessionFeedbackToken } from "@/lib/feedbackTokens";
import { DynamicFeedbackForm } from "@/components/feedback/DynamicFeedbackForm";
import { useFeedbackTemplate } from "@/lib/hooks/useFeedbackTemplates";
import { initialValues, validateValues } from "@/lib/feedbackForm";

export function POCFeedbackModal({
  open, onOpenChange, session, onComplete, dbSessionId, candidates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: Session | null;
  onComplete: (token: string) => void;
  dbSessionId?: string;
  candidates?: { name: string }[];
}) {
  const queryClient = useQueryClient();
  const { data: tpl, isLoading } = useFeedbackTemplate("poc");
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  

  useEffect(() => {
    if (open) queryClient.invalidateQueries({ queryKey: ["feedback-template", "poc"] });
  }, [open, queryClient]);

  useEffect(() => {
    if (tpl && open) {
      setValues(initialValues(tpl.fields));
      setShowErrors(false);
    }
  }, [tpl, open]);

  const requiredMet = useMemo(
    () => (tpl ? validateValues(tpl.fields, values) : false),
    [tpl, values],
  );

  const missingRequired = useMemo<string[]>(() => {
    if (!tpl) return [];
    const out: string[] = [];
    for (const f of tpl.fields) {
      if (!f.required) continue;
      const v = values[f.id];
      let filled = false;
      if (f.type === "vibe") filled = v != null;
      else if (f.type === "rating") filled = typeof v === "number" && v > 0;
      else if (f.type === "rating_group")
        filled = !!v && (f as any).options.every((o: any) => v?.[o.key] > 0);
      else if (f.type === "textarea" || f.type === "text")
        filled = typeof v === "string" && v.trim().length >= ((f as any).minChars ?? 1);
      else if (f.type === "select") filled = !!v;
      else if (f.type === "toggle" || f.type === "confirm") filled = v === true;
      else if (f.type === "toggle_group")
        filled = !!v && (f as any).options.every((o: any) => v?.[o.key] != null);
      if (!filled) out.push(f.label);
    }
    return out;
  }, [tpl, values]);

  const close = (v: boolean) => {
    if (!v) {
      setValues(tpl ? initialValues(tpl.fields) : {});
      setSubmitted(null);
      setShowErrors(false);
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!requiredMet) { setShowErrors(true); return; }
    // Derive numeric mentor_rating from rating / rating_group fields.
    const ratings: number[] = [];
    for (const f of tpl?.fields ?? []) {
      const v = (values as any)[f.id];
      if (f.type === "rating" && typeof v === "number" && v >= 1 && v <= 5) {
        ratings.push(v);
      } else if (f.type === "rating_group" && v && typeof v === "object") {
        for (const k of Object.keys(v)) {
          const n = Number(v[k]);
          if (!isNaN(n) && n >= 1 && n <= 5) ratings.push(n);
        }
      }
    }
    const mentor_rating = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : null;

    if (dbSessionId) {
      const { error } = await supabase
        .from("sessions")
        .update({ poc_feedback: JSON.stringify(values), mentor_rating })
        .eq("id", dbSessionId);
      if (error) { toast.error(`Failed to save: ${error.message}`); return; }
    }

    let t = "";
    try {
      t = dbSessionId ? await issueSessionFeedbackToken(dbSessionId) : "";
    } catch (error) {
      toast.error(`Feedback saved, but link issuance failed: ${(error as Error).message}`);
      return;
    }
    setSubmitted(t);
    onComplete(t);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[20px] font-semibold text-n900">
                {tpl?.title || (isLoading ? "Loading…" : "Session Feedback")}
              </DialogTitle>
              {tpl?.subtitle && <p className="text-[13px] text-n500 mt-1">{tpl.subtitle}</p>}
            </DialogHeader>

            {isLoading || !tpl ? (
              <div className="text-[13px] text-n500 py-6 text-center">Loading form…</div>
            ) : (
              <>
                <div
                  className="rounded-2xl border p-5 mt-2"
                  style={{
                    backgroundColor: tpl.theme.surface,
                    color: tpl.theme.text,
                    borderColor: tpl.theme.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                  }}
                >
                  <DynamicFeedbackForm
                    fields={tpl.fields}
                    values={values}
                    onChange={(id, v) => {
                      setValues((s) => ({ ...s, [id]: v }));
                      if (showErrors) setShowErrors(false);
                    }}
                    theme={tpl.theme.mode}
                    themeOverrides={tpl.theme}
                  />
                </div>

                {showErrors && missingRequired.length > 0 && (
                  <div className="mt-4 rounded-md border border-coral-200 bg-coral-50 text-coral-700 text-[12.5px] px-3 py-2">
                    Please complete the required field{missingRequired.length > 1 ? "s" : ""}: {missingRequired.join(", ")}.
                  </div>
                )}




                <button
                  onClick={submit}
                  className={cn(
                    "mt-3 w-full h-11 rounded-md text-[13px] font-medium text-white shadow-sm transition-colors bg-orange-500 hover:bg-orange-600",
                  )}
                >
                  {tpl.submit_label}
                </button>
                <button onClick={() => close(false)} className="mt-2 w-full h-9 text-[13px] text-n500 hover:text-n800">
                  Cancel
                </button>
              </>
            )}
          </>
        ) : (
          <SuccessState token={submitted} session={session} dbSessionId={dbSessionId} candidates={candidates} onClose={() => close(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuccessState({ token, session, dbSessionId, candidates, onClose }: { token: string; session: Session | null; dbSessionId?: string; candidates?: { name: string }[]; onClose: () => void }) {
  const link = `${window.location.origin}/feedback/${token}`;
  const [emailing, setEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const names = (candidates ?? []).map((c) => c.name).filter(Boolean);
  const fallbackName = session?.candidate.name ?? "";
  const displayList = names.length > 0 ? names : (fallbackName ? [fallbackName] : []);
  const formatList = (arr: string[]) => {
    if (arr.length === 0) return "the candidate";
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, 2).join(", ")} and ${arr.length - 2} other${arr.length - 2 > 1 ? "s" : ""}`;
  };
  const recipientLabel = formatList(displayList);
  const firstNames = displayList.map((n) => n.split(/\s+/)[0]).filter(Boolean);
  const greetingNames = formatList(firstNames);

  const mailtoHref = `mailto:?subject=${encodeURIComponent("Share your session feedback")}&body=${encodeURIComponent(`Hi ${greetingNames},\n\nThanks for attending the session with ${session?.mentor.name ?? "your mentor"}. Please share your feedback using the link below — it takes under a minute:\n\n${link}\n\nThank you!`)}`;

  const sendEmail = async () => {
    if (emailing || emailSent) return;
    if (!dbSessionId) {
      window.location.href = mailtoHref;
      return;
    }
    setEmailing(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-student-feedback-email", {
        body: { sessionId: dbSessionId, origin: window.location.origin },
      });
      if (error || !(data as any)?.ok) {
        const msg = (data as any)?.error || error?.message || "Email send failed";
        toast.warning(`Could not email student: ${msg}`);
      } else {
        const sent = (data as any)?.sent ?? 1;
        toast.success(`Feedback link emailed to ${sent} student${sent > 1 ? "s" : ""}`);
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 3000);
      }
    } finally {
      setEmailing(false);
    }
  };
  return (
    <div className="text-center py-4">
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto h-16 w-16 rounded-full bg-sage-50 border-2 border-sage-400 flex items-center justify-center"
      >
        <Check className="h-8 w-8 text-sage-600" strokeWidth={3} />
      </motion.div>
      <h3 className="text-[18px] font-semibold text-n900 mt-4">Student feedback link generated!</h3>
      <p className="text-[13px] text-n500 mt-1">
        Share this with {recipientLabel}
      </p>

      <div className="mt-5 flex items-center gap-2 rounded-lg bg-n100 border border-n200 p-3 min-w-0">
        <code className="flex-1 min-w-0 truncate text-left text-[12px] font-mono text-n700">{link}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}
          className="shrink-0 h-8 w-8 rounded-md bg-card border border-n200 hover:border-n300 flex items-center justify-center text-n600"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}
          className="h-10 px-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium transition-colors whitespace-nowrap"
        >
          Copy Link
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Hi ${greetingNames}, your session with ${session?.mentor.name ?? "your mentor"} is wrapped up. Please share your feedback here: ${link}\n\nIt takes under a minute. Thank you!`)}`}
          target="_blank"
          rel="noreferrer"
          className="h-10 px-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" /> WhatsApp
        </a>
        <button
          onClick={sendEmail}
          disabled={emailing}
          className="h-10 px-2 rounded-md bg-card border border-n300 hover:bg-n100 disabled:opacity-60 disabled:cursor-not-allowed text-n700 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          {emailing ? (
            <><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> Sending…</>
          ) : emailSent ? (
            <><Check className="h-3.5 w-3.5 shrink-0 text-sage-600" /> Emailed</>
          ) : (
            <><Mail className="h-3.5 w-3.5 shrink-0" /> Email</>
          )}
        </button>
      </div>

      <p className="text-[11px] text-n400 mt-3">This link expires in 30 days</p>
      <button onClick={onClose} className="mt-4 text-[13px] text-n500 hover:text-n800">Close</button>
    </div>
  );
}
