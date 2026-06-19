import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Send, X, ChevronDown, Check, Search, Calendar, ShieldAlert } from "lucide-react";
import type { InlineFormBlock, FormField } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useLmpViewing, isUserPocOnRecord } from "@/lib/lmpViewingContext";
import { useRole } from "@/lib/rolesContext";

function FieldRenderer({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const base = "w-full rounded-xl border border-n200 bg-card px-3.5 py-2.5 text-[13px] text-n900 placeholder:text-n400 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all";

  switch (field.field_type) {
    case "text":
      return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={base} />;

    case "textarea":
      return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} rows={3} className={cn(base, "resize-none")} />;

    case "date":
      return (
        <div className="relative">
          <input type="date" value={value} onChange={e => onChange(e.target.value)} className={cn(base, "pr-10")} />
          <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400 pointer-events-none" />
        </div>
      );

    case "checkbox":
      return (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className="flex items-center gap-2.5 py-1"
        >
          <span className={cn(
            "h-5 w-5 rounded-md border-2 grid place-items-center transition-all",
            value === "true" ? "bg-orange-500 border-orange-500" : "border-n300 bg-card"
          )}>
            {value === "true" && <Check className="h-3 w-3 text-white" />}
          </span>
          <span className="text-[13px] text-n700">{field.label}</span>
        </button>
      );

    case "select":
      return (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(base, "flex items-center justify-between text-left", !value && "text-n400")}
          >
            <span className="truncate">{value || field.placeholder || "Select..."}</span>
            <ChevronDown className={cn("h-4 w-4 text-n400 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-n200 bg-card shadow-lg py-1"
            >
              {(field.options || []).map(opt => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
                  className={cn("w-full text-left px-3.5 py-2 text-[13px] hover:bg-orange-50 transition-colors", opt === value && "bg-orange-50 text-orange-700 font-medium")}
                >{opt}</button>
              ))}
            </motion.div>
          )}
        </div>
      );

    case "multi-select": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      const toggle = (opt: string) => {
        const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
        onChange(next.join(","));
      };
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map(opt => (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all",
                selected.includes(opt) ? "bg-orange-500 text-white border-orange-500" : "bg-card text-n700 border-n200 hover:border-orange-300"
              )}
            >{opt}</button>
          ))}
        </div>
      );
    }

    case "search-select": {
      const opts = (field.options || []).filter(o => o.toLowerCase().includes(search.toLowerCase()));
      return (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
            <input
              type="text"
              value={open ? search : value}
              onFocus={() => { setOpen(true); setSearch(""); }}
              onChange={e => { setSearch(e.target.value); setOpen(true); }}
              placeholder={field.placeholder || "Search..."}
              className={cn(base, "pl-9")}
            />
          </div>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-n200 bg-card shadow-lg py-1"
            >
              {opts.length === 0 && <div className="px-3.5 py-2.5 text-[12px] text-n400">No matches</div>}
              {opts.map(opt => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                  className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-orange-50 transition-colors"
                >{opt}</button>
              ))}
            </motion.div>
          )}
        </div>
      );
    }

    default:
      return <input type="text" value={value} onChange={e => onChange(e.target.value)} className={base} />;
  }
}

export function CopilotInlineForm({ block, onAction }: { block: InlineFormBlock; onAction: (cmd: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    block.fields.forEach(f => { init[f.name] = f.defaultValue || ""; });
    return init;
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "blocked">("idle");
  const [blockReason, setBlockReason] = useState<{ title: string; body: string; role?: string; action?: string } | null>(null);

  // Authorization context
  const { role } = useRole();
  const { currentUserName } = useLmpViewing();
  const { data: lmpRows = [] } = useLmpRows();

  const targetLmp = useMemo(() => {
    if (!block.target_lmp_id) return null;
    return lmpRows.find(r => r.id === block.target_lmp_id) ?? null;
  }, [lmpRows, block.target_lmp_id]);

  const setField = useCallback((name: string, val: string) => {
    setValues(prev => ({ ...prev, [name]: val }));
  }, []);

  const humanizeAction = (a?: string): string => {
    if (!a) return "perform this update";
    return a
      .replace(/^edit_/, "update ")
      .replace(/^update_/, "update ")
      .replace(/^assign_/, "assign ")
      .replace(/^create_/, "create ")
      .replace(/_/g, " ");
  };

  const preflightCheck = (): { ok: true } | { ok: false; reason: { title: string; body: string; role?: string; action?: string } } => {
    // Ownership gate — only for forms that edit an existing LMP (admin/allocator bypass).
    if (block.target_lmp_id && block.action && block.action !== "create_lmp") {
      if (role === "admin" || role === "allocator") return { ok: true };
      if (!targetLmp) {
        // LMP not in current user's visible rows — almost certainly not theirs
        return {
          ok: false,
          reason: {
            title: `You can't ${humanizeAction(block.action)}`,
            body: "This LMP process isn't in your assigned list. Only the assigned Prep / Support / Outreach POC can edit it.",
            role,
            action: block.action,
          },
        };
      }
      const isOwner = isUserPocOnRecord(targetLmp, currentUserName);
      if (!isOwner) {
        const ownerLabel =
          targetLmp.prepPoc?.name || targetLmp.supportPoc?.name || targetLmp.outreachPoc?.name || "another POC";
        const lmpLabel = `${targetLmp.company} · ${targetLmp.role}`;
        return {
          ok: false,
          reason: {
            title: `You can't ${humanizeAction(block.action)}`,
            body: `You are not assigned as a POC on ${lmpLabel}. Only the assigned Prep / Support / Outreach POC (${ownerLabel}) can edit this LMP.`,
            role,
            action: block.action,
          },
        };
      }
    }

    return { ok: true };
  };

  const handleSubmit = () => {
    const check = preflightCheck();
    if (check.ok === false) {
      setBlockReason(check.reason);
      setStatus("blocked");
      return;
    }
    // Build command from template
    let cmd = block.submit_action;
    Object.entries(values).forEach(([k, v]) => {
      cmd = cmd.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
    });
    setStatus("submitting");
    onAction(cmd);
  };

  if (status === "blocked" && blockReason) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-full bg-rose-100 grid place-items-center shrink-0">
            <ShieldAlert className="h-4.5 w-4.5 text-rose-600" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-rose-900">{blockReason.title}</div>
            <div className="text-[12.5px] text-rose-700 mt-1 leading-relaxed">{blockReason.body}</div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {blockReason.role && (
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-[11px] font-medium text-rose-700 uppercase tracking-wide">
                  Role: {blockReason.role}
                </span>
              )}
              {blockReason.action && (
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-[11px] font-medium text-rose-700 uppercase tracking-wide">
                  Action: {blockReason.action}
                </span>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => { setStatus("idle"); setBlockReason(null); }}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (status === "submitting") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-n200 bg-gradient-to-br from-n50 to-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-full bg-orange-100 grid place-items-center">
            <svg className="h-4 w-4 text-orange-600 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-n800">Submitting…</div>
            <div className="text-[12px] text-n500">Processing your request</div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-n200 bg-gradient-to-br from-white to-n50/50 shadow-sm overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3 border-b border-n100 bg-gradient-to-r from-orange-50/60 to-transparent">
        <h4 className="text-[14.5px] font-semibold text-n900">{block.title}</h4>
        {block.description && <p className="text-[12px] text-n500 mt-0.5">{block.description}</p>}
      </div>
      <div className="p-5 space-y-4">
        {block.fields.filter(f => f.field_type !== "checkbox").map(f => (
          <div key={f.name}>
            <label className="block text-[12px] font-medium text-n600 mb-1.5">
              {f.label} {f.required && <span className="text-red-400">*</span>}
            </label>
            <FieldRenderer field={f} value={values[f.name] || ""} onChange={v => setField(f.name, v)} />
          </div>
        ))}
        {block.fields.filter(f => f.field_type === "checkbox").map(f => (
          <FieldRenderer key={f.name} field={f} value={values[f.name] || "false"} onChange={v => setField(f.name, v)} />
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 px-5 pb-4">
        {block.cancel_label && (
          <button className="h-9 px-4 rounded-xl text-[12.5px] font-medium text-n600 hover:bg-n100 transition-colors">
            {block.cancel_label}
          </button>
        )}
        <button
          onClick={handleSubmit}
          className="h-9 px-5 rounded-xl bg-orange-500 text-white text-[12.5px] font-semibold hover:bg-orange-600 shadow-sm shadow-orange-200 transition-all flex items-center gap-1.5"
        >
          <Send className="h-3.5 w-3.5" /> {block.submit_label || "Submit"}
        </button>
      </div>
    </motion.div>
  );
}
