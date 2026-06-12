import { useMemo, useState } from "react";
import { Users2, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Mentor } from "@/lib/mentor";
import type { Candidate, Round } from "@/lib/lmpProcessMutations";

export type Assignment = {
  id: string;
  mentor: Mentor;
  candidate: Candidate;
  round: Round;
  role: string;
  status: "Pending" | "Confirmed" | "Completed";
  assignedAt: string;
};

const STATUS_STYLE: Record<Assignment["status"], string> = {
  Pending:   "bg-yellow-50 border-yellow-200 text-yellow-600",
  Confirmed: "bg-sage-50 border-sage-200 text-sage-600",
  Completed: "bg-sky-400/10 border-sky-400/30 text-sky-400",
};

type Group = {
  key: string;
  mentor: Mentor;
  round: Round;
  role: string;
  items: Assignment[];
};

export function AssignedTable({
  assignments,
  onUnassign,
  readOnly = false,
}: {
  assignments: Assignment[];
  onUnassign: (id: string) => void;
  readOnly?: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<Group | null>(null);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const a of assignments) {
      const key = `${a.mentor.id}|${a.round.id ?? a.round.name}|${a.role}`;
      const g = map.get(key);
      if (g) g.items.push(a);
      else map.set(key, { key, mentor: a.mentor, round: a.round, role: a.role, items: [a] });
    }
    return Array.from(map.values());
  }, [assignments]);

  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-n200 shadow-sm">
        <EmptyState
          icon={Users2}
          title="No mentors assigned yet"
          description="Assign a mentor from Suggested or Shortlisted to a candidate and round. Assignments persist across re-runs."
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-n50 border-b border-n200 text-[11px] uppercase tracking-[0.5px] text-n500 font-medium">
            <tr>
              <Th>Mentor</Th>
              <Th>Candidates</Th>
              <Th>Round</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              {!readOnly && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isGroup = g.items.length > 1;
              const statuses = new Set(g.items.map((i) => i.status));
              const aggStatus: Assignment["status"] =
                statuses.size === 1 ? [...statuses][0] : "Pending";
              return (
                <tr key={g.key} className="border-b border-n100 last:border-0 hover:bg-n50/60 transition-colors">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold", g.mentor.color)}>
                        {g.mentor.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-n900 truncate">{g.mentor.name}</div>
                        <div className="text-[12px] text-n500 truncate">{g.mentor.company}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {isGroup ? (
                      <button
                        onClick={() => setOpenGroup(g)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-n200 bg-n50 hover:bg-n100 text-n800 text-[12px] font-medium px-2.5 py-1 transition-colors"
                      >
                        <Users2 className="h-3.5 w-3.5" />
                        {g.items.length} candidates
                        <ChevronRight className="h-3.5 w-3.5 text-n500" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold", g.items[0].candidate.color)}>
                          {g.items[0].candidate.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-n800 truncate">{g.items[0].candidate.name}</div>
                          <div className="text-[11px] text-n500 truncate">{g.items[0].candidate.cohort}</div>
                        </div>
                      </div>
                    )}
                  </Td>
                  <Td className="text-n700">{g.round.name}</Td>
                  <Td className="text-n700">{g.role}</Td>
                  <Td>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[aggStatus])}>
                      {aggStatus}
                    </span>
                  </Td>
                  {!readOnly && <Td className="text-right">
                    {isGroup ? (
                      <button
                        onClick={() => setOpenGroup(g)}
                        className="inline-flex items-center gap-1 rounded-md border border-n300 bg-card text-n700 hover:bg-n100 text-[12px] font-medium px-2.5 py-1.5 transition-colors"
                      >
                        Bulk Assign
                      </button>
                    ) : (
                      <button
                        onClick={() => onUnassign(g.items[0].id)}
                        className="inline-flex items-center gap-1 rounded-md border border-n300 bg-card text-n700 hover:bg-n100 text-[12px] font-medium px-2.5 py-1.5 transition-colors"
                        aria-label="Remove assignment"
                      >
                        <X className="h-3.5 w-3.5" /> Unassign
                      </button>
                    )}
                  </Td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!openGroup} onOpenChange={(o) => !o && setOpenGroup(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {openGroup?.mentor.name} · {openGroup?.round.name} · {openGroup?.role}
            </DialogTitle>
          </DialogHeader>
          {openGroup && (
            <div className="rounded-md border border-n200 divide-y divide-n100">
              {openGroup.items.map((a) => {
                const stillThere = assignments.some((x) => x.id === a.id);
                if (!stillThere) return null;
                return (
                  <div key={a.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold", a.candidate.color)}>
                        {a.candidate.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] text-n800 truncate">{a.candidate.name}</div>
                        <div className="text-[11px] text-n500 truncate">{a.candidate.cohort || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[a.status])}>
                        {a.status}
                      </span>
                      {!readOnly && <button
                        onClick={() => {
                          onUnassign(a.id);
                          // Close if this was the last one
                          if (openGroup.items.filter((i) => assignments.some((x) => x.id === i.id)).length <= 1) {
                            setOpenGroup(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-n300 bg-card text-n700 hover:bg-n100 text-[12px] font-medium px-2.5 py-1 transition-colors"
                      >
                        <X className="h-3 w-3" /> Unassign
                      </button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("text-left px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}
