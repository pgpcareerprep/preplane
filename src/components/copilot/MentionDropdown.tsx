import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, GraduationCap, Building2, Briefcase, User, Tag, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type MentionEntityType =
  | "poc" | "student" | "company" | "mentor" | "lmp" | "alumni" | "domain" | "status";

export type MentionEntity = {
  type: MentionEntityType;
  name: string;
  sub?: string;
  /** entity id — used by `resolve_entity` for precise reference. */
  entityId?: string;
  email?: string | null;
  domain?: string | null;
};

const ENTITY_ICONS: Record<MentionEntityType, typeof Users> = {
  poc: Users,
  student: GraduationCap,
  company: Building2,
  mentor: User,
  lmp: Briefcase,
  alumni: Award,
  domain: Tag,
  status: Tag,
};

const ENTITY_COLORS: Record<MentionEntityType, string> = {
  poc: "text-blue-500 bg-blue-50",
  student: "text-emerald-500 bg-emerald-50",
  company: "text-violet-500 bg-violet-50",
  mentor: "text-amber-500 bg-amber-50",
  lmp: "text-orange-500 bg-orange-50",
  alumni: "text-pink-500 bg-pink-50",
  domain: "text-muted-foreground bg-muted",
  status: "text-muted-foreground bg-muted",
};

const TYPE_ORDER: MentionEntityType[] = ["lmp", "student", "poc", "mentor", "company", "alumni", "domain", "status"];
const TYPE_LABEL: Record<MentionEntityType, string> = {
  lmp: "LMP processes",
  student: "Students",
  poc: "POCs",
  mentor: "Mentors",
  company: "Companies",
  alumni: "Alumni",
  domain: "Domains",
  status: "Statuses",
};

type RawResult = {
  entity_type: string;
  entity_id: string;
  display_name: string;
  email?: string | null;
  domain?: string | null;
  metadata?: Record<string, unknown>;
};



interface MentionDropdownProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (entity: MentionEntity) => void;
  onClose: () => void;
}

export function MentionDropdown({ query, position, onSelect, onClose }: MentionDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [results, setResults] = useState<MentionEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Debounced fetch from live entity search via edge function.
  // Uses a request-id token to discard out-of-order responses (rapid typing).
  useEffect(() => {
    const trimmed = (query ?? "").trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("entity-search", {
          body: { query: trimmed, limit: 16 },
        });
        if (myReq !== reqId.current) return; // stale response, drop
        if (invokeError) {
          const msg = invokeError.message || String(invokeError);
          console.warn("[mention-search] invoke failed", { query: trimmed, error: invokeError });
          setError(msg);
          setLoading(false);
          return;
        }
        const json = (data ?? { results: [] }) as { results?: RawResult[] };
        const mapped: MentionEntity[] = ((json.results ?? []) as RawResult[]).map((r) => {
          const meta = r.metadata || {};
          const sub = entitySub(r.entity_type, meta, r.email, r.domain);
          return {
            type: (r.entity_type as MentionEntityType),
            name: r.display_name,
            sub,
            entityId: r.entity_id,
            email: r.email ?? null,
            domain: r.domain ?? null,
          };
        });
        setResults(mapped);
        setLoading(false);
      } catch (err) {
        if (myReq !== reqId.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[mention-search] fetch failed", { query: trimmed, error: msg });
        setError(msg);
        setLoading(false);
      }
    }, 140);
    return () => { clearTimeout(t); };
  }, [query, retryTick]);

  // Group results by type while preserving global ordering for keyboard nav.
  const grouped = useMemo(() => {
    const map = new Map<MentionEntityType, MentionEntity[]>();
    for (const r of results) {
      if (!map.has(r.type)) map.set(r.type, []);
      map.get(r.type)!.push(r);
    }
    const ordered: { type: MentionEntityType; items: MentionEntity[] }[] = [];
    for (const t of TYPE_ORDER) {
      const items = map.get(t);
      if (items && items.length > 0) ordered.push({ type: t, items });
    }
    // any leftover unknown types
    for (const [t, items] of map.entries()) {
      if (!TYPE_ORDER.includes(t)) ordered.push({ type: t, items });
    }
    return ordered;
  }, [results]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => { setActiveIdx(0); }, [flat.length, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && flat[activeIdx]) { e.preventDefault(); onSelect(flat[activeIdx]); }
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flat, activeIdx, onSelect, onClose]);

  // Always render the shell once mounted so the dropdown shows immediately
  // after typing "@" — even before the user types a query.

  let runningIdx = 0;
  return (
    <AnimatePresence>
      <motion.div ref={ref} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
        className="absolute z-50 w-[300px] bg-card rounded-xl border border-n200 shadow-lg overflow-hidden"
        style={{ bottom: position.top, left: position.left }}
      >
        <div className="px-3 py-2 border-b border-n100 flex items-center justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.5px] text-n400 font-medium">
            Mention an entity
          </span>
          {loading && <Loader2 className="h-3 w-3 text-n400 animate-spin" />}
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {error && (
            <div className="mx-2 my-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 flex items-center justify-between gap-2">
              <span className="truncate">Search failed — {error}</span>
              <button
                onClick={() => setRetryTick((n) => n + 1)}
                className="shrink-0 rounded bg-card border border-red-200 px-2 py-0.5 text-[10.5px] font-medium text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && flat.length === 0 && (
            <div className="px-3 py-4 text-[11.5px] text-n500 text-center">
              {query.length === 0
                ? "Type to search LMPs, students, POCs, mentors, alumni, domains…"
                : `No matches for "${query}"`}
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.type}>
              <div className="px-3 pt-2 pb-1 text-[9.5px] uppercase tracking-[0.6px] text-n400 font-semibold">
                {TYPE_LABEL[group.type] ?? group.type}
              </div>
              {group.items.map((entity) => {
                const idx = runningIdx++;
                const Icon = ENTITY_ICONS[entity.type] ?? User;
                const color = ENTITY_COLORS[entity.type] ?? "text-slate-500 bg-slate-100";
                return (
                  <button
                    key={`${entity.type}-${entity.entityId ?? entity.name}-${idx}`}
                    onClick={() => onSelect(entity)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                      idx === activeIdx ? "bg-orange-50" : "hover:bg-n50"
                    )}
                  >
                    <span className={cn("h-7 w-7 rounded-lg grid place-items-center shrink-0", color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-n900 truncate">{entity.name}</div>
                      {entity.sub && <div className="text-[10.5px] text-n500 truncate">{entity.sub}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function entitySub(type: string, meta: Record<string, unknown>, email?: string | null, domain?: string | null): string | undefined {
  const company = typeof meta.company === "string" ? meta.company : undefined;
  const role = typeof meta.role === "string" ? meta.role : undefined;
  const status = typeof meta.status === "string" ? meta.status : undefined;
  const cohort = typeof meta.cohort === "string" ? meta.cohort : undefined;
  switch (type) {
    case "lmp":     return [company, role, status].filter(Boolean).join(" · ") || undefined;
    case "student": return [domain, cohort, email].filter(Boolean).join(" · ") || undefined;
    case "poc":     return [role, domain, email].filter(Boolean).join(" · ") || undefined;
    case "mentor":  return [company, role, email].filter(Boolean).join(" · ") || undefined;
    case "company": return [domain, role].filter(Boolean).join(" · ") || undefined;
    case "alumni":  return [company, role, cohort].filter(Boolean).join(" · ") || undefined;
    default:        return undefined;
  }
}

export function MentionTag({ entity }: { entity: MentionEntity }) {
  const color = ENTITY_COLORS[entity.type] ?? "text-slate-500 bg-slate-100";
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[12px] font-medium", color)}>
      @{entity.name}
    </span>
  );
}
