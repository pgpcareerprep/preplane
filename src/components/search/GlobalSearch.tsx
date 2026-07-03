import { forwardRef, useEffect, useMemo, useRef, useState, useImperativeHandle } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Briefcase, Users, GraduationCap, UserCheck, Building2, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type EntityType = "lmp" | "poc" | "student" | "mentor" | "alumni" | "domain";

type RawResult = {
  entity_type: EntityType;
  entity_id: string;
  display_name: string;
  email: string | null;
  domain: string | null;
  metadata?: Record<string, any>;
};

const TYPE_META: Record<EntityType, { label: string; icon: any }> = {
  lmp:     { label: "LMPs",     icon: Briefcase },
  poc:     { label: "POCs",     icon: UserCheck },
  student: { label: "Students", icon: GraduationCap },
  mentor:  { label: "Mentors",  icon: Users },
  alumni:  { label: "Alumni",   icon: Building2 },
  domain:  { label: "Domains",  icon: Layers },
};

const TYPE_ORDER: EntityType[] = ["lmp", "poc", "student", "mentor", "alumni", "domain"];

function routeFor(r: RawResult): string {
  switch (r.entity_type) {
    case "lmp":
      return `/lmp/${r.entity_id}`;
    case "poc":
      return `/poc/${encodeURIComponent(r.display_name)}`;
    case "student": {
      const roll = r.metadata?.roll_no;
      return roll ? `/students/${encodeURIComponent(String(roll))}` : `/data-sources?tab=sources`;
    }
    case "mentor":
      return `/mentors/${r.entity_id}`;
    case "alumni":
      return `/alumni`;
    case "domain":
      return `/data-sources?tab=sources`;
  }
}

function subFor(r: RawResult): string {
  const m = r.metadata || {};
  switch (r.entity_type) {
    case "lmp": return [m.company, m.role, m.status].filter(Boolean).join(" · ");
    case "poc": return [r.email, m.role_type, r.domain].filter(Boolean).join(" · ");
    case "student": return [m.roll_no, m.cohort, r.domain].filter(Boolean).join(" · ");
    case "mentor": return [m.source_label || m.source, m.company, r.domain].filter(Boolean).join(" · ");
    case "alumni": return [m.cohort, m.company, m.role].filter(Boolean).join(" · ");
    case "domain": return r.entity_id;
  }
}

export type GlobalSearchHandle = { focus: () => void };

export const GlobalSearch = forwardRef<GlobalSearchHandle, {
  scope?: EntityType;
  className?: string;
  /** Full-width layout for mobile search sheet. */
  mobile?: boolean;
  onNavigate?: () => void;
}>(
  function GlobalSearch({ scope, className, mobile = false, onNavigate }, ref) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<RawResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [focused, setFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const reqId = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // close on click outside
    useEffect(() => {
      const onDown = (e: MouseEvent) => {
        if (!containerRef.current?.contains(e.target as Node)) setFocused(false);
      };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, []);

    useEffect(() => {
      const trimmed = query.trim();
      if (!trimmed) { setResults([]); setLoading(false); return; }
      const myReq = ++reqId.current;
      setLoading(true);
      const t = setTimeout(async () => {
        try {
          const invokePromise = supabase.functions.invoke("entity-search", {
            body: { query: trimmed, limit: 24, ...(scope ? { entity_types: [scope] } : {}) },
          });
          const raced = await Promise.race([
            invokePromise,
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Search timed out")), 12_000);
            }),
          ]);
          const { data, error } = raced;
          if (myReq !== reqId.current) return;
          if (error) { setResults([]); return; }
          const json = (data ?? { results: [] }) as { results?: RawResult[] };
          setResults(json.results ?? []);
        } catch {
          if (myReq !== reqId.current) return;
          setResults([]);
        } finally {
          if (myReq === reqId.current) setLoading(false);
        }
      }, 160);
      return () => clearTimeout(t);
    }, [query, scope]);

    const grouped = useMemo(() => {
      const map = new Map<EntityType, RawResult[]>();
      for (const r of results) {
        if (scope && r.entity_type !== scope) continue;
        if (!map.has(r.entity_type)) map.set(r.entity_type, []);
        map.get(r.entity_type)!.push(r);
      }
      return TYPE_ORDER.filter(t => map.has(t)).map(t => ({ type: t, items: map.get(t)! }));
    }, [results, scope]);

    const flat = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

    useEffect(() => { setActiveIndex(0); }, [results]);

    const handleSelect = (r: RawResult) => {
      setFocused(false);
      setQuery("");
      navigate(routeFor(r));
      onNavigate?.();
    };

    const placeholder = scope
      ? `Search ${TYPE_META[scope].label.toLowerCase()}…`
      : "Search LMPs, POCs, students, mentors, alumni…";

    const showPanel = focused && (query.trim().length > 0);

    return (
      <div ref={containerRef} className={cn("relative", mobile ? "w-full" : "", className)}>
        <div className={cn(
          "inline-flex items-center gap-2 h-10 md:h-8 pl-2.5 pr-2 rounded-md border border-border bg-card/50 transition-all duration-150 focus-within:border-ring focus-within:bg-card",
          mobile ? "w-full" : "w-full md:w-auto md:min-w-[320px]",
        )}>
          <Search className="h-3.5 w-3.5 text-n400 shrink-0" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-[12.5px] text-n900 dark:text-d-text placeholder:text-n400 dark:placeholder:text-d-muted min-w-0"
            onKeyDown={(e) => {
              if (e.key === "Escape") { (e.target as HTMLInputElement).blur(); setFocused(false); }
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(flat.length - 1, i + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
              if (e.key === "Enter" && flat[activeIndex]) { e.preventDefault(); handleSelect(flat[activeIndex]); }
            }}
          />
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin text-n400 shrink-0" />
            : <kbd className="hidden md:inline text-[10px] text-n500 dark:text-d-muted bg-n100 dark:bg-d-surface-2 border border-n200/70 dark:border-d-border rounded px-1.5 py-[1px] font-sans shrink-0">⌘K</kbd>}
        </div>

        {showPanel && (
          <div className={cn(
            "absolute top-[calc(100%+6px)] max-h-[440px] overflow-y-auto rounded-[10px] border border-n200 dark:border-d-border bg-card dark:bg-d-surface shadow-lg z-50",
            mobile ? "left-0 right-0 w-full" : "right-0 w-full md:w-[420px]",
          )}>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                No matches for "{query}"
              </div>
            )}
            {!loading && grouped.map(({ type, items }) => {
              const Icon = TYPE_META[type].icon;
              return (
                <div key={type} className="py-1">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-[0.6px] text-n400 dark:text-d-muted">
                    {TYPE_META[type].label}
                  </div>
                  {items.map((r) => {
                    const idx = flat.indexOf(r);
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={`${type}-${r.entity_id}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                        className={cn(
                          "w-full text-left flex items-center gap-2 px-3 py-1.5",
                          isActive ? "bg-n100 dark:bg-d-surface-2" : "hover:bg-n100/60 dark:hover:bg-d-surface-2/60",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] truncate text-n900 dark:text-d-text">{r.display_name}</div>
                          {subFor(r) && (
                            <div className="text-[10.5px] text-muted-foreground truncate">{subFor(r)}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
