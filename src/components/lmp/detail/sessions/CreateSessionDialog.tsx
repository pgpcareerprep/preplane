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

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lmpId: string;
};

export function CreateSessionDialog({ open, onOpenChange, lmpId }: Props) {
  const qc = useQueryClient();
  const [mentorId, setMentorId] = useState<string>("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [sessionType, setSessionType] = useState("mock");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [notes, setNotes] = useState("");

  // Mentors already linked to this LMP
  const { data: lmpMentors = [] } = useQuery({
    enabled: open && !!lmpId,
    queryKey: ["create-session-mentors", lmpId],
    queryFn: async () => {
      const [linkedRes, sessionsRes, procRes] = await Promise.all([
        supabase
          .from("lmp_mentors")
          .select("mentor_id, mentors:mentors(id, name, designation, company)")
          .eq("lmp_id", lmpId),
        supabase
          .from("sessions")
          .select("mentor_id, mentors:mentors(id, name, designation, company)")
          .eq("lmp_id", lmpId)
          .not("mentor_id", "is", null),
        supabase
          .from("lmp_processes")
          .select("mentor_selected")
          .eq("id", lmpId)
          .maybeSingle(),
      ]);
      if (linkedRes.error) throw linkedRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      const map = new Map<string, any>();
      [...(linkedRes.data ?? []), ...(sessionsRes.data ?? [])].forEach((r: any) => {
        // PostgREST may return the relation as an array; normalise to object
        const mentor = Array.isArray(r?.mentors) ? r.mentors[0] : r?.mentors;
        if (mentor?.id) map.set(mentor.id, { ...r, mentors: mentor });
      });
      // Fallback: if mentor was aligned via the quick-select (MentorSnapshotCard)
      // it writes only to lmp_processes.mentor_selected, not lmp_mentors. Look it up
      // by name so it still appears in the session dropdown.
      const mentorSelected = procRes.data?.mentor_selected;
      if (mentorSelected && map.size === 0) {
        const { data: byName } = await supabase
          .from("mentors")
          .select("id, name, designation, company")
          .ilike("name", mentorSelected.trim())
          .limit(1)
          .maybeSingle();
        if (byName?.id) {
          map.set(byName.id, { mentor_id: byName.id, mentors: byName });
        }
      }
      return Array.from(map.values());
    },
  });

  // Candidates on this LMP
  const { data: lmpCandidates = [] } = useQuery({
    enabled: open && !!lmpId,
    queryKey: ["create-session-candidates", lmpId],
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

  useEffect(() => {
    if (!open) {
      setMentorId(""); setStudentIds([]); setSessionType("mock");
      setScheduledAt(""); setDuration("30"); setNotes("");
    }
  }, [open]);

  const toggleStudent = (id: string) => {
    setStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const selectedCands = lmpCandidates.filter((c: any) => studentIds.includes(c.id));
      const candidateStudentIds = selectedCands.map((c: any) => c.student_id).filter(Boolean);
      const primary = selectedCands[0];
      const payload: any = {
        lmp_id: lmpId,
        mentor_id: mentorId || null,
        student_id: primary?.student_id || null,
        // Only set when non-empty; column default is '{}'::uuid[] NOT NULL,
        // so passing null was actually erasing user picks.
        ...(candidateStudentIds.length > 0 ? { candidate_ids: candidateStudentIds } : {}),
        session_type: sessionType,
        status: "scheduled",
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_min: duration ? Number(duration) : null,
        notes: notes || null,
        sync_source: "app",
      };
      const { data, error } = await supabase.from("sessions").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
      toast.success(studentIds.length > 1 ? `Session scheduled for ${studentIds.length} candidates` : "Session scheduled");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const canSubmit = useMemo(
    () => !!lmpId && !!scheduledAt && (!!mentorId || studentIds.length > 0),
    [lmpId, scheduledAt, mentorId, studentIds],
  );

  const handleSubmit = () => {
    if (!scheduledAt) { toast.error("Pick a date & time"); return; }
    if (!mentorId && studentIds.length === 0) { toast.error("Pick at least one mentor or candidate"); return; }
    create.mutate();
  };

  const noLinks = lmpMentors.length === 0 && lmpCandidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Schedule session</DialogTitle></DialogHeader>

        {noLinks && (
          <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-[12px] text-orange-700">
            No mentors or candidates linked to this LMP yet. Add a mentor on the Mentors tab or a candidate on the Candidates tab to attach.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Mentor</Label>
            <Select value={mentorId} onValueChange={setMentorId}>
              <SelectTrigger><SelectValue placeholder={lmpMentors.length ? "Pick a mentor" : "No mentors linked"} /></SelectTrigger>
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
              <div className="rounded-md border border-n200 px-3 py-2 text-[12px] text-n500">No candidates yet</div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border border-n200 divide-y divide-n100">
                {lmpCandidates.map((c: any) => {
                  const checked = studentIds.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-n50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(c.id)}
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
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
