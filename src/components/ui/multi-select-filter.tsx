import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectFilterOption = {
  value: string;
  label: string;
  description?: string;
};

export function MultiSelectFilter({
  label,
  placeholder,
  options,
  selected,
  onChange,
  className,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: MultiSelectFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);
  const valueLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`;

  const toggle = (value: string) => {
    onChange(selectedSet.has(value)
      ? selected.filter((id) => id !== value)
      : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "lx-pill max-w-[220px] disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        >
          <span
            className="text-[10.5px] uppercase tracking-[0.6px] font-medium"
            style={{ color: "var(--lx-text-3)" }}
          >
            {label}
          </span>
          <span className="min-w-0 truncate text-left" style={{ color: "var(--lx-text)" }}>
            {valueLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--lx-text-3)" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.6px] text-muted-foreground">
            {label}
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <div className="max-h-[260px] overflow-y-auto space-y-1">
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
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted",
                    active && "bg-orange-50 text-orange-800",
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
      </PopoverContent>
    </Popover>
  );
}
