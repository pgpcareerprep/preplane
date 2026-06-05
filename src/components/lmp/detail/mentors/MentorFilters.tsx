import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { type Mentor, type MentorSource, SOURCE_META } from "@/lib/mentor";

export type MentorFilterState = {
  sources: MentorSource[];
  scoreRange: [number, number];
  decisionTags: string[];
  seniorities: string[];
};

export const EMPTY_MENTOR_FILTERS: MentorFilterState = {
  sources: ["MU", "ALU", "EXT"],
  scoreRange: [0, 100],
  decisionTags: [],
  seniorities: [],
};

const FALLBACK_SEN = ["Mid", "Senior", "Lead", "Staff"];
const SOURCES: MentorSource[] = ["MU", "ALU", "EXT"];

type Props = {
  value: MentorFilterState;
  onChange: (v: MentorFilterState) => void;
  /** Mentor universe to derive tag/seniority options from. Falls back to a small static list when empty. */
  mentors?: Mentor[];
};

export function MentorFilters({ value, onChange, mentors = [] }: Props) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of mentors) for (const t of m.decisionTags ?? []) if (t?.label) set.add(t.label);
    // Always include any currently-selected tags so the chip remains togglable.
    for (const t of value.decisionTags) set.add(t);
    return Array.from(set).sort();
  }, [mentors, value.decisionTags]);

  const allSen = useMemo(() => {
    const set = new Set<string>();
    for (const m of mentors) if (m.seniority) set.add(m.seniority);
    for (const s of value.seniorities) set.add(s);
    if (set.size === 0) FALLBACK_SEN.forEach((s) => set.add(s));
    const order = ["Mid", "Senior", "Lead", "Staff"];
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [mentors, value.seniorities]);

  const toggle = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  return (
    <aside className="rounded-2xl bg-card border border-n200 shadow-sm p-5 sticky top-[140px] space-y-5">
      <div>
        <h5 className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">Source</h5>
        <div className="space-y-1.5">
          {SOURCES.map((s) => {
            const meta = SOURCE_META[s];
            const on = value.sources.includes(s);
            return (
              <label key={s} className="flex items-center gap-2 cursor-pointer text-[13px] text-n700">
                <input
                  type="checkbox" checked={on}
                  onChange={() => onChange({ ...value, sources: toggle(value.sources, s) })}
                  className="accent-orange-500"
                />
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]", meta.chip)}>
                  {s}
                </span>
                <span className="text-n600">{meta.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <h5 className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">Score range</h5>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={100} value={value.scoreRange[0]}
            onChange={(e) => onChange({ ...value, scoreRange: [+e.target.value, value.scoreRange[1]] })}
            className="w-16 h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n800 focus:outline-none focus:border-orange-400"
          />
          <span className="text-n400 text-[12px]">–</span>
          <input
            type="number" min={0} max={100} value={value.scoreRange[1]}
            onChange={(e) => onChange({ ...value, scoreRange: [value.scoreRange[0], +e.target.value] })}
            className="w-16 h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n800 focus:outline-none focus:border-orange-400"
          />
        </div>
      </div>

      <div>
        <h5 className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">Decision tags</h5>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => {
            const on = value.decisionTags.includes(t);
            return (
              <button
                key={t}
                onClick={() => onChange({ ...value, decisionTags: toggle(value.decisionTags, t) })}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  on ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-card border-n300 text-n600 hover:bg-n100",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h5 className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">Seniority</h5>
        <div className="grid grid-cols-2 gap-1.5">
          {allSen.map((s) => {
            const on = value.seniorities.includes(s);
            return (
              <label key={s} className="flex items-center gap-2 cursor-pointer text-[13px] text-n700">
                <input
                  type="checkbox" checked={on}
                  onChange={() => onChange({ ...value, seniorities: toggle(value.seniorities, s) })}
                  className="accent-orange-500"
                />
                {s}
              </label>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onChange(EMPTY_MENTOR_FILTERS)}
        className="text-[13px] text-orange-500 hover:text-orange-600 font-medium"
      >
        Reset Filters
      </button>
    </aside>
  );
}