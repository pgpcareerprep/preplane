import { cn } from "@/lib/utils";
import { SOURCE_META, type MentorSource } from "@/lib/mentor";

export function MentorSourceTags({
  sources,
  className,
}: {
  sources: MentorSource[];
  className?: string;
}) {
  if (!sources.length) {
    return <span className="text-n400">—</span>;
  }

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {sources.map((src) => (
        <span
          key={src}
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]",
            SOURCE_META[src].chip,
          )}
        >
          {src}
        </span>
      ))}
    </span>
  );
}
