import { Search, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_META, type LmpRecord } from "@/lib/lmpTypes";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type LmpFilters = {
  q: string;
  company: string;
  role: string;
  poc: string;
  domain: string;
  status: string;
  /** poc_profiles.id UUID or "". Used for admin/allocator Prep POC scoping. */
  prepPocId: string;
};

export const EMPTY_LMP_FILTERS: LmpFilters = {
  q: "", company: "", role: "", poc: "", domain: "", status: "", prepPocId: "",
};

function activeCount(f: LmpFilters) {
  return (f.domain ? 1 : 0) + (f.status ? 1 : 0) + (f.prepPocId ? 1 : 0);
}

function FilterFields({
  value,
  onChange,
  domains,
  showPrepPoc,
  prepPocOptions,
  layout,
}: {
  value: LmpFilters;
  onChange: (v: LmpFilters) => void;
  domains: string[];
  showPrepPoc: boolean;
  prepPocOptions?: { value: string; label: string }[];
  layout: "inline" | "stack";
}) {
  const set = <K extends keyof LmpFilters>(k: K, v: LmpFilters[K]) =>
    onChange({ ...value, [k]: v });
  const stack = layout === "stack";

  return (
    <>
      <InlineSelect
        value={value.domain}
        onChange={(v) => set("domain", v)}
        placeholder="All domains"
        options={domains}
        fullWidth={stack}
      />
      <InlineSelect
        value={value.status}
        onChange={(v) => set("status", v)}
        placeholder="All statuses"
        options={STATUSES.map((s) => STATUS_META[s].label)}
        valueMap={Object.fromEntries(STATUSES.map((s) => [STATUS_META[s].label, s]))}
        reverseMap={Object.fromEntries(STATUSES.map((s) => [s, STATUS_META[s].label]))}
        fullWidth={stack}
      />
      {showPrepPoc && prepPocOptions && (
        <InlineSelect
          value={value.prepPocId}
          onChange={(v) => set("prepPocId", v)}
          placeholder="All Prep POCs"
          options={prepPocOptions.filter((o) => o.value !== "All").map((o) => o.label)}
          valueMap={Object.fromEntries(
            prepPocOptions.filter((o) => o.value !== "All").map((o) => [o.label, o.value]),
          )}
          reverseMap={Object.fromEntries(
            prepPocOptions.filter((o) => o.value !== "All").map((o) => [o.value, o.label]),
          )}
          fullWidth={stack}
        />
      )}
    </>
  );
}

export function LmpFilterBar({
  value,
  onChange,
  trailing,
  records = [],
  role,
  prepPocOptions,
}: {
  value: LmpFilters;
  onChange: (v: LmpFilters) => void;
  trailing?: ReactNode;
  records?: LmpRecord[];
  role?: string;
  prepPocOptions?: { value: string; label: string }[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const domains = useMemo(
    () => Array.from(new Set(records.map((r) => r.domain).filter(Boolean))).sort(),
    [records],
  );

  const showPrepPoc = (role === "admin" || role === "allocator") && !!prepPocOptions?.length;
  const count = activeCount(value);

  return (
    <div className="rounded-card bg-card border border-n200 dark:border-border shadow-sm p-2.5 flex flex-col md:flex-row md:items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" strokeWidth={1.75} />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Search role, company, POC…"
          className="w-full h-11 md:h-9 rounded-control border border-n200 dark:border-border bg-n50/60 dark:bg-muted/40 pl-9 pr-3 text-[13px] text-n800 dark:text-foreground placeholder:text-n400 focus:outline-none focus:border-orange-400 focus:bg-card focus:ring-2 focus:ring-orange-100 transition-all"
        />
      </div>

      {/* Desktop filters */}
      <div className="hidden md:flex items-center gap-2 shrink-0 md:ml-auto">
        <FilterFields
          value={value}
          onChange={onChange}
          domains={domains}
          showPrepPoc={showPrepPoc}
          prepPocOptions={prepPocOptions}
          layout="inline"
        />
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_LMP_FILTERS, q: value.q })}
            className="inline-flex items-center gap-1 h-9 px-2.5 rounded-control text-[12px] text-n500 hover:text-n800 hover:bg-n100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        {trailing}
      </div>

      {/* Mobile filters + trailing */}
      <div className="flex md:hidden items-center gap-2">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 h-11 px-3 rounded-control border text-[13px] font-medium transition-colors",
                count > 0
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-n200 bg-n50/60 text-n700",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {count > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 text-[#1A1916] text-[10px] font-semibold px-1">
                  {count}
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filter LMPs</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <FilterFields
                value={value}
                onChange={onChange}
                domains={domains}
                showPrepPoc={showPrepPoc}
                prepPocOptions={prepPocOptions}
                layout="stack"
              />
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...EMPTY_LMP_FILTERS, q: value.q })}
                  className="w-full h-11 rounded-control border border-n200 text-[13px] text-n600 hover:bg-n100"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="w-full h-11 rounded-control bg-orange-500 text-[#1A1916] text-[13px] font-medium"
              >
                Apply
              </button>
            </div>
          </SheetContent>
        </Sheet>
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_LMP_FILTERS, q: value.q })}
            className="inline-flex h-11 w-11 items-center justify-center rounded-control text-n500 hover:bg-n100"
            aria-label="Clear filters"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="ml-auto">{trailing}</div>
      </div>
    </div>
  );
}

function InlineSelect({
  value, onChange, placeholder, options, valueMap, reverseMap, fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  valueMap?: Record<string, string>;
  reverseMap?: Record<string, string>;
  fullWidth?: boolean;
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
        "h-11 md:h-9 rounded-control border px-2.5 text-[13px] focus:outline-none transition-colors shrink-0 cursor-pointer",
        fullWidth ? "w-full" : "w-[130px]",
        value
          ? "border-orange-300 bg-orange-50 text-orange-700 hover:border-orange-400 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40"
          : "border-n200 dark:border-border bg-n50/60 dark:bg-muted/40 text-n700 dark:text-foreground hover:border-n300 hover:bg-card",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
