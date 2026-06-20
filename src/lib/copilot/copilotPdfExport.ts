import { parseBlocks, type CopilotBlock } from "@/lib/copilotBlocks";

export const COPILOT_PDF_DOWNLOAD_ACTION = "__COPILOT_DOWNLOAD_PDF__";

/** Match export / PDF download intent in natural language. */
export function isCopilotPdfExportRequest(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  const wantsPdf = /\b(pdf|\.pdf)\b/.test(text) || /\bdownload(?:able)?\b/.test(text) && /\b(export|save|file|report)\b/.test(text);
  const exportIntent = /\b(create|generate|make|export|download|save|get|give me|prepare)\b/.test(text);
  const docTarget = /\b(pdf|report|document|doc|file|this|above|previous|last answer|conversation|chat)\b/.test(text);
  if (wantsPdf && exportIntent) return true;
  if (/\bdownload\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  if (/\bexport\b/.test(text) && /\b(pdf|report|this)\b/.test(text)) return true;
  return exportIntent && docTarget && /\b(pdf|download|export|save)\b/.test(text);
}

function sanitiseFilename(raw: string): string {
  const base = raw.trim().slice(0, 80) || "copilot-report";
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "copilot-report";
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blockToLines(block: CopilotBlock): string[] {
  switch (block.type) {
    case "executive-summary":
      return [block.content || ""];
    case "text":
      return [block.content || ""];
    case "kpi-row":
      return (block.items || []).map((i) => `${i.label}: ${i.value}${i.delta ? ` (${i.delta})` : ""}`);
    case "alert-cards":
      return (block.alerts || []).map((a) => `${a.title}: ${a.body}`);
    case "recommendations":
      return (block.items || []).map((r, idx) => `${idx + 1}. ${r.action} — ${r.reason}`);
    default:
      return [];
  }
}

type JsPdfDoc = import("jspdf").jsPDF;

function ensureSpace(doc: JsPdfDoc, y: number, needed: number, margin: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function writeParagraph(doc: JsPdfDoc, text: string, x: number, y: number, maxWidth: number, lineHeight: number, margin: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight, margin);
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/** Build and download a PDF from a copilot assistant message (blocks + markdown). */
export async function downloadCopilotMessagePdf(content: string, title = "LMP Copilot Report"): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const { blocks, plainText } = parseBlocks(content || "");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title.slice(0, 120), margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleString()} · Preplane LMP Copilot`, margin, y);
  doc.setTextColor(0);
  y += 24;

  for (const block of blocks) {
    if (block.type === "table" && block.headers?.length) {
      y = ensureSpace(doc, y, 40, margin);
      if (block.title) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        y = writeParagraph(doc, block.title, margin, y, maxWidth, 16, margin);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y += 4;
      }
      autoTable(doc, {
        startY: y,
        head: [block.headers.map(String)],
        body: (block.rows || []).map((row) => row.map((cell) => String(cell ?? ""))),
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [255, 122, 26] },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
      continue;
    }

    const lines = blockToLines(block);
    if (!lines.length) continue;
    y = ensureSpace(doc, y, 20, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (block.type === "executive-summary") {
      y = writeParagraph(doc, "Summary", margin, y, maxWidth, 15, margin);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const line of lines) {
      y = writeParagraph(doc, stripMarkdown(line), margin, y, maxWidth, 14, margin);
      y += 4;
    }
    y += 8;
  }

  const body = stripMarkdown(plainText || content);
  if (body) {
    y = ensureSpace(doc, y, 24, margin);
    if (blocks.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      y = writeParagraph(doc, "Details", margin, y, maxWidth, 15, margin);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }
    y = writeParagraph(doc, body, margin, y, maxWidth, 14, margin);
  }

  if (!blocks.length && !body) {
    throw new Error("Nothing to export in this message.");
  }

  const filename = `${sanitiseFilename(title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
