import { motion, AnimatePresence } from "framer-motion";
import { Pin, X, ExternalLink, AtSign, Briefcase, GraduationCap, Users, Building2, Globe, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveContext = {
  entity_type: string;
  entity_id: string;
  display_name: string;
  sub?: string;
  source?: "mention" | "disambiguation" | "tool" | "manual";
  pinned?: boolean;
} | null;

const TYPE_ICON: Record<string, typeof AtSign> = {
  student: GraduationCap,
  poc: Users,
  mentor: Users,
  alumni: GraduationCap,
  lmp: Briefcase,
  company: Building2,
  domain: Globe,
  status: CircleDot,
};

export function ContextRail({
  context,
  onClear,
  onTogglePin,
  onOpen,
}: {
  context: ActiveContext;
  onClear: () => void;
  onTogglePin: () => void;
  onOpen?: () => void;
}) {
  return (
    <AnimatePresence>
      {context && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-orange-100 bg-orange-50/60 text-[12px]"
        >
          {(() => {
            const Icon = TYPE_ICON[context.entity_type] || AtSign;
            return <Icon className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
          })()}
          <span className="text-n500 uppercase tracking-wide text-[10px] font-semibold shrink-0">
            Active · {context.entity_type}
          </span>
          <span className="text-n900 font-semibold truncate max-w-[200px]">{context.display_name}</span>
          {context.sub && <span className="text-n500 truncate max-w-[200px]">· {context.sub}</span>}
          <div className="flex-1" />
          {onOpen && (
            <button
              onClick={onOpen}
              className="h-6 w-6 grid place-items-center rounded-md text-n500 hover:text-n900 hover:bg-card"
              title="Open detail"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onTogglePin}
            className={cn(
              "h-6 w-6 grid place-items-center rounded-md hover:bg-card transition-colors",
              context.pinned ? "text-orange-500" : "text-n400 hover:text-n800",
            )}
            title={context.pinned ? "Unpin context" : "Pin context"}
          >
            <Pin className={cn("h-3.5 w-3.5", context.pinned && "fill-orange-400")} />
          </button>
          <button
            onClick={onClear}
            className="h-6 w-6 grid place-items-center rounded-md text-n400 hover:text-n900 hover:bg-card"
            title="Clear context"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
