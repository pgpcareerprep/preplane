import { motion } from "framer-motion";
import { Users, Star, CheckCircle2, Building2 } from "lucide-react";
import type { MentorShortlistCardBlock, MentorShortlistItem } from "@/lib/copilotBlocks";

const SOURCE_BADGE: Record<string, string> = {
  MU: "bg-orange-100 text-orange-700 ring-orange-200",
  ALU: "bg-pink-100 text-pink-700 ring-pink-200",
  EXT: "bg-muted text-foreground ring-border",
};

function MentorRow({ m, onAssign }: { m: MentorShortlistItem; onAssign: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border border-n200 hover:border-orange-300 transition-colors">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 grid place-items-center text-[11px] font-bold text-orange-700 shrink-0">
        {m.initials || m.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-n900 truncate">{m.name}</span>
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ring-1 ${SOURCE_BADGE[m.source] ?? SOURCE_BADGE.EXT}`}>
            {m.source}
          </span>
          {m.availability === "available" && (
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
          )}
        </div>
        <div className="text-[10.5px] text-n500 truncate flex items-center gap-1">
          {m.designation || "—"}
          {m.company && <><span>·</span><Building2 className="h-2.5 w-2.5" />{m.company}</>}
          {m.seniority && <><span>·</span>{m.seniority}</>}
        </div>
        {m.match_reasons && m.match_reasons.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.match_reasons.slice(0, 3).map((r, i) => (
              <span key={i} className="text-[9.5px] text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-1 py-0.5 rounded">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-bold text-orange-600 tabular-nums">{Math.round(m.score)}</span>
          {typeof m.rating === "number" && m.rating > 0 && (
            <span className="inline-flex items-center text-[10px] text-amber-600 gap-0.5">
              <Star className="h-2.5 w-2.5 fill-current" />{m.rating.toFixed(1)}
            </span>
          )}
        </div>
        <button
          onClick={onAssign}
          className="text-[10.5px] font-semibold text-orange-600 hover:text-orange-700 hover:underline"
        >
          Assign
        </button>
      </div>
    </div>
  );
}

export function CopilotMentorShortlistCard({
  block, onAction,
}: {
  block: MentorShortlistCardBlock;
  onAction: (cmd: string) => void;
}) {
  const tpl = block.assign_action_template || "Assign mentor {name} (id={mentor_id}) to {company} · {role}";
  const handleAssign = (m: MentorShortlistItem) => {
    const cmd = tpl
      .split("{mentor_id}").join(m.mentor_id)
      .split("{name}").join(m.name)
      .split("{company}").join(block.for_company)
      .split("{role}").join(block.for_role);
    onAction(cmd);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-orange-200 bg-orange-50/40 overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-orange-100 bg-orange-50/70 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-orange-100 grid place-items-center shrink-0">
          <Users className="h-4 w-4 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-orange-900 truncate">
            Mentor shortlist · {block.for_company} · {block.for_role}
          </div>
          <div className="text-[10.5px] text-orange-700/80 mt-0.5">
            {block.shortlist.length} matches · ranked by JD fit
          </div>
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        {block.shortlist.map((m) => (
          <MentorRow key={m.mentor_id} m={m} onAssign={() => handleAssign(m)} />
        ))}
      </div>

      {block.notes && (
        <div className="px-3 py-2 border-t border-orange-100 text-[10.5px] text-orange-800/80">
          {block.notes}
        </div>
      )}
    </motion.div>
  );
}
