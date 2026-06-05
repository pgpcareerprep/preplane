import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUSES, STATUS_META, type LmpStatus } from "@/lib/lmpTypes";

/**
 * Inline status selector. Used on LMP cards so users can change status
 * directly without opening a modal.
 */
export function StatusDropdown({
  value,
  onChange,
  size = "sm",
  readOnly = false,
}: {
  value: LmpStatus;
  onChange: (next: LmpStatus) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
}) {
  const meta = STATUS_META[value];
  if (readOnly) {
    return (
      <span
        className={cn(
          "pill normal-case tracking-normal",
          meta.pill,
          size === "md" && "text-[12px] py-[4px] px-3",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
        {meta.label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "pill normal-case tracking-normal",
            meta.pill,
            "cursor-pointer hover:opacity-90 transition-opacity",
            size === "md" && "text-[12px] py-[4px] px-3",
          )}

        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {STATUSES.map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          return (
            <DropdownMenuItem
              key={s}
              onClick={(e) => {
                e.stopPropagation();
                if (s !== value) onChange(s);
              }}
              className={cn(value === s && "bg-n100")}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
              <Icon className="h-3.5 w-3.5 text-n500" />
              {m.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}