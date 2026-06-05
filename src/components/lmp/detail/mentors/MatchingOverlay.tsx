import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchingError } from "@/lib/mentorMatching";
import type { ExternalPlatform } from "@/lib/externalMentors";

export type MatchStepId = "MU" | "ALU" | "EXT" | "RANK";
export type MatchStep = { id: MatchStepId; label: string };

export const STEP_LABELS: Record<MatchStepId, string> = {
  MU: "Searching Mentor Union (MU)...",
  ALU: "Searching Alumni Database (ALU)...",
  EXT: "Searching External Sources (EXT)...",
  RANK: "Ranking & deduplicating results...",
};

const STEP_SHORT: Record<MatchStepId, string> = {
  MU: "Mentor Union",
  ALU: "Alumni DB",
  EXT: "External Sources",
  RANK: "Ranking results",
};

const STEP_HINTS: Record<MatchStepId, string> = {
  MU: "Usually instant",
  ALU: "Usually instant",
  EXT: "AI discovery — usually 20–60 s",
  RANK: "Scoring and ranking…",
};

export type OverlayExternalStatus = {
  phase: "idle" | "loading" | "done" | "failed";
  platforms: ExternalPlatform[];
  counts: Partial<Record<ExternalPlatform, number>>;
};

type Props = {
  steps: MatchStep[];
  currentStep: number;
  errors?: MatchingError[];
  onDone: () => void;
  onCancel?: () => void;
  externalStatus?: OverlayExternalStatus;
};

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function MatchingOverlay({ steps, currentStep, errors, onDone, onCancel, externalStatus }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (steps.length > 0 && currentStep >= steps.length) {
      const t = setTimeout(onDone, 250);
      return () => clearTimeout(t);
    }
  }, [currentStep, steps.length, onDone]);

  const pct = steps.length === 0 ? 0 : Math.round((Math.min(currentStep, steps.length) / steps.length) * 100);
  const activeStep = steps[currentStep];
  const showExtChips =
    activeStep?.id === "EXT" &&
    externalStatus &&
    externalStatus.phase === "loading" &&
    externalStatus.platforms.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-card border border-n200 shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-n100 bg-gradient-to-r from-plum-400/5 to-orange-500/5">
        <div className="relative h-6 w-6 rounded-md bg-plum-400/10 border border-plum-400/30 flex items-center justify-center shrink-0">
          <Sparkles className="h-3 w-3 text-plum-400" />
          <motion.span
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-n900 leading-tight truncate">
            {minimized
              ? activeStep
                ? STEP_SHORT[activeStep.id]
                : "Finding mentors…"
              : "Finding the best mentors"}
          </div>
          <div className="text-[10.5px] text-n500 tabular-nums leading-tight">
            {fmtElapsed(elapsed)} · {pct}%
          </div>
        </div>
        <button
          type="button"
          aria-label={minimized ? "Expand" : "Minimize"}
          onClick={() => setMinimized((v) => !v)}
          className="h-6 w-6 rounded-md hover:bg-n100 text-n500 hover:text-n900 flex items-center justify-center transition-colors"
        >
          {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {onCancel && (
          <button
            type="button"
            aria-label="Cancel matching"
            onClick={onCancel}
            className="h-6 w-6 rounded-md hover:bg-red-50 text-n500 hover:text-red-600 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar (always visible) */}
      <div className="h-0.5 bg-n100 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-plum-400 to-orange-500"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: "linear" }}
        />
      </div>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {!minimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pt-3 pb-3.5">
              {errors && errors.length > 0 && (() => {
                const ALL: ("MU" | "ALU" | "EXT")[] = ["MU", "ALU", "EXT"];
                const failed = Array.from(new Set(errors.map((e) => e.source)));
                const available = ALL.filter((s) => !failed.includes(s));
                const summary = available.length === 0
                  ? "All sources unavailable — try again shortly"
                  : `${failed.join(", ")} unavailable — using ${available.join(" + ")}`;
                return (
                  <div className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2.5 py-1.5 text-[11px] flex items-start gap-1.5">
                    <span aria-hidden>⚠</span>
                    <span>{summary}</span>
                  </div>
                );
              })()}

              <ul className="space-y-1.5">
                {steps.map((step, i) => {
                  const done = i < currentStep;
                  const current = i === currentStep;
                  return (
                    <li key={step.id} className="flex items-start gap-2 text-[12px]">
                      <span
                        className={cn(
                          "h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                          done && "bg-sage-400 text-white",
                          current && "bg-orange-500/15 text-orange-500",
                          !done && !current && "bg-n100 text-n300",
                        )}
                      >
                        {done ? (
                          <Check className="h-2 w-2" strokeWidth={3.5} />
                        ) : current ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={2.5} />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={cn(
                          "leading-tight",
                          done ? "text-n600" : current ? "text-n900 font-medium" : "text-n400",
                        )}>
                          {STEP_SHORT[step.id]}
                        </div>
                        {current && (
                          <div className="text-[10.5px] text-n500 mt-0.5 leading-tight">{STEP_HINTS[step.id]}</div>
                        )}
                        {current && showExtChips && step.id === "EXT" && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {externalStatus!.platforms.map((p) => {
                              const c = externalStatus!.counts[p];
                              return (
                                <span
                                  key={p}
                                  className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[9.5px] font-medium text-orange-700"
                                >
                                  <motion.span
                                    className="h-1 w-1 rounded-full bg-orange-500"
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 0.9, repeat: Infinity }}
                                  />
                                  {p}
                                  {typeof c === "number" && (
                                    <span className="tabular-nums text-orange-600/80">·{c}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
