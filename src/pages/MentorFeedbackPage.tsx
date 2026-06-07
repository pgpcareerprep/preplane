import { useState, useEffect } from "react";
import { MessageSquare, Star, Loader2, CheckCircle2, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { useQueryClient } from "@tanstack/react-query";

type SessionRow = {
  id: string;
  lmp_id: string;
  session_type: string | null;
  scheduled_at: string | null;
  status: string;
  poc_feedback: any;
  mentor_rating: number | null;
  mentors: { id: string; name: string } | null;
  lmp_processes: { company: string; role: string } | null;
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
        >
          <Star
            className={cn(
              "h-6 w-6 transition-colors",
              (hover || value) >= star
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-n300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function SessionFeedbackCard({ session, onDone }: { session: SessionRow; onDone: () => void }) {
  const [rating, setRating] = useState(session.mentor_rating ?? 0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!rating) { toast.error("Please provide a rating"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({
        mentor_rating: rating,
        poc_feedback: { rating, notes: notes.trim() || null, submitted_at: new Date().toISOString() },
      })
      .eq("id", session.id);
    setSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success("Feedback submitted");
    onDone();
  };

  const mentorName = session.mentors?.name ?? "Unassigned mentor";
  const lmpLabel = session.lmp_processes
    ? `${session.lmp_processes.company} — ${session.lmp_processes.role}`
    : session.lmp_id;

  return (
    <div className="rounded-2xl border border-n200 bg-card shadow-sm p-5 space-y-4">
      <div>
        <div className="text-[15px] font-semibold text-n900">{mentorName}</div>
        <div className="text-[12px] text-n500 mt-0.5">{lmpLabel}</div>
        {session.scheduled_at && (
          <div className="text-[12px] text-n400 mt-0.5">
            {new Date(session.scheduled_at).toLocaleString(undefined, {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[13px] font-medium text-n700 mb-2">Mentor rating</label>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div>
        <label className="block text-[13px] font-medium text-n700 mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Session quality, areas for improvement, follow-up needed…"
          className="w-full rounded-lg border border-n200 bg-card px-3 py-2 text-[13px] text-n800 focus:outline-none focus:border-orange-300 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !rating}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        Submit feedback
      </button>
    </div>
  );
}

export default function MentorFeedbackPage() {
  const { user } = useRole();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sessions")
      .select("id, lmp_id, session_type, scheduled_at, status, poc_feedback, mentor_rating, mentors:mentors(id,name), lmp_processes:lmp_processes(company,role)")
      .eq("status", "completed")
      .is("poc_feedback", null)
      .order("scheduled_at", { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast.error("Failed to load sessions"); return; }
    setSessions((data ?? []) as SessionRow[]);
  };

  useEffect(() => { load(); }, []);

  // Realtime: refresh when sessions change
  useEffect(() => {
    const ch = supabase
      .channel("mentor-feedback-page-rt")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "sessions" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-n400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" strokeWidth={1.5} />
            Mentor Feedback
          </h3>
          <p className="text-[13px] text-n500 mt-1">
            Submit your feedback for completed sessions where a mentor attended.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-n200 bg-card text-[12px] font-medium text-n700 hover:border-n300 disabled:opacity-40"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-n300 bg-card p-12 text-center">
          <MessageSquare className="h-8 w-8 text-n300 mx-auto mb-3" strokeWidth={1} />
          <p className="text-[14px] font-medium text-n700">All feedback submitted</p>
          <p className="text-[13px] text-n500 mt-1">
            No completed sessions are waiting for your feedback.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-n500">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} pending your feedback
          </p>
          {sessions.map((s) => (
            <SessionFeedbackCard key={s.id} session={s} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}
