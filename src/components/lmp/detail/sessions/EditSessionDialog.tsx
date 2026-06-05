import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type GroupLike = {
  primary: any;
  sessionIds: string[];
  candidates: { id: string | null; name: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lmpId: string;
  group: GroupLike | null;
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function EditSessionDialog({ open, onOpenChange, lmpId, group }: Props) {
  const qc = useQueryClient();
  const [mentorId, setMentorId] = useState<string>("");
  // studentIds here holds student_id values (matches group.candidates[].id)
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [sessionType, setSessionType] = useState("mock");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [notes, setNotes] = useState("");

  // Initialize from group whenever modal opens for a new group
  useEffect(() => {
    if (!open || !group) return;
    const s = group.primary;
    setMentorId(s.mentor_id || "");
    setStudentIds(group.candidates.map((c) => c.id).filter(Boolean) as string[]);
    setSessionType(s.session_type || "mock");
    setScheduledAt(toLocalInput(s.scheduled_at));
    setDuration(s.duration_min ? String(s.duration_min) : "");
    setNotes(s.notes || "");
  }, [open, group]);

  const { data: lmpMentors = [] } = useQuery({
    enabled: open && !!lmpId,
    queryKey: ["edit-session-mentors", lmpId],
    queryFn: async () => {
      const [linkedRes, sessionsRes] = await Promise.all([
        supabase
          .from("lmp_mentors")
          .select("mentor_id, mentors:mentors!inner(id, name, designation, company)")
          .eq("lmp_id", lmpId),
        supabase
          .from("sessions")
          .select("mentor_id, mentors:mentors!inner(id, name, designation, company)")
          .eq("lmp_id", lmpId)
          .not("mentor_id", "is", null),
      ]);
      if (linkedRes.error) throw linkedRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      const map = new Map<string, any>();
      [...(linkedRes.data ?? []), ...(sessionsRes.data ?? [])].forEach((r: any) => {
        if (r?.mentors?.id) map.set(r.mentors.id, r);
      });
      return Array.from(map.values());
    },
  });

  // Candidates on this LMP (we expose student_id as the selectable value)
  const { data: lmpCandidates = [] } = useQuery({
    enabled: open && !!lmpId,
    queryKey: ["edit-session-candidates", lmpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_candidates")
        .select("id, student_id, student_name, roll_no")
        .eq("lmp_id", lmpId)
        .order("student_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const toggleStudent = (sid: string) => {
    setStudentIds((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error("No session to edit");
      if (studentIds.length === 0) throw new Error("Pick at least one candidate");

      const shared: Record<string, any> = {
        mentor_id: mentorId || null,
        session_type: sessionType,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_min: duration ? Number(duration) : null,
        notes: notes || null,
      };

      const originalIds = (group.candidates.map((c) => c.id).filter(Boolean) as string[]);
      const isLegacyMulti = group.sessionIds.length > 1;

      if (isLegacyMulti) {
        // Reconcile per-row: existing sessionIds map 1:1 to original student_ids.
        // Delete rows for removed candidates; insert rows for added candidates;
        // update remaining sessionIds with shared fields.
        const removed = originalIds.filter((sid) => !studentIds.includes(sid));
        const added = studentIds.filter((sid) => !originalIds.includes(sid));

        // Find session rows to delete by matching student_id within this group
        if (removed.length) {
          const { error: delErr } = await supabase
            .from("sessions")
            .delete()
            .in("id", group.sessionIds)
            .in("student_id", removed);
          if (delErr) throw delErr;
        }

        // Update remaining (and not-yet-deleted) rows with shared fields
        const { error: updErr } = await supabase
          .from("sessions")
          .update(shared as any)
          .in("id", group.sessionIds);
        if (updErr) throw updErr;

        if (added.length) {
          const inserts = added.map((sid) => ({
            lmp_id: lmpId,
            student_id: sid,
            candidate_ids: [sid],
            status: group.primary.status || "scheduled",
            sync_source: "app",
            ...shared,
          }));
          const { error: insErr } = await supabase.from("sessions").insert(inserts as any);
          if (insErr) throw insErr;
        }
      } else {
        // Single-row mode (explicit candidate_ids or single-candidate row)
        const id = group.sessionIds[0];
        const patch: Record<string, any> = {
          ...shared,
          student_id: studentIds[0],
          candidate_ids: studentIds.length > 1 ? studentIds : [studentIds[0]],
        };
        const { error } = await supabase.from("sessions").update(patch as any).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
      qc.invalidateQueries({ queryKey: ["poc-pending-feedback"] });
      toast.success("Session updated");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const canSubmit = useMemo(
    () => !!group && studentIds.length > 0 && !!scheduledAt,
    [group, studentIds, scheduledAt],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit session</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Mentor</Label>
            <Select value={mentorId} onValueChange={setMentorId}>
              <SelectTrigger><SelectValue placeholder="Pick a mentor" /></SelectTrigger>
              <SelectContent>
                {lmpMentors.map((m: any) => (
                  <SelectItem key={m.mentors.id} value={m.mentors.id}>
                    {m.mentors.name}{m.mentors.designation ? ` · ${m.mentors.designation}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Candidates {studentIds.length > 0 && <span className="text-n500">({studentIds.length} selected)</span>}</Label>
            {lmpCandidates.length === 0 ? (
              <div className="rounded-md border border-n200 px-3 py-2 text-[12px] text-n500">No candidates linked yet</div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border border-n200 divide-y divide-n100">
                {lmpCandidates.map((c: any) => {
                  const sid = c.student_id;
                  if (!sid) return null;
                  const checked = studentIds.includes(sid);
                  return (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-n50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(sid)}
                        className="h-4 w-4 rounded border-n300 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-n800">{c.student_name}</span>
                      {c.roll_no && <span className="text-n500">· {c.roll_no}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={sessionType} onValueChange={setSessionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">Mock interview</SelectItem>
                  <SelectItem value="prep">Prep session</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Scheduled at</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the session…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
