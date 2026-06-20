import { motion } from "framer-motion";
import { BookOpen, ListChecks, Lightbulb } from "lucide-react";
import type { CaseStudyCardBlock } from "@/lib/copilotBlocks";

export function CopilotCaseStudyCard({ block }: { block: CaseStudyCardBlock }) {
  const rubric = block.rubric ?? [];
  const outline = block.model_answer_outline ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-violet-100 bg-violet-50/70 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-violet-100 grid place-items-center shrink-0">
          <BookOpen className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-violet-900 truncate">
            Case study · {block.company} · {block.role}
          </div>
          {block.domain && (
            <div className="text-[10.5px] text-violet-700/80 mt-0.5">{block.domain}</div>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 text-[12px] text-n700">
        <section>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1">Situation</div>
          <p className="leading-relaxed">{block.situation}</p>
        </section>
        <section>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1">The ask</div>
          <p className="leading-relaxed font-medium text-violet-900">{block.prompt}</p>
        </section>
        {rubric.length > 0 && (
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1.5 flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              Evaluation rubric
            </div>
            <ul className="space-y-1.5">
              {rubric.map((item) => (
                <li key={item.criterion} className="rounded-lg ring-1 ring-violet-100 bg-white/80 px-2.5 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-violet-900">{item.criterion}</span>
                    <span className="text-[10px] text-violet-600 shrink-0">{Math.round(item.weight * 100)}%</span>
                  </div>
                  <p className="text-[11px] text-n600 mt-0.5">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {outline.length > 0 && (
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-n500 mb-1 flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-amber-600" />
              Model answer outline
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11.5px]">
              {outline.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </motion.div>
  );
}
