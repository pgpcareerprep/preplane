import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Star, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useFeedbackTemplate } from "@/lib/hooks/useFeedbackTemplates";
import type { FeedbackField } from "@/lib/feedbackForm";
import { cn } from "@/lib/utils";

type Candidate = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  sessionIds: string[];
  candidates: Candidate[];
  sessionLabel: string;
  mentorName: string;
  scheduledAt: string | null;
  token: string | null;
};

type FB = {
  session_id: string;
  student_id: string;
  feedback: any;
  student_rating: number | null;
  submitted_at: string | null;
};

export function StudentFeedbackDrawer({
  open,
  onClose,
  sessionIds,
  candidates,
  sessionLabel,
  mentorName,
  scheduledAt,
  token,
}: Props) {
  const { data: tpl } = useFeedbackTemplate("student");

  const { data: rows = [] } = useQuery({
    enabled: open && sessionIds.length > 0,
    queryKey: ["student-feedback-rows", sessionIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_student_feedbacks")
        .select("session_id, student_id, feedback, student_rating, submitted_at")
        .in("session_id", sessionIds);
      if (error) throw error;
      return (data ?? []) as FB[];
    },
  });

  const byStudent = useMemo(() => {
    const m = new Map<string, FB>();
    for (const r of rows) if (!m.has(r.student_id)) m.set(r.student_id, r);
    return m;
  }, [rows]);

  const link = token ? `${window.location.origin}/feedback/${token}` : null;
  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Student feedback link copied");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto bg-card">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[16px] font-semibold text-n900">
            {sessionLabel} · {mentorName}
          </SheetTitle>
          <p className="text-[12px] text-n500 mt-0.5">
            {scheduledAt ? new Date(scheduledAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
            {" · "}{candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
          </p>
        </SheetHeader>

        {link && (
          <div className="mt-4 rounded-lg border border-n200 bg-n50 px-3 py-2 flex items-center gap-2">
            <span className="text-[11.5px] text-n600 truncate flex-1" title={link}>{link}</span>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-[12px] font-medium shrink-0"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {candidates.map((c) => {
            const fb = byStudent.get(c.id);
            const submitted = !!fb;
            return (
              <div key={c.id} className="rounded-xl border border-n200 bg-card overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-n50/60 border-b border-n100">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-n800">{c.name}</span>
                    {submitted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 border border-sage-200 px-1.5 py-0.5 text-[10px] font-semibold">
                        <Check className="h-3 w-3" /> Submitted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold">
                        <Clock className="h-3 w-3" /> Pending
                      </span>
                    )}
                  </div>
                  {submitted && fb?.student_rating != null && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 text-[12px]">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="tabular-nums font-medium">{Number(fb.student_rating).toFixed(1)}</span>
                    </span>
                  )}
                </div>
                <div className="px-3.5 py-3">
                  {submitted ? (
                    <ResponseList fields={tpl?.fields ?? []} values={fb?.feedback ?? {}} />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-n500">Feedback not submitted yet.</span>
                      {link && (
                        <button
                          onClick={copyLink}
                          className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-[12px] font-medium"
                        >
                          <Copy className="h-3 w-3" /> Copy link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResponseList({ fields, values }: { fields: FeedbackField[]; values: Record<string, any> }) {
  if (!values || typeof values !== "object" || Object.keys(values).length === 0) {
    return <div className="text-[12px] text-n500">No responses captured.</div>;
  }
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  // Show fields in template order, then any extras.
  const ids = [
    ...fields.map((f) => f.id).filter((id) => id in values),
    ...Object.keys(values).filter((id) => !fieldMap.has(id)),
  ];
  return (
    <dl className="space-y-2.5">
      {ids.map((id) => {
        const f = fieldMap.get(id);
        const v = values[id];
        return (
          <div key={id}>
            <dt className="text-[11px] uppercase tracking-[0.4px] text-n500 font-medium">
              {f?.label ?? id}
            </dt>
            <dd className="text-[13px] text-n800 mt-0.5">{renderValue(f, v)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function renderValue(f: FeedbackField | undefined, v: any) {
  if (v == null || v === "") return <span className="text-n400">—</span>;
  const t = f?.type;
  if (t === "rating" && typeof v === "number") {
    return (
      <span className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn("h-3.5 w-3.5", i <= v ? "fill-amber-400 text-amber-400" : "text-n300")} />
        ))}
        <span className="ml-1 tabular-nums text-n600 text-[12px]">{v}/5</span>
      </span>
    );
  }
  if (t === "vibe" && f && "options" in f) {
    const opt = (f.options as any[]).find((o) => o.value === v);
    return <span>{opt ? `${opt.emoji} ${opt.label}` : String(v)}</span>;
  }
  if (t === "toggle") return <span>{v ? "Yes" : "No"}</span>;
  if (t === "confirm") return <span>{v ? "Confirmed" : "Not confirmed"}</span>;
  if (t === "select" && f && "options" in f) {
    const opt = (f.options as any[]).find((o) => o.value === v);
    return <span>{opt?.label ?? String(v)}</span>;
  }
  if (t === "rating_group" && v && typeof v === "object" && f && "options" in f) {
    return (
      <ul className="space-y-1">
        {(f.options as any[]).map((row) => {
          const val = v[row.key];
          return (
            <li key={row.key} className="flex items-center justify-between text-[12.5px]">
              <span className="text-n600">{row.label}</span>
              <span className="inline-flex items-center gap-0.5 text-amber-600 tabular-nums">
                {val != null ? <><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{val}/5</> : <span className="text-n400">—</span>}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (t === "toggle_group" && v && typeof v === "object" && f && "options" in f) {
    return (
      <ul className="space-y-0.5">
        {(f.options as any[]).map((row) => (
          <li key={row.key} className="flex items-center justify-between text-[12.5px]">
            <span className="text-n600">{row.label}</span>
            <span className={cn("font-medium", v[row.key] ? "text-sage-700" : "text-n400")}>
              {v[row.key] ? "Yes" : "No"}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") {
    return <pre className="whitespace-pre-wrap text-[12px] text-n700 bg-n50 rounded px-2 py-1.5">{JSON.stringify(v, null, 2)}</pre>;
  }
  return <span className="whitespace-pre-wrap">{String(v)}</span>;
}
