import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Canonical search field — h-9, rounded-control (8px), n50 surface. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchInput({ className, placeholder = "Search…", ...rest }, ref) {
    return (
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400 pointer-events-none" />
        <Input
          ref={ref}
          placeholder={placeholder}
          className={cn(
            "pl-9 h-9 rounded-control bg-n50/60 border-n200 text-[13px] placeholder:text-n400 focus-visible:ring-2 focus-visible:ring-orange-100 focus-visible:ring-offset-0 focus-visible:border-orange-300 transition-colors",
            className,
          )}
          {...rest}
        />
      </div>
    );
  },
);
