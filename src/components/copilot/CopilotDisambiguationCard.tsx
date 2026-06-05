import { useState } from "react";
import { motion } from "framer-motion";
import { Users, GraduationCap, Building2, Briefcase, User, Award, Tag, HelpCircle, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DisambiguationCardBlock, DisambiguationCandidate } from "@/lib/copilotBlocks";

const ICONS: Record<string, LucideIcon> = {
  poc: Users,
  student: GraduationCap,
  company: Building2,
  mentor: User,
  lmp: Briefcase,
  alumni: Award,
  domain: Tag,
  status: Tag,
};
const COLORS: Record<string, string> = {
  poc: "text-blue-600 bg-blue-50 ring-blue-200",
  student: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  company: "text-violet-600 bg-violet-50 ring-violet-200",
  mentor: "text-amber-600 bg-amber-50 ring-amber-200",
  lmp: "text-orange-600 bg-orange-50 ring-orange-200",
  alumni: "text-pink-600 bg-pink-50 ring-pink-200",
  domain: "text-muted-foreground bg-muted ring-border",
  status: "text-muted-foreground bg-muted ring-border",
};

export function CopilotDisambiguationCard({
  block, onAction,
}: {
  block: DisambiguationCardBlock;
  onAction: (cmd: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const dispatch = (c: DisambiguationCandidate) => {
    if (picked) return;
    setPicked(c.entity_id);
    const tpl = block.pending_action || `Use {display_name} (id={entity_id}, type={entity_type})`;
    const cmd = tpl
      .split("{entity_id}").join(c.entity_id)
      .split("{entity_type}").join(c.entity_type)
      .split("{display_name}").join(c.display_name);
    onAction(cmd);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-amber-200/70 bg-amber-50 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-amber-100 grid place-items-center shrink-0">
          <HelpCircle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-amber-900">
            {block.prompt || `Multiple matches for "${block.query}" — which one did you mean?`}
          </div>
          <div className="text-[10.5px] text-amber-700/80 mt-0.5">
            {block.candidates.length} possible {block.candidates.length === 1 ? "match" : "matches"} · Pick one to continue
          </div>
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        {block.candidates.map((c) => {
          const Icon = ICONS[c.entity_type] ?? User;
          const color = COLORS[c.entity_type] ?? "text-muted-foreground bg-muted ring-border";
          const isPicked = picked === c.entity_id;
          const isDimmed = picked !== null && !isPicked;
          return (
            <button
              key={c.entity_id}
              disabled={picked !== null}
              onClick={() => dispatch(c)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border border-n200 text-left transition-all",
                "hover:border-orange-300 hover:bg-orange-50/40",
                isPicked && "border-orange-400 ring-1 ring-orange-200",
                isDimmed && "opacity-50",
              )}
            >
              <span className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0 ring-1", color)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-n900 truncate">{c.display_name}</div>
                {c.sub && <div className="text-[10.5px] text-n500 truncate">{c.sub}</div>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {typeof c.confidence === "number" && (
                  <span className="text-[9.5px] font-medium text-n500 tabular-nums">
                    {Math.round(c.confidence * 100)}%
                  </span>
                )}
                <span className="text-[9px] uppercase tracking-wide text-n500 bg-n100 px-1.5 py-0.5 rounded font-semibold">
                  {c.entity_type}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-amber-200/70 flex items-center justify-between">
        <span className="text-[10.5px] text-amber-700/80">
          Don't see it? Refine your query or use @mention.
        </span>
        <button
          disabled={picked !== null}
          onClick={() => onAction(block.cancel_label || "Cancel — let me rephrase")}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-n600 hover:bg-card/60 disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </motion.div>
  );
}
