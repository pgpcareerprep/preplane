import { useState, useCallback } from "react";
import { FileText, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJd, type JdData } from "@/lib/jdStore";
import { JdUploadModal } from "./JdUploadModal";
import { JdPreviewModal } from "./JdPreviewModal";

interface JdButtonProps {
  lmpId: string;
  role: string;
  company: string;
  domain?: string;
  seniority?: string;
  /** Compact mode for inline use in headers */
  compact?: boolean;
  /** Called when JD data changes (uploaded or removed) */
  onChange?: (data: JdData | null) => void;
  /** Disable the Add-JD action when the current user can't edit this LMP */
  readOnly?: boolean;
}

export function JdButton({ lmpId, role, company, domain, seniority, compact, onChange, readOnly }: JdButtonProps) {
  const [jdData, setJdData] = useJd(lmpId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleUploaded = useCallback((data: JdData) => {
    setJdData(data);
    onChange?.(data);
  }, [onChange, setJdData]);

  const handleRemoved = useCallback(() => {
    setJdData(null);
    onChange?.(null);
  }, [onChange, setJdData]);

  const handleReplace = useCallback(() => {
    setPreviewOpen(false);
    setUploadOpen(true);
  }, []);

  const hasJd = !!jdData;
  // Allow viewing an existing JD even in read-only; only block uploads.
  const disabled = !!readOnly && !hasJd;

  return (
    <>
      <button
        onClick={() => hasJd ? setPreviewOpen(true) : setUploadOpen(true)}
        disabled={disabled}
        title={disabled ? "Read-only — you are not a POC on this LMP" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          compact
            ? "text-[11px] px-2 py-1"
            : "text-[13px] px-3 py-2 shadow-sm",
          hasJd
            ? "bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
            : "bg-orange-500 text-white hover:bg-orange-600"
        )}
      >

        {hasJd ? (
          <>
            <Eye className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
            View JD
          </>
        ) : (
          <>
            <Plus className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
            Add JD
          </>
        )}
      </button>

      <JdUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        lmpId={lmpId}
        role={role}
        company={company}
        domain={domain}
        seniority={seniority}
        onUploaded={handleUploaded}
      />

      {jdData && (
        <JdPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          jdData={jdData}
          onRemoved={handleRemoved}
          onReplace={handleReplace}
        />
      )}
    </>
  );
}
