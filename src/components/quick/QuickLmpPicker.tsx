import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { useLmpProcesses } from "@/lib/hooks/useDbData";
import { ACTIVE_LMP_STATUSES } from "@/lib/config/lmpStatus";

interface LmpPickerFilters {
  pocId?: string | null;
  pocName?: string | null;
  /** If true, only show active LMPs */
  activeOnly?: boolean;
}

interface QuickLmpPickerProps {
  value: string | null;
  onChange: (id: string, label: string, row?: any) => void;
  filters?: LmpPickerFilters;
}

/** Shared mobile LMP card — consistent across all /quick screens */
export function QuickLmpCard({
  company,
  role,
  status,
  selected,
  onClick,
}: {
  company: string;
  role: string;
  status?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const statusLabel = (status ?? "").toLowerCase().replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-2xl border px-4 py-3.5 transition-all active:scale-[0.98]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-border/80 hover:bg-muted/30",
      ].join(" ")}
      style={{ minHeight: "64px" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{company}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{role}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 mt-0.5">
          {status && (
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {statusLabel}
            </span>
          )}
          {selected && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function QuickLmpPicker({ value, onChange, filters }: QuickLmpPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { pocId, pocName, activeOnly } = filters ?? {};

  const queryFilters = useMemo(() => {
    if (pocId) return { pocId };
    if (pocName) return { pocName };
    return undefined;
  }, [pocId, pocName]);

  const { data: all = [] } = useLmpProcesses(queryFilters);

  const options = useMemo(() => {
    const lower = search.toLowerCase().trim();
    let rows = all as any[];
    if (activeOnly) {
      rows = rows.filter((r) => ACTIVE_LMP_STATUSES.includes(String(r.status ?? "")));
    }
    if (lower) {
      rows = rows.filter(
        (r) =>
          String(r.company ?? "").toLowerCase().includes(lower) ||
          String(r.role ?? "").toLowerCase().includes(lower)
      );
    }
    return rows.slice(0, 60);
  }, [all, search, activeOnly]);

  const selectedRow = useMemo(
    () => (all as any[]).find((r) => r.id === value),
    [all, value]
  );

  if (!open && selectedRow) {
    return (
      <div className="space-y-2">
        <QuickLmpCard
          company={selectedRow.company ?? ""}
          role={selectedRow.role ?? ""}
          status={selectedRow.status}
          selected
          onClick={() => { setOpen(true); setSearch(""); }}
        />
        <button
          onClick={() => { onChange("", ""); setOpen(true); }}
          className="w-full text-xs text-muted-foreground underline underline-offset-2 py-1"
        >
          Change LMP
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search by company or role…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (
        <ul className="max-h-72 overflow-y-auto rounded-2xl border border-border divide-y divide-border bg-card">
          {options.length === 0 && (
            <li className="px-4 py-4 text-sm text-muted-foreground text-center">
              {search ? "No LMPs found" : "No LMPs available"}
            </li>
          )}
          {options.map((row: any) => (
            <li key={row.id}>
              <button
                className="w-full text-left px-4 py-3.5 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                style={{ minHeight: "56px" }}
                onClick={() => {
                  onChange(row.id, `${row.company} — ${row.role}`, row);
                  setSearch("");
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium leading-snug line-clamp-1">{row.company}</span>
                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{row.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
