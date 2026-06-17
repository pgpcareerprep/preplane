import { useMemo, useState } from "react";
import { LxFilterRow } from "./primitives";
import {
  DOMAIN_OPTIONS, RANGE_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, type LmpFilters,
} from "@/components/dashboards/filters/useLmpFilters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import type { ReactNode } from "react";

const FMT = "dd MMM yyyy";

export function LxLmpFilters({
  filters, set, pocOptions, showPrepPoc, showOutreachPoc: _showOutreachPoc, right,
}: {
  filters: LmpFilters;
  set: <K extends keyof LmpFilters>(k: K, v: LmpFilters[K]) => void;
  /** Prep POC options. Accept UUID-based { value, label }[] or legacy string[]. */
  pocOptions: string[] | { value: string; label: string }[];
  showPrepPoc?: boolean;
  /** @deprecated Outreach POC filter removed. */
  showOutreachPoc?: boolean;
  right?: ReactNode;
}) {
  const [customFromOpen, setCustomFromOpen] = useState(false);
  const [customToOpen, setCustomToOpen] = useState(false);
  // Local pending dates before user hits "Apply"
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(
    filters.customFrom ?? undefined,
  );
  const [pendingTo, setPendingTo] = useState<Date | undefined>(
    filters.customTo ?? undefined,
  );

  // Normalise pocOptions: accept both string[] and { value, label }[]
  const normPocOptions: string[] = useMemo(() => {
    if (!pocOptions.length) return ["All"];
    if (typeof pocOptions[0] === "string") return pocOptions as string[];
    return (pocOptions as { value: string; label: string }[]).map((o) => o.label);
  }, [pocOptions]);

  // Map label → value for UUID-based options
  const pocValueByLabel = useMemo<Map<string, string> | null>(() => {
    if (!pocOptions.length || typeof pocOptions[0] === "string") return null;
    const m = new Map<string, string>();
    (pocOptions as { value: string; label: string }[]).forEach((o) => m.set(o.label, o.value));
    return m;
  }, [pocOptions]);

  const pocLabelByValue = useMemo<Map<string, string> | null>(() => {
    if (!pocOptions.length || typeof pocOptions[0] === "string") return null;
    const m = new Map<string, string>();
    (pocOptions as { value: string; label: string }[]).forEach((o) => m.set(o.value, o.label));
    return m;
  }, [pocOptions]);

  const currentPocLabel =
    pocLabelByValue?.get(filters.prepPoc) ??
    (filters.prepPoc === "All" ? "All" : filters.prepPoc);

  const items: { label: string; value: string; options: string[]; onChange: (v: string) => void }[] = [
    {
      label: "Range", value: filters.range, options: RANGE_OPTIONS as unknown as string[],
      onChange: (v: string) => {
        set("range", v as LmpFilters["range"]);
        if (v !== "Custom") { set("customFrom", null); set("customTo", null); }
      },
    },
    { label: "Domain", value: filters.domain, options: DOMAIN_OPTIONS as unknown as string[],
      onChange: (v: string) => set("domain", v as LmpFilters["domain"]) },
    { label: "Status", value: filters.status, options: STATUS_OPTIONS as unknown as string[],
      onChange: (v: string) => set("status", v as LmpFilters["status"]) },
    { label: "Type",   value: filters.type,   options: TYPE_OPTIONS as unknown as string[],
      onChange: (v: string) => set("type",   v as LmpFilters["type"]) },
  ];

  if (showPrepPoc) {
    items.push({
      label: "Prep POC",
      value: currentPocLabel,
      options: normPocOptions,
      onChange: (label: string) => {
        const val = pocValueByLabel?.get(label) ?? label;
        set("prepPoc", val);
      },
    });
  }

  const applyCustomDates = () => {
    if (!pendingFrom || !pendingTo) return;
    if (pendingFrom > pendingTo) return;
    set("customFrom", startOfDay(pendingFrom));
    set("customTo", endOfDay(pendingTo));
  };

  const clearCustomDates = () => {
    setPendingFrom(undefined);
    setPendingTo(undefined);
    set("customFrom", null);
    set("customTo", null);
    set("range", "30d");
  };

  const customLabel =
    filters.customFrom && filters.customTo
      ? `${format(filters.customFrom, FMT)} – ${format(filters.customTo, FMT)}`
      : null;

  const canApply = !!pendingFrom && !!pendingTo && pendingFrom <= pendingTo;

  return (
    <div className="space-y-2">
      <LxFilterRow filters={items} right={right} />

      {/* Custom date range pickers — visible only when "Custom" is selected */}
      {filters.range === "Custom" && (
        <div
          className="flex flex-wrap items-center gap-2"
          style={{ borderLeft: "2px solid var(--lx-border)", paddingLeft: "0.75rem" }}
        >
          {/* From date picker */}
          <Popover open={customFromOpen} onOpenChange={setCustomFromOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="lx-pill" style={{ cursor: "pointer" }}>
                <span style={{ color: "var(--lx-text-3)", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 500 }}>
                  From
                </span>
                <span style={{ color: pendingFrom ? "var(--lx-text)" : "var(--lx-text-3)" }}>
                  {pendingFrom ? format(pendingFrom, FMT) : "Pick date"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pendingFrom}
                onSelect={(d) => { setPendingFrom(d); setCustomFromOpen(false); }}
                disabled={(d) => (pendingTo ? d > pendingTo : false)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* To date picker */}
          <Popover open={customToOpen} onOpenChange={setCustomToOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="lx-pill" style={{ cursor: "pointer" }}>
                <span style={{ color: "var(--lx-text-3)", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 500 }}>
                  To
                </span>
                <span style={{ color: pendingTo ? "var(--lx-text)" : "var(--lx-text-3)" }}>
                  {pendingTo ? format(pendingTo, FMT) : "Pick date"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pendingTo}
                onSelect={(d) => { setPendingTo(d); setCustomToOpen(false); }}
                disabled={(d) => (pendingFrom ? d < pendingFrom : false)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Apply */}
          <button
            type="button"
            disabled={!canApply}
            onClick={applyCustomDates}
            className="inline-flex items-center h-[28px] px-3 rounded-full text-[11.5px] font-medium transition-colors"
            style={{
              background: canApply ? "var(--lx-accent, #E38330)" : "var(--lx-soft)",
              color: canApply ? "#fff" : "var(--lx-text-3)",
              cursor: canApply ? "pointer" : "not-allowed",
              opacity: canApply ? 1 : 0.6,
            }}
          >
            Apply
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={clearCustomDates}
            className="inline-flex items-center h-[28px] px-3 rounded-full text-[11.5px] font-medium transition-colors"
            style={{ background: "var(--lx-soft)", color: "var(--lx-text-3)", cursor: "pointer" }}
          >
            Clear
          </button>

          {/* Applied range label */}
          {customLabel && (
            <span className="text-[11px] font-medium" style={{ color: "var(--lx-text-3)" }}>
              Applied: {customLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
