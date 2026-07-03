import { useState } from "react";
import { Copy, Share2, MoreHorizontal, Volume2, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { parseBlocks, type TableBlock } from "@/lib/copilotBlocks";
import { downloadCopilotMessagePdf } from "@/lib/copilot/copilotPdfExport";
import { speak as speakTts } from "@/lib/voice/speakTts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function copyableText(content: string): string {
  const { blocks, plainText } = parseBlocks(content || "");
  if (plainText.trim()) return plainText.trim();
  return blocks
    .filter((b) => b.type === "text" && "content" in b)
    .map((b) => String((b as { content: string }).content))
    .join("\n\n")
    .trim() || content.replace(/:::blocks[\s\S]*?:::/g, "").trim();
}

function tableBlocks(content: string): TableBlock[] {
  const { blocks } = parseBlocks(content || "");
  return blocks.filter((b): b is TableBlock => b.type === "table");
}

function downloadTablesCsv(tables: TableBlock[], baseName: string) {
  const lines: string[] = [];
  tables.forEach((t, i) => {
    if (i > 0) lines.push("");
    if (t.title) lines.push(`# ${t.title}`);
    lines.push(t.headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","));
    for (const row of t.rows) {
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const iconBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg border border-n200 bg-card text-n600 hover:text-n900 hover:border-n300 hover:bg-n50 transition-colors";

export function CopilotMessageActions({
  content,
  exportTitle,
}: {
  content: string;
  exportTitle?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const tables = tableBlocks(content);
  const hasTabular = tables.length > 0;
  const title = exportTitle ?? "copilot-report";

  const onCopy = async () => {
    const text = copyableText(content);
    if (!text) {
      toast.error("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const onSpeak = async () => {
    const text = copyableText(content);
    if (!text) {
      toast.error("Nothing to read aloud");
      return;
    }
    setSpeaking(true);
    try {
      await speakTts(text.slice(0, 1200));
    } catch (e) {
      toast.error("Could not play audio", { description: (e as Error).message });
    } finally {
      setSpeaking(false);
    }
  };

  const onPdf = () => {
    void downloadCopilotMessagePdf(content, title)
      .then(() => toast.success("PDF downloaded"))
      .catch((e: Error) => toast.error("PDF export failed", { description: e.message }));
  };

  const onCsv = () => {
    try {
      downloadTablesCsv(tables, title);
      toast.success("Table exported");
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    }
  };

  return (
    <div className="mt-3 flex items-center gap-1">
      <button type="button" className={iconBtn} title="Copy" aria-label="Copy" onClick={() => void onCopy()}>
        <Copy className="h-3.5 w-3.5" />
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn(iconBtn, "opacity-50 cursor-not-allowed")} disabled aria-label="Share">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Share links are not available yet</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={iconBtn} title="More actions" aria-label="More actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => void onSpeak()} disabled={speaking}>
            <Volume2 className="h-3.5 w-3.5 mr-2" />
            Speak out loud
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onPdf}>
            <Download className="h-3.5 w-3.5 mr-2" />
            Download as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hasTabular && (
        <button type="button" className={iconBtn} title="Export table" aria-label="Export table" onClick={onCsv}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
