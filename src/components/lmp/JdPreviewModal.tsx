import { ExternalLink, FileText, Trash2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteJd, clearJdInDb, type JdData } from "@/lib/jdStore";

interface JdPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jdData: JdData;
  onRemoved: () => void;
  onReplace: () => void;
}

export function JdPreviewModal({ open, onOpenChange, jdData, onRemoved, onReplace }: JdPreviewModalProps) {
  const handleRemove = () => {
    deleteJd(jdData.lmpId);
    void clearJdInDb(jdData.lmpId);
    onRemoved();
    onOpenChange(false);
  };

  const sourceLabel = jdData.source === "paste" ? "Pasted" : jdData.source === "link" ? "Linked" : "Uploaded";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16px] flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-500" />
            Job Description
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File / source info */}
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-2 text-n600">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />
              <span className="font-medium">{jdData.fileName}</span>
              <span className="text-n400">
                · {sourceLabel} on{" "}
                {new Date(jdData.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          </div>

          {/* Link */}
          {jdData.link && (
            <a
              href={jdData.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-orange-600 hover:text-orange-700 font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Open linked JD
            </a>
          )}

          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Role", v: jdData.role },
              { l: "Company", v: jdData.company },
              { l: "Seniority", v: jdData.seniority },
            ].map((f) => (
              <div key={f.l}>
                <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">{f.l}</div>
                <div className="text-[13px] text-n800 font-medium mt-0.5">{f.v}</div>
              </div>
            ))}
          </div>

          {/* Skills */}
          {jdData.skills.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
                Extracted Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {jdData.skills.map((s) => (
                  <span key={s} className="rounded-full bg-n100 border border-n200 px-2 py-0.5 text-[11px] text-n600 font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw text */}
          {jdData.rawText && jdData.source !== "link" && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">Content</p>
              <div className="rounded-lg bg-n50 border border-n200 p-3 max-h-[200px] overflow-y-auto">
                <p className="text-[12px] text-n600 leading-relaxed whitespace-pre-wrap">{jdData.rawText}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-n100">
            <Button
              variant="outline"
              size="sm"
              onClick={onReplace}
              className="gap-1.5 text-[12px]"
            >
              <RefreshCw className="h-3 w-3" /> Replace JD
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              className="gap-1.5 text-[12px] text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
