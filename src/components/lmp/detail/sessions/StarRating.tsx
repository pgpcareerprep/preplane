import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value, onChange, size = 5,
}: { value: number; onChange: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: size }).map((_, i) => {
        const n = i + 1;
        const active = (hover || value) >= n;
        return (
          <button
            key={n} type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className="transition-transform duration-150 hover:scale-110"
          >
            <Star className={cn("h-6 w-6 transition-colors duration-150", active ? "fill-orange-500 text-orange-500" : "text-n300")} />
          </button>
        );
      })}
    </div>
  );
}