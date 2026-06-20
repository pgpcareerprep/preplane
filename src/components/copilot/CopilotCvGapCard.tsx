import { motion } from "framer-motion";
import { FileSearch, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CvGapCardBlock } from "@/lib/copilotBlocks";

export function CopilotCvGapCard({ block }: { block: CvGapCardBlock }) {
  const score = typeof block.ats_score === "number" ? Math.round(block.ats_score) : null;
  const mandatory = block.missing_mandatory ?? [];
  const preferred = block.missing_preferred ?? [];
  const recommendations = block.top_recommendations ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-sky-100 bg-sky-50/70 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-sky-100 grid place-items-center shrink-0">
          <FileSearch className="h-4 w-4 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-sky-900 truncate">
            CV gap analysis · {block.candidate_name}
          </div>
          {(block.lmp_company || block.lmp_role) && (
            <div className="text-[10.5px] text-sky-700/80 mt-0.5 truncate">
              {[block.lmp_company, block.lmp_role].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {score !== null && (
          <div className="text-right shrink-0">
            <div className="text-[18px] font-bold text-sky-900 leading-none">{score}</div>
            <div className="text-[10px] text-sky-700/80 mt-0.5">ATS{block.grade ? ` · ${block.grade}` : ""}</div>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {mandatory.length > 0 && (
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              Missing mandatory skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mandatory.map((skill) => (
                <span key={skill} className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 bg-amber-50 text-amber-800 ring-amber-200">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {preferred.length > 0 && (
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1">
              Missing preferred skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preferred.map((skill) => (
                <span key={skill} className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 bg-muted text-foreground ring-border">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Top recommendations
            </div>
            <ul className="space-y-1">
              {recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} className="text-[12px] text-n700 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-n400">
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {score === null && mandatory.length === 0 && preferred.length === 0 && recommendations.length === 0 && (
          <p className="text-[12px] text-n600">No ATS scoring data was returned for this analysis.</p>
        )}
      </div>
    </motion.div>
  );
}
