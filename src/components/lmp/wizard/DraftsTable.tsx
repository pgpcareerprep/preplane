import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDrafts, deleteDraft, type LmpDraft } from "@/lib/lmpDrafts";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function DraftsTable({ onResume }: { onResume: (draft: LmpDraft) => void }) {
  const { data: drafts = [], isLoading } = useDrafts();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (isLoading || drafts.length === 0) return null;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteDraft(id);
      await qc.invalidateQueries({ queryKey: ["lmp-drafts"] });
      toast.success("Draft deleted");
    } catch (e: any) {
      toast.error("Failed to delete draft", { description: e?.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-n100">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-500" strokeWidth={2} />
          <span className="text-[13.5px] font-semibold text-n900">Saved Drafts</span>
          <span className="rounded-full bg-n100 text-n600 text-[11px] font-medium px-2 py-0.5">
            {drafts.length}
          </span>
        </div>
        <span className="text-[11px] text-n500">Click a row to resume where you left off</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-n50/60 text-n500 text-[11px] uppercase tracking-[0.5px]">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold">Company</th>
              <th className="text-left px-3 py-2.5 font-semibold">Role</th>
              <th className="text-left px-3 py-2.5 font-semibold">Domain</th>
              <th className="text-left px-3 py-2.5 font-semibold">Step</th>
              <th className="text-left px-3 py-2.5 font-semibold">Last updated</th>
              <th className="text-right px-5 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-n100">
            {drafts.map((d) => (
              <tr
                key={d.id}
                onClick={() => onResume(d)}
                className="hover:bg-orange-50/30 cursor-pointer transition-colors"
              >
                <td className="px-5 py-3 text-n900 font-medium">{d.company || <span className="text-n400 italic">Untitled</span>}</td>
                <td className="px-3 py-3 text-n700">{d.role || <span className="text-n400 italic">—</span>}</td>
                <td className="px-3 py-3 text-n700">{d.domain || <span className="text-n400 italic">—</span>}</td>
                <td className="px-3 py-3">
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    d.step === 2
                      ? "bg-sky-50 text-sky-700 border-sky-200"
                      : "bg-orange-50 text-orange-700 border-orange-200",
                  )}>
                    Step {d.step}
                  </span>
                </td>
                <td className="px-3 py-3 text-n500 text-[12px]">{timeAgo(d.updated_at)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onResume(d)}
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-100"
                    >
                      Resume <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      disabled={deletingId === d.id}
                      className="inline-flex items-center rounded-md border border-n200 bg-card p-1.5 text-n500 hover:border-coral-300 hover:text-coral-600"
                      aria-label="Delete draft"
                    >
                      {deletingId === d.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
