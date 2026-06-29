import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useLmpProcesses } from "@/lib/hooks/useDbData";

interface LmpOption {
  id: string;
  label: string;
  sub: string;
}

interface QuickLmpPickerProps {
  value: string | null;
  onChange: (id: string, label: string) => void;
  pocFilter?: string | null;
}

export function QuickLmpPicker({ value, onChange, pocFilter }: QuickLmpPickerProps) {
  const [search, setSearch] = useState("");
  const { data: all = [] } = useLmpProcesses(pocFilter ? { pocName: pocFilter } : undefined);

  const options = useMemo<LmpOption[]>(() => {
    const lower = search.toLowerCase().trim();
    return (all as any[])
      .filter((r) =>
        !lower ||
        String(r.company ?? "").toLowerCase().includes(lower) ||
        String(r.role ?? "").toLowerCase().includes(lower)
      )
      .slice(0, 40)
      .map((r) => ({
        id: r.id,
        label: `${r.company} — ${r.role}`,
        sub: String(r.status ?? ""),
      }));
  }, [all, search]);

  const selected = useMemo(
    () => (all as any[]).find((r) => r.id === value),
    [all, value]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search LMP by company or role…"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {selected && !search && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
          {selected.company} — {selected.role}
        </div>
      )}

      {(search || !value) && (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {options.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No LMPs found</li>
          )}
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                className="w-full text-left px-3 py-3 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                style={{ minHeight: "48px" }}
                onClick={() => {
                  onChange(opt.id, opt.label);
                  setSearch("");
                }}
              >
                <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                {opt.sub && (
                  <span className="block text-xs text-muted-foreground mt-0.5 capitalize">{opt.sub}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
