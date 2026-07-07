import { Check, ChevronDown, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCohortProgramFilterOptions } from "@/lib/hooks/useCohortProgramFilterOptions";

function OptionList({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  options: { value: string; label: string; description?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.6px] text-muted-foreground">
          {title}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div className="max-h-[220px] overflow-y-auto space-y-1">
        {options.length === 0 ? (
          <div className="px-2 py-4 text-center text-[12px] text-muted-foreground">
            No options available.
          </div>
        ) : (
          options.map((option) => {
            const active = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggle(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted",
                  active && "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border",
                    active ? "border-orange-400 bg-orange-500 text-white" : "border-input bg-background",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function GlobalCohortProgramFilters({ className }: { className?: string }) {
  const {
    cohortIds,
    programIds,
    cohortOptions,
    programOptions,
    setCohorts,
    setProgramIds,
    clear,
    hasFilters,
  } = useCohortProgramFilterOptions();

  const summary = hasFilters
    ? `${cohortIds.length + programIds.length} selected`
    : "All cohorts & programs";

  const toggleCohort = (id: string) => {
    setCohorts(cohortIds.includes(id) ? cohortIds.filter((x) => x !== id) : [...cohortIds, id]);
  };

  const toggleProgram = (id: string) => {
    setProgramIds(programIds.includes(id) ? programIds.filter((x) => x !== id) : [...programIds, id]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-full border bg-background px-3 text-[12px] font-medium transition-colors hover:bg-muted",
            hasFilters && "border-orange-300 bg-orange-50/80 text-orange-900 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-100",
            className,
          )}
          aria-label="Cohort and program filters"
        >
          <Filter className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-3 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">Cohort & Program</span>
          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] font-medium text-orange-600 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <OptionList
          title="Cohort"
          options={cohortOptions}
          selected={cohortIds}
          onToggle={toggleCohort}
          onClear={() => setCohorts([])}
        />
        <div className="border-t border-border" />
        <OptionList
          title="Program"
          options={programOptions}
          selected={programIds}
          onToggle={toggleProgram}
          onClear={() => setProgramIds([])}
        />
      </PopoverContent>
    </Popover>
  );
}
