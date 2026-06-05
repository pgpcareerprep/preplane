import { Search, X } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_META, type LmpRecord } from "@/lib/lmpTypes";

export type LmpFilters = {
  q: string;
  company: string;
  role: string;
  poc: string;
  domain: string;
  status: string;
};

export const EMPTY_LMP_FILTERS: LmpFilters = { q: "", company: "", role: "", poc: "", domain: "", status: "" };

function activeCount(f: LmpFilters) {
  return (f.domain ? 1 : 0) + (f.status ? 1 : 0);
}

export function LmpFilterBar({
  value,
  onChange,
  trailing,
  records = [],
}: {
  value: LmpFilters;
  onChange: (v: LmpFilters) => void;
  trailing?: ReactNode;
  records?: LmpRecord[];
}) {
  const domains = useMemo(() => Array.from(new Set(records.map((r) => r.domain).filter(Boolean))).sort(), [records]);

  const count = activeCount(value);
  const set = <K extends keyof LmpFilters>(k: K, v: LmpFilters[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="rounded-xl bg-card border border-n200 shadow-sm p-2.5 flex items-center gap-2 flex-wrap md:flex-nowrap">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" strokeWidth={1.75} />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Search role, company, POC…"
          className="w-full h-9 rounded-lg border border-n200 bg-n50/60 pl-9 pr-3 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:border-orange-400 focus:bg-card focus:ring-2 focus:ring-orange-100 transition-all"
        />
      </div>

      <div className="flex items-center gap-2 shrink-0 md:ml-auto">
        <InlineSelect value={value.domain} onChange={(v) => set("domain", v)} placeholder="All domains" options={domains} />

        <InlineSelect
          value={value.status}
          onChange={(v) => set("status", v)}
          placeholder="All statuses"
          options={STATUSES.map((s) => STATUS_META[s].label)}
          valueMap={Object.fromEntries(STATUSES.map((s) => [STATUS_META[s].label, s]))}
          reverseMap={Object.fromEntries(STATUSES.map((s) => [s, STATUS_META[s].label]))}
        />

        {count > 0 && (
          <button
            onClick={() => onChange({ ...EMPTY_LMP_FILTERS, q: value.q })}
            className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-[12px] text-n500 hover:text-n800 hover:bg-n100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        {trailing}
      </div>
    </div>
  );
}

function InlineSelect({
  value, onChange, placeholder, options, valueMap, reverseMap,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  valueMap?: Record<string, string>;
  reverseMap?: Record<string, string>;
}) {
  const display = reverseMap?.[value] ?? value;
  return (
    <select
      value={display}
      onChange={(e) => {
        const label = e.target.value;
        onChange(valueMap ? (valueMap[label] ?? "") : label);
      }}
      className={cn(
        "h-9 rounded-lg border px-2.5 text-[13px] focus:outline-none transition-colors w-[130px] shrink-0 cursor-pointer",
        value
          ? "border-orange-300 bg-orange-50 text-orange-700 hover:border-orange-400"
          : "border-n200 bg-n50/60 text-n700 hover:border-n300 hover:bg-card",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
