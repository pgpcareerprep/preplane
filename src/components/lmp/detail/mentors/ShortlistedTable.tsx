import { Star, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import type { Mentor } from "@/lib/mentor";

export type ShortlistEntry = {
  mentor: Mentor;
  shortlistedAt: string;
};

export function ShortlistedTable({
  entries,
  onAssign,
  onRemove,
}: {
  entries: ShortlistEntry[];
  onAssign: (m: Mentor) => void;
  onRemove: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-n200 shadow-sm">
        <EmptyState
          icon={Star}
          title="No shortlisted mentors yet"
          description="Use the Suggested tab to shortlist mentors. They'll persist here even after you re-run matching."
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-n50 border-b border-n200 text-[11px] uppercase tracking-[0.5px] text-n500 font-medium">
          <tr>
            <Th>Mentor</Th>
            <Th>Domain</Th>
            <Th>Experience</Th>
            <Th>Shortlisted</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ mentor: m, shortlistedAt }) => (
            <tr key={m.id} className="border-b border-n100 last:border-0 hover:bg-n50/60 transition-colors">
              <Td>
                <div className="flex items-center gap-3">
                  <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold", m.color)}>
                    {m.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-n900 truncate">{m.name}</div>
                    <div className="text-[12px] text-n500 truncate">Score {m.score}/100</div>
                  </div>
                </div>
              </Td>
              <Td className="text-n700">{m.role}</Td>
              <Td className="text-n700">{m.seniority} · {m.company}</Td>
              <Td className="text-n500 tabular-nums">{shortlistedAt}</Td>
              <Td className="text-right">
                <div className="inline-flex items-center gap-1.5">
                  <button
                    onClick={() => onAssign(m)}
                    className="inline-flex items-center gap-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 shadow-sm transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Assign
                  </button>
                  <button
                    onClick={() => onRemove(m.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-n300 bg-card text-n700 hover:bg-n100 text-[12px] font-medium px-2.5 py-1.5 transition-colors"
                    aria-label={`Remove ${m.name} from shortlist`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("text-left px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}