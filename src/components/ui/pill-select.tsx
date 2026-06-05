import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/**
 * PillSelect — canonical filter dropdown used in page filter rows.
 * Consistent height (h-9), radius (rounded-lg), border, and focus ring.
 */
export function PillSelect({
  value,
  onChange,
  options,
  prefix,
  icon,
  minWidth = 140,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  prefix?: string;
  icon?: ReactNode;
  minWidth?: number;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-9 w-auto gap-2 rounded-lg bg-n50/60 border-n200 text-[13px] text-n800 px-3 hover:bg-n100/60 transition-colors [&>svg]:text-n400 focus:ring-2 focus:ring-orange-100"
        style={{ minWidth }}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {icon}
          {prefix ? (
            <span className="text-n500 font-medium truncate">
              {prefix}: <span className="text-n900">{current}</span>
            </span>
          ) : (
            <span className="truncate">{current}</span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[13px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
