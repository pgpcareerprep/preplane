import { motion, AnimatePresence } from "framer-motion";
import { Zap, Pencil } from "lucide-react";
import { useState } from "react";

export type ParsedJD = {
  role: string;
  company: string;
  domain: string;
  seniority: string;
  requiredSkills: string[];
  preferredSkills: string[];
  confidence: number;
};

export function AIPreviewPanel({ data, show }: { data: ParsedJD | null; show: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <AnimatePresence initial={false}>
      {show && data && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-6 rounded-xl bg-n100 border border-n200 border-l-[3px] border-l-orange-500 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-plum-400" strokeWidth={2} />
                <span className="text-[14px] font-semibold text-n900">AI Parsed Results</span>
                <span className="ml-2 inline-flex items-center rounded-full bg-sage-50 text-sage-600 border border-sage-200 px-2 py-0.5 text-[11px] font-medium">
                  {data.confidence}% confident
                </span>
              </div>
              <button
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1 text-[13px] text-orange-500 hover:text-orange-600"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                {editing ? "Done" : "Edit fields"}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {[
                { l: "Role", v: data.role },
                { l: "Company", v: data.company },
                { l: "Domain", v: data.domain },
                { l: "Seniority", v: data.seniority },
              ].map((c) => (
                <div key={c.l} className="bg-card border border-n200 rounded-lg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">{c.l}</div>
                  <div className="text-[13px] font-medium text-n800 mt-0.5 truncate">{c.v}</div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-n500 mb-1.5">Required Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.requiredSkills.map((s) => (
                    <span key={s} className="rounded-full bg-orange-50 border border-orange-200 text-orange-600 px-2.5 py-0.5 text-[12px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-n500 mb-1.5">Preferred Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.preferredSkills.map((s) => (
                    <span key={s} className="rounded-full bg-n100 border border-n200 text-n600 px-2.5 py-0.5 text-[12px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}