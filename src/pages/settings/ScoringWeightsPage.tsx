import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WeightSlider } from "@/components/settings/WeightSlider";
import { WeightDonut } from "@/components/settings/WeightDonut";
import { cn } from "@/lib/utils";
import { fetchScoringWeights, saveScoringWeights, DEFAULT_WEIGHTS } from "@/lib/scoringWeights";

type Key = "role" | "skills" | "company" | "industry" | "seniority";

const SIGNALS: { key: Key; label: string; helper: string; color: string }[] = [
  { key: "role",      label: "Role Match",      helper: "Measures how closely the mentor's role aligns with the JD role.",    color: "hsl(var(--orange-500))" },
  { key: "skills",    label: "Skills Overlap",  helper: "Jaccard similarity between mentor skills and JD required skills.",   color: "hsl(var(--teal-400))" },
  { key: "company",   label: "Company Match",   helper: "Whether the mentor previously worked at the target company.",        color: "hsl(var(--plum-400))" },
  { key: "industry",  label: "Industry Match",  helper: "Sector and vertical alignment between mentor and JD.",                color: "hsl(var(--sky-400))" },
  { key: "seniority", label: "Seniority Match", helper: "Level proximity between mentor and JD seniority.",                    color: "hsl(var(--sage-400))" },
];

const PRESETS: Record<string, Record<Key, number>> = {
  "Balanced (Default)": { role: 35, skills: 25, company: 15, industry: 15, seniority: 10 },
  "Skills-Heavy":       { role: 20, skills: 50, company: 10, industry: 10, seniority: 10 },
  "Role-Heavy":         { role: 55, skills: 20, company: 10, industry: 10, seniority:  5 },
  "Company-Focused":    { role: 25, skills: 20, company: 35, industry: 15, seniority:  5 },
};

type SparseKey = "role" | "skills" | "industry" | "seniority";
const SPARSE: { key: SparseKey; label: string; color: string }[] = [
  { key: "role",      label: "Role Match",      color: "hsl(var(--orange-500))" },
  { key: "skills",    label: "Skills Overlap",  color: "hsl(var(--teal-400))" },
  { key: "industry",  label: "Industry Match",  color: "hsl(var(--sky-400))" },
  { key: "seniority", label: "Seniority Match", color: "hsl(var(--sage-400))" },
];

export default function ScoringWeightsPage() {
  const [weights, setWeights] = useState<Record<Key, number>>(() => ({ ...DEFAULT_WEIGHTS }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sparseOpen, setSparseOpen] = useState(false);
  const [sparse, setSparse] = useState<Record<SparseKey, number>>({ role: 50, skills: 30, industry: 10, seniority: 10 });

  useEffect(() => {
    let mounted = true;
    fetchScoringWeights()
      .then((w) => { if (mounted) setWeights(w); })
      .catch(() => toast.error("Couldn't load saved weights — showing defaults."))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const total = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const valid = total === 100;

  const segments = SIGNALS.map(s => ({ name: s.label, value: weights[s.key], color: s.color }));

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">Matching Score Weights</h3>
        <p className="text-[13px] text-n500 mt-1">These weights apply to all future mentor matches.</p>
      </header>

      {/* Main weights card */}
      <section className="rounded-lg bg-card border border-n200 shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-start">
          <div className="space-y-5 min-w-0">
            {SIGNALS.map(s => (
              <WeightSlider
                key={s.key}
                label={s.label}
                helper={s.helper}
                value={weights[s.key]}
                onChange={v => setWeights(w => ({ ...w, [s.key]: v }))}
                color={s.color}
              />
            ))}
          </div>

          <div className="flex flex-col items-center justify-self-center md:justify-self-end gap-3">
            <WeightDonut segments={segments} />
            <AnimatePresence>
              {!valid && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="inline-flex items-center gap-1.5 text-[12px] text-coral-600 bg-coral-50 border border-coral-200 rounded-full px-2.5 py-1"
                >
                  <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                  Must sum to 100% (currently {total}%)
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Presets */}
        <div className="mt-8 pt-6 border-t border-n100">
          <div className="label-eyebrow mb-3">Presets</div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(PRESETS).map(name => (
              <button
                key={name}
                onClick={() => setWeights(PRESETS[name])}
                className="text-[13px] text-n800 bg-card border border-n300 rounded-md px-3 py-1.5 hover:bg-n50 hover:border-n400 transition-colors duration-150 ease-smooth"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sparse JD overrides */}
      <section className="rounded-lg bg-card border border-n200 shadow-sm overflow-hidden">
        <button
          onClick={() => setSparseOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-n50 transition-colors duration-150"
        >
          <div className="text-left">
            <h5 className="text-[16px] font-medium text-n900">Basic Info Mode Overrides</h5>
            <p className="text-[12px] text-n500 mt-0.5">Used when JDs are sparse — Company is dropped from the formula.</p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-n500 transition-transform duration-220 ease-smooth", sparseOpen && "rotate-180")} strokeWidth={1.5} />
        </button>
        <AnimatePresence initial={false}>
          {sparseOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 pt-2 space-y-5">
                {SPARSE.map(s => (
                  <WeightSlider
                    key={s.key}
                    label={s.label}
                    value={sparse[s.key]}
                    onChange={v => setSparse(w => ({ ...w, [s.key]: v }))}
                    color={s.color}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Save */}
      <button
        disabled={!valid || saving || loading}
        onClick={async () => {
          if (!valid) return;
          setSaving(true);
          try {
            await saveScoringWeights(weights);
            toast.success("Scoring weights saved", {
              description: "Shared across all roles. Applies on the next Find Mentors run.",
            });
          } catch (e: any) {
            toast.error("Failed to save weights", { description: e?.message ?? "Unknown error" });
          } finally {
            setSaving(false);
          }
        }}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-md text-white text-[14px] font-medium px-4 py-3 shadow-sm transition-colors duration-150 ease-smooth",
          valid && !saving && !loading ? "bg-orange-500 hover:bg-orange-600" : "bg-n300 cursor-not-allowed",
        )}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Loading…" : saving ? "Saving…" : "Save Scoring Config"}
      </button>
    </div>
  );
}
