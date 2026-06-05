import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, Users2, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Mentor } from "@/lib/mentor";
import type { Candidate, Round } from "@/lib/lmpProcessMutations";

export type AssignmentMode = "one-on-one" | "group";

export type AssignmentDraft = {
  mentorId: string;
  mode: AssignmentMode;
  candidateIds: string[];
  roundId: string;
  processId?: string;
  sessionDate: string;
  sessionTime: string;
};

export type ProcessOption = { id: string; label: string };

export function AssignMentorModal({
  open,
  onOpenChange,
  mentor,
  candidates,
  rounds,
  role,
  onConfirm,
  processes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mentor: Mentor | null;
  candidates: Candidate[];
  rounds: Round[];
  role: string;
  onConfirm: (draft: AssignmentDraft) => void;
  processes?: ProcessOption[];
}) {
  const [candidateId, setCandidateId] = useState<string>("");
  const [roundId, setRoundId] = useState<string>("");
  const [mode, setMode] = useState<AssignmentMode>("one-on-one");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [processId, setProcessId] = useState<string>("");
  const [sessionDate, setSessionDate] = useState<string>("");
  const [sessionTime, setSessionTime] = useState<string>("");
  const groupRef = useRef<HTMLDivElement>(null);

  const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const nextSlot = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)));
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const today = todayStr();
  const nowTime = (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  useEffect(() => {
    if (open) {
      setCandidateId(candidates[0]?.id ?? "");
      setRoundId(rounds[0]?.id ?? "");
      // Default to Group with ALL candidates pre-selected.
      setMode("group");
      setGroupIds(candidates.map((c) => c.id));
      setGroupOpen(false);
      setProcessId(processes?.[0]?.id ?? "");
      setSessionDate(todayStr());
      setSessionTime(nextSlot());
    }
  }, [open, candidates, rounds, processes]);

  useEffect(() => {
    if (!groupOpen) return;
    const onClick = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [groupOpen]);

  if (!mentor) return null;

  const toggleGroup = (id: string) => {
    setGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const allSelected = groupIds.length === candidates.length;
  const toggleAll = () => setGroupIds(allSelected ? [] : candidates.map((c) => c.id));

  const needsProcess = !!processes && processes.length > 0;
  const valid = roundId && sessionDate && sessionTime
    && (mode === "one-on-one" ? !!candidateId : groupIds.length > 0)
    && (!needsProcess || !!processId);

  const submit = () => {
    if (!valid) return;
    onConfirm({
      mentorId: mentor.id,
      mode,
      roundId,
      candidateIds: mode === "one-on-one" ? [candidateId] : groupIds,
      processId: needsProcess ? processId : undefined,
      sessionDate,
      sessionTime,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-n900 pr-8">
            Assign mentor
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4 min-w-0">
          {needsProcess && (
            <Field label="LMP process">
              <select
                value={processId}
                onChange={(e) => setProcessId(e.target.value)}
                className="h-9 w-full rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
              >
                {processes!.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="flex items-center gap-3 rounded-xl border border-n200 bg-n50 p-3 min-w-0">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0", mentor.color)}>
              {mentor.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-n900 truncate">{mentor.name}</div>
              <div className="text-[12px] text-n500 truncate">{mentor.role} @ {mentor.company}</div>
            </div>
            <div className="shrink-0 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-[11px] font-bold px-2 py-0.5 tabular-nums">
              {mentor.score}
            </div>
          </div>

          <Field label="Session type">
            <div className="grid grid-cols-2 gap-2">
              <ModeOption
                active={mode === "one-on-one"}
                onClick={() => setMode("one-on-one")}
                icon={User}
                title="1 : 1"
                subtitle="Single candidate"
              />
              <ModeOption
                active={mode === "group"}
                onClick={() => setMode("group")}
                icon={Users2}
                title="1 : Group"
                subtitle="Multiple candidates"
              />
            </div>
          </Field>

          {mode === "one-on-one" ? (
            <Field label="Candidate">
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="h-9 w-full rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.cohort}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label={`Candidates ${groupIds.length > 0 ? `(${groupIds.length} selected)` : ""}`}>
              <div ref={groupRef} className="relative">
                <button
                  type="button"
                  onClick={() => setGroupOpen((v) => !v)}
                  className="h-9 w-full rounded-md border border-n300 bg-card px-2 pr-8 text-left text-[13px] text-n800 focus:outline-none focus:border-orange-400 flex items-center"
                >
                  <span className="truncate">
                    {groupIds.length === 0
                      ? "Select candidates…"
                      : groupIds.length === candidates.length
                      ? "All candidates"
                      : candidates
                          .filter((c) => groupIds.includes(c.id))
                          .map((c) => c.name)
                          .join(", ")}
                  </span>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
                </button>
                {groupOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-n200 bg-card shadow-lg max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-[12px] font-medium text-n700 hover:bg-n50 border-b border-n100"
                    >
                      <CheckBox checked={allSelected} />
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                    {candidates.map((c) => {
                      const checked = groupIds.includes(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => toggleGroup(c.id)}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] text-n800 hover:bg-n50"
                        >
                          <CheckBox checked={checked} />
                          <div className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold", c.color)}>
                            {c.initials}
                          </div>
                          <span className="truncate flex-1 text-left">{c.name}</span>
                          <span className="text-[11px] text-n500 shrink-0">{c.cohort}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>
          )}

          <Field label="Round">
            <select
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              className="h-9 w-full rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <input
                type="date"
                value={sessionDate}
                min={today}
                onChange={(e) => setSessionDate(e.target.value)}
                className="h-9 w-full rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={sessionTime}
                step={900}
                min={sessionDate === today ? nowTime : undefined}
                onChange={(e) => setSessionTime(e.target.value)}
                className="h-9 w-full rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
              />
            </Field>
          </div>

          <Field label="Role">
            <input
              readOnly
              value={role}
              className="h-9 w-full rounded-md border border-n200 bg-n100 px-2 text-[13px] text-n600 cursor-not-allowed"
            />
          </Field>
        </div>

        <DialogFooter className="mt-4">
          <button
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-md border border-n300 bg-card px-4 text-[13px] font-medium text-n700 hover:bg-n100 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={submit}
            className={cn(
              "h-9 rounded-md px-4 text-[13px] font-medium shadow-sm transition-colors",
              valid
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-n100 text-n400 cursor-not-allowed",
            )}
          >
            {mode === "group" && groupIds.length > 1
              ? `Assign to ${groupIds.length} candidates`
              : "Confirm assignment"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.5px] text-n500 font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function ModeOption({
  active, onClick, icon: Icon, title, subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof User;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-orange-300 bg-orange-50"
          : "border-n200 bg-card hover:bg-n50",
      )}
    >
      <div className={cn(
        "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
        active ? "bg-orange-500 text-white" : "bg-n100 text-n600",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className={cn("text-[13px] font-semibold", active ? "text-orange-700" : "text-n900")}>{title}</div>
        <div className="text-[11px] text-n500 truncate">{subtitle}</div>
      </div>
    </button>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={cn(
      "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
      checked ? "bg-orange-500 border-orange-500 text-white" : "bg-card border-n300",
    )}>
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}