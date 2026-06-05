import { motion } from "framer-motion";
import { FileText, Sparkles, MapPin, Briefcase, Award } from "lucide-react";
import type { JdSummaryCardBlock } from "@/lib/copilotBlocks";

export function CopilotJdSummaryCard({
  block, onAction,
}: {
  block: JdSummaryCardBlock;
  onAction: (cmd: string) => void;
}) {
  const conf = typeof block.confidence === "number" ? Math.round(block.confidence) : null;
  const Pill = ({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "violet" | "emerald" | "amber" }) => {
    const cls =
      tone === "violet" ? "bg-violet-50 text-violet-700 ring-violet-200"
      : tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber" ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-muted text-foreground ring-border";
    return <span className={`inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded ring-1 ${cls}`}>{children}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-violet-100 bg-violet-50/70 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-violet-100 grid place-items-center shrink-0">
          <FileText className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-violet-900 truncate">
            JD parsed · {block.company || "—"} · {block.role || "—"}
          </div>
          <div className="text-[10.5px] text-violet-700/80 mt-0.5 flex items-center gap-2 flex-wrap">
            {block.domain && <span>{block.domain}</span>}
            {block.seniority && <><span>·</span><span>{block.seniority}</span></>}
            {block.source === "reused" && block.reused_from && <><span>·</span><span>reused from {block.reused_from}</span></>}
            {conf !== null && <><span>·</span><span>{conf}% confidence</span></>}
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {block.summary && (
          <p className="text-[12px] text-n700 leading-relaxed">{block.summary}</p>
        )}

        <div className="flex flex-wrap gap-3 text-[11px] text-n600">
          {block.years_experience && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{block.years_experience}</span>}
          {block.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{block.location}</span>}
          {block.employment_type && <span className="inline-flex items-center gap-1"><Award className="h-3 w-3" />{block.employment_type}</span>}
        </div>

        {block.required_skills && block.required_skills.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-n500 mb-1">Required skills</div>
            <div className="flex flex-wrap gap-1">
              {block.required_skills.slice(0, 12).map((s) => <Pill key={s} tone="violet">{s}</Pill>)}
            </div>
          </div>
        )}

        {block.preferred_skills && block.preferred_skills.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-n500 mb-1">Preferred</div>
            <div className="flex flex-wrap gap-1">
              {block.preferred_skills.slice(0, 10).map((s) => <Pill key={s}>{s}</Pill>)}
            </div>
          </div>
        )}

        {block.responsibilities && block.responsibilities.length > 0 && (
          <details className="group">
            <summary className="text-[10.5px] font-semibold text-n500 cursor-pointer select-none">
              Responsibilities ({block.responsibilities.length})
            </summary>
            <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-n700 list-disc pl-4">
              {block.responsibilities.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </details>
        )}
      </div>

      {block.next_action_command && (
        <div className="px-3 py-2 border-t border-violet-100 flex items-center justify-end bg-violet-50/40">
          <button
            onClick={() => onAction(block.next_action_command!)}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {block.next_action_label || "Find mentors for this JD"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
