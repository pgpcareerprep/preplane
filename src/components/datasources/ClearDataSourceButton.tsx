import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import { usePermission } from "@/lib/rolesContext";

type SourceKey = "mentor_union" | "student_db" | "alumni_db";

const TABLE_BY_SOURCE: Record<SourceKey, "mentors" | "students" | "alumni_records"> = {
  mentor_union: "mentors",
  student_db: "students",
  alumni_db: "alumni_records",
};

export function ClearDataSourceButton({
  source,
  label,
  count,
  onCleared,
}: {
  source: SourceKey;
  label: string;
  count: number;
  onCleared?: () => void;
}) {
  const { isAdmin } = usePermission();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return null;

  const handle = async () => {
    setBusy(true);
    try {
      const table = TABLE_BY_SOURCE[source];
      const { error } = await supabase.from(table).delete().not("id", "is", null);
      if (error) throw error;
      // Alumni mirror cleanup: delete alumni-mirrored mentor rows too
      if (source === "alumni_db") {
        await supabase.from("mentors").delete().eq("sync_source", "alumni_mirror");
      }
      await supabase.rpc("refresh_data_source_status", { _source: source });
      try {
        await supabase.from("activity_log").insert({
          actor_name: "Admin",
          entity_type: source,
          action: `${source}_wipe`,
          source: "ui",
          metadata: { count },
        });
      } catch (e) {
        log.warn("[ClearDataSourceButton] activity_log insert failed", e);
      }
      await qc.invalidateQueries();
      toast.success(`Cleared ${count} ${label}`);
      setOpen(false);
      setText("");
      onCleared?.();
    } catch (e: any) {
      toast.error(e?.message || `Failed to clear ${label}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={count === 0 || busy}
        className="mr-8 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-red-200 text-red-600 hover:bg-red-50 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Clear database
      </button>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {count} {label}
              {source === "alumni_db" ? " and remove alumni-mirrored mentors from Mentor Union" : ""}.
              This cannot be undone.
              <br /><br />
              Type <span className="font-mono font-semibold text-red-600">DELETE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type DELETE"
            className="w-full h-9 rounded-md border border-n300 px-3 text-[13px] focus:outline-none focus:border-red-400"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handle(); }}
              disabled={text !== "DELETE" || busy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {busy ? "Deleting…" : `Delete ${count} records`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
