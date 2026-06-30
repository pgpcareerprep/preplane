import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ChevronDown, Search, Check } from "lucide-react";
import type { TableBlock } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";

export function CopilotTable({ block, onAction }: { block: TableBlock; onAction?: (cmd: string) => void }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilter, setShowFilter] = useState(false);

  const hasActions = block.row_actions && block.row_actions.length > 0;
  const selectable = block.selectable ?? false;

  const toggleSort = (col: number) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filteredRows = useMemo(() => {
    let rows = block.rows;
    if (filter) {
      const lf = filter.toLowerCase();
      rows = rows.filter(row => row.some(cell => String(cell).toLowerCase().includes(lf)));
    }
    if (sortCol !== null) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol!]; const bv = b[sortCol!];
        const an = typeof av === "number" ? av : parseFloat(String(av));
        const bn = typeof bv === "number" ? bv : parseFloat(String(bv));
        if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [block.rows, filter, sortCol, sortDir]);

  const toggleRow = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredRows.length) setSelected(new Set());
    else setSelected(new Set(filteredRows.map((_, i) => i)));
  };

  const handleRowAction = (actionTemplate: string, row: (string | number)[]) => {
    let cmd = actionTemplate;
    block.headers.forEach((h, i) => {
      cmd = cmd.replace(new RegExp(`\\{\\{${h}\\}\\}`, "g"), String(row[i] ?? ""));
    });
    onAction?.(cmd);
  };

  const handleBulkAction = () => {
    if (!block.selection_action || selected.size === 0) return;
    const selectedRows = filteredRows.filter((_, i) => selected.has(i));
    const summary = selectedRows.map(row => {
      let desc = block.selection_action!;
      block.headers.forEach((h, i) => {
        desc = desc.replace(new RegExp(`\\{\\{${h}\\}\\}`, "g"), String(row[i] ?? ""));
      });
      return desc;
    }).join("; ");
    onAction?.(summary);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-n200 bg-card shadow-sm overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          {block.title && <h4 className="text-[14px] font-semibold text-n900">{block.title}</h4>}
          <span className="text-[11px] text-n400 bg-n50 px-2 py-0.5 rounded-full font-medium">
            {filteredRows.length} {filteredRows.length === 1 ? "row" : "rows"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {selectable && selected.size > 0 && (
            <button
              onClick={handleBulkAction}
              className="h-7 px-3 rounded-lg bg-orange-500 text-white text-[11px] font-semibold hover:bg-orange-600 transition-colors"
            >
              Action on {selected.size} selected
            </button>
          )}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={cn("h-7 w-7 rounded-lg grid place-items-center transition-colors",
              showFilter ? "bg-orange-50 text-orange-500" : "text-n400 hover:text-n700 hover:bg-n100"
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="px-5 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter rows…"
              className="w-full h-8 rounded-control bg-n50 border border-n100 pl-8 pr-3 text-[12px] text-n800 placeholder:text-n400 outline-none focus:border-orange-200"
            />
          </div>
        </motion.div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-n50 border-y border-n100">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <button onClick={toggleAll} className={cn(
                    "h-4 w-4 rounded border-2 grid place-items-center transition-all",
                    selected.size === filteredRows.length && filteredRows.length > 0
                      ? "bg-orange-500 border-orange-500" : "border-n300"
                  )}>
                    {selected.size === filteredRows.length && filteredRows.length > 0 && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                </th>
              )}
              {block.headers.map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort(i)}
                    className={cn(
                      "inline-flex items-center gap-1 font-semibold uppercase tracking-[0.3px] text-[10.5px] hover:text-n900 transition-colors",
                      sortCol === i ? "text-orange-600" : "text-n500"
                    )}
                  >
                    {h}
                    <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </th>
              ))}
              {hasActions && <th className="px-4 py-2.5 text-right text-[10.5px] font-semibold text-n500 uppercase tracking-[0.3px]">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, ri) => (
              <tr key={ri} className={cn(
                "border-b border-n50 transition-colors",
                selected.has(ri) ? "bg-orange-50/60" : "hover:bg-orange-50/30"
              )}>
                {selectable && (
                  <td className="w-10 px-3 py-2.5">
                    <button onClick={() => toggleRow(ri)} className={cn(
                      "h-4 w-4 rounded border-2 grid place-items-center transition-all",
                      selected.has(ri) ? "bg-orange-500 border-orange-500" : "border-n300 hover:border-orange-300"
                    )}>
                      {selected.has(ri) && <Check className="h-2.5 w-2.5 text-white" />}
                    </button>
                  </td>
                )}
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 text-n800">{cell}</td>
                ))}
                {hasActions && (
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {block.row_actions!.map((action, ai) => (
                        <button key={ai}
                          onClick={() => handleRowAction(action.action, row)}
                          className={cn(
                            "h-6 px-2.5 rounded-md text-[10.5px] font-medium transition-colors",
                            action.variant === "primary" ? "bg-orange-500 text-white hover:bg-orange-600" :
                            action.variant === "danger" ? "text-red-500 hover:bg-red-50" :
                            "text-n600 hover:bg-n100"
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
