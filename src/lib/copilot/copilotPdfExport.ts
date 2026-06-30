import { parseBlocks, type CopilotBlock } from "@/lib/copilotBlocks";

export const COPILOT_PDF_DOWNLOAD_ACTION = "__COPILOT_DOWNLOAD_PDF__";

/** Match export / PDF download intent in natural language (single message). */
export function isCopilotPdfExportRequest(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  if (isCopilotMultiReportPdfRequest(message)) return false;
  const wantsPdf = /\b(pdf|\.pdf)\b/.test(text) || /\bdownload(?:able)?\b/.test(text) && /\b(export|save|file|report)\b/.test(text);
  const exportIntent = /\b(create|generate|make|export|download|save|get|give me|prepare)\b/.test(text);
  const docTarget = /\b(pdf|report|document|doc|file|this|above|previous|last answer|conversation|chat)\b/.test(text);
  if (wantsPdf && exportIntent) return true;
  if (/\bdownload\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  if (/\bexport\b/.test(text) && /\b(pdf|report|this)\b/.test(text)) return true;
  return exportIntent && docTarget && /\b(pdf|download|export|save)\b/.test(text);
}

/** Multi-section assembled report (not single-message export). */
export function isCopilotMultiReportPdfRequest(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  if (/\b(export|download)\s+(this|that|it|the above|above)\b/.test(text)) return false;
  if (/\b(last|previous)\s+answer\b/.test(text) && !/\bcombine\b/.test(text)) return false;
  if (/\bcombine\b/.test(text) && /\b(last\s+\d+|answers?|responses?)\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  if (/\b(assemble|combine)\b/.test(text) && /\breport\b/.test(text)) return true;
  if (/\breport\s+covering\b/.test(text)) return true;
  if (/\b(build|create|make|generate)\b/.test(text) && /\breport\b/.test(text) && /\b(covering|about|on|with)\b/.test(text)) return true;
  if (/\b(build|create|make|generate)\b/.test(text) && /\breport\b/.test(text) && /\b(pdf|download|export)\b/.test(text)) return true;
  if (/\b(everything|all answers|full conversation)\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  if (/\bsince\b/.test(text) && /\b(question|asked)\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  return false;
}

export type CopilotReportMessage = { role: string; content?: string; error?: boolean; streaming?: boolean };

export type CopilotReportSection = { title: string; content: string };

export type CopilotReportResolveResult =
  | { ok: true; sections: CopilotReportSection[]; reportTitle: string }
  | { ok: false; clarify: string };

const PDF_BOILERPLATE_RE = /PDF downloaded|Nothing to export|ready to download as a PDF/i;

function isExportableAssistantMessage(m: CopilotReportMessage): boolean {
  return m.role === "assistant" && !m.error && !m.streaming && Boolean(m.content?.trim()) && !PDF_BOILERPLATE_RE.test(m.content || "");
}

function sectionTitleFromContent(content: string, index: number): string {
  const { blocks, plainText } = parseBlocks(content);
  const summary = blocks.find((b) => b.type === "executive-summary");
  if (summary?.type === "executive-summary" && summary.content?.trim()) {
    return summary.content.trim().slice(0, 60);
  }
  const text = (plainText || content).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 60);
  return `Part ${index + 1}`;
}

/** Resolve which assistant turns to include in a multi-section PDF. */
export function resolveCopilotReportSections(
  message: string,
  messages: CopilotReportMessage[],
): CopilotReportResolveResult {
  const text = message.toLowerCase().trim();
  const assistants = messages.filter(isExportableAssistantMessage);

  if (!assistants.length) {
    return { ok: false, clarify: "There is nothing to export yet. Ask for reports first, then request a combined PDF." };
  }

  const lastN = text.match(/\blast\s+(\d+)\s+(?:answers?|responses?)\b/);
  if (lastN) {
    const n = Math.min(Math.max(parseInt(lastN[1], 10), 1), 20);
    const picked = assistants.slice(-n);
    return {
      ok: true,
      sections: picked.map((m, i) => ({ title: sectionTitleFromContent(m.content!, i), content: m.content! })),
      reportTitle: "Copilot Combined Report",
    };
  }

  if (/\b(everything|all answers|full conversation)\b/.test(text)) {
    return {
      ok: true,
      sections: assistants.map((m, i) => ({ title: sectionTitleFromContent(m.content!, i), content: m.content! })),
      reportTitle: "Copilot Conversation Report",
    };
  }

  const covering = message.match(/\b(?:report\s+covering|covering|about)\s+(.+?)\s+and\s+(.+?)(?:\s+as\s+|\s+into\s+|\s+in\s+|$)/i)
    ?? message.match(/\b(?:report\s+on|report\s+about)\s+(.+?)\s+and\s+(.+)/i);
  if (covering) {
    const kw1 = covering[1].trim().toLowerCase();
    const kw2 = covering[2].replace(/\b(pdf|report|please|thanks)\b.*$/i, "").trim().toLowerCase();
    const matched = assistants.filter((m) => {
      const c = (m.content || "").toLowerCase();
      return c.includes(kw1) && c.includes(kw2);
    });
    if (!matched.length) {
      return {
        ok: false,
        clarify: `I couldn't find assistant answers mentioning both "${covering[1].trim()}" and "${covering[2].trim()}". Try "combine the last 2 answers into a PDF" or name specific topics.`,
      };
    }
    return {
      ok: true,
      sections: matched.map((m, i) => ({ title: sectionTitleFromContent(m.content!, i), content: m.content! })),
      reportTitle: `Report: ${covering[1].trim()} & ${covering[2].trim()}`,
    };
  }

  const since = message.match(/\bsince\s+(?:my\s+last\s+question\s+about\s+)?(.+?)(?:\s+as\s+|\s+into\s+|\s+in\s+|\s+pdf|\s+report|$)/i);
  if (since) {
    const topic = since[1].trim().toLowerCase();
    let startIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && (m.content || "").toLowerCase().includes(topic)) {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0) {
      return {
        ok: false,
        clarify: `I couldn't find a prior question about "${since[1].trim()}". Try "last 2 answers" or "report covering X and Y".`,
      };
    }
    const picked = messages.slice(startIdx + 1).filter(isExportableAssistantMessage);
    if (!picked.length) {
      return { ok: false, clarify: "No assistant answers found after that question. Ask for content first, then export." };
    }
    return {
      ok: true,
      sections: picked.map((m, i) => ({ title: sectionTitleFromContent(m.content!, i), content: m.content! })),
      reportTitle: `Report since ${since[1].trim()}`,
    };
  }

  const reportOn = message.match(/\b(?:build|create|make|generate)\s+(?:me\s+)?(?:a\s+)?report\s+(?:on|about|for)\s+(.+?)(?:\s+as\s+|\s+into\s+|\s+in\s+|\s+pdf|\s+download|$)/i);
  if (reportOn) {
    const topic = reportOn[1].replace(/\b(pdf|please|thanks)\b.*$/i, "").trim().toLowerCase();
    const matched = assistants.filter((m) => (m.content || "").toLowerCase().includes(topic));
    if (!matched.length || matched.length > 5) {
      return {
        ok: false,
        clarify: matched.length > 5
          ? `Too many answers match "${reportOn[1].trim()}". Specify "last 2 answers" or "report covering X and Y".`
          : `No assistant answers mention "${reportOn[1].trim()}". Ask for that content first, or say "combine the last 2 answers into a PDF".`,
      };
    }
    return {
      ok: true,
      sections: matched.map((m, i) => ({ title: sectionTitleFromContent(m.content!, i), content: m.content! })),
      reportTitle: `Report on ${reportOn[1].trim()}`,
    };
  }

  return {
    ok: false,
    clarify:
      'Specify which answers to include, e.g. "combine the last 2 answers into a PDF", "report covering analytics and case study", or "everything since my last question about Stripe".',
  };
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

/** Convert a copilot block to exportable prose lines (for tests and non-tabular blocks). */
export function blockToLines(block: CopilotBlock): string[] {
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
    case "case-study-card": {
      const lines: string[] = [`${block.company} · ${block.role}`];
      if (block.domain) lines.push(`Domain: ${block.domain}`);
      if (block.situation) lines.push(`Situation: ${block.situation}`);
      if (block.prompt) lines.push(`Prompt: ${block.prompt}`);
      for (const item of block.rubric || []) {
        const pct = Math.round((item.weight ?? 0) * 100);
        lines.push(`Rubric — ${item.criterion} (${pct}%): ${item.description}`);
      }
      for (const step of block.model_answer_outline || []) {
        lines.push(`Outline: ${step}`);
      }
      return lines.filter(Boolean);
    }
    case "pipeline-card": {
      const lines: string[] = [block.title || "Pipeline"];
      if (block.entity) lines.push(`Entity: ${block.entity}`);
      if (block.current_stage) lines.push(`Current stage: ${block.current_stage}`);
      for (const stage of block.stages || []) {
        lines.push(`${stage.name}: ${stage.count}`);
      }
      return lines;
    }
    case "info-card": {
      const lines: string[] = [block.title || "Details"];
      if (block.status?.label) lines.push(`Status: ${block.status.label}`);
      for (const field of block.fields || []) {
        lines.push(`${field.label}: ${field.value}`);
      }
      return lines;
    }
    default:
      return [];
  }
}

type JsPdfDoc = import("jspdf").jsPDF;
type AutoTableFn = (doc: JsPdfDoc, options: Record<string, unknown>) => void;

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

function renderBlocksToDoc(
  doc: JsPdfDoc,
  blocks: CopilotBlock[],
  y: number,
  margin: number,
  maxWidth: number,
  autoTable: AutoTableFn,
): number {
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

    if (block.type === "mentor-shortlist-card" && block.shortlist?.length) {
      y = ensureSpace(doc, y, 40, margin);
      const subtitle = `${block.for_company} · ${block.for_role}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      y = writeParagraph(doc, subtitle, margin, y, maxWidth, 16, margin);
      if (block.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y = writeParagraph(doc, block.notes, margin, y, maxWidth, 14, margin);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Name", "Score", "Source"]],
        body: block.shortlist.map((m) => [m.name, String(m.score), m.source]),
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
    } else if (block.type === "case-study-card") {
      y = writeParagraph(doc, "Case Study", margin, y, maxWidth, 15, margin);
    } else if (block.type === "pipeline-card") {
      y = writeParagraph(doc, "Pipeline", margin, y, maxWidth, 15, margin);
    } else if (block.type === "info-card") {
      y = writeParagraph(doc, "Info", margin, y, maxWidth, 15, margin);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const line of lines) {
      y = writeParagraph(doc, stripMarkdown(line), margin, y, maxWidth, 14, margin);
      y += 4;
    }
    y += 8;
  }
  return y;
}

function renderPlainTextDetails(
  doc: JsPdfDoc,
  body: string,
  blocks: CopilotBlock[],
  y: number,
  margin: number,
  maxWidth: number,
): number {
  const stripped = stripMarkdown(body);
  if (!stripped) return y;
  y = ensureSpace(doc, y, 24, margin);
  if (blocks.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    y = writeParagraph(doc, "Details", margin, y, maxWidth, 15, margin);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  }
  return writeParagraph(doc, stripped, margin, y, maxWidth, 14, margin);
}

async function loadPdfLibs() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default as AutoTableFn };
}

function writeDocumentHeader(doc: JsPdfDoc, title: string, margin: number): number {
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
  return y + 24;
}

/** Build and download a PDF from a copilot assistant message (blocks + markdown). */
export async function downloadCopilotMessagePdf(content: string, title = "LMP Copilot Report"): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const { blocks, plainText } = parseBlocks(content || "");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = writeDocumentHeader(doc, title, margin);

  y = renderBlocksToDoc(doc, blocks, y, margin, maxWidth, autoTable);
  y = renderPlainTextDetails(doc, plainText || content, blocks, y, margin, maxWidth);

  if (!blocks.length && !stripMarkdown(plainText || content)) {
    throw new Error("Nothing to export in this message.");
  }

  const filename = `${sanitiseFilename(title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

/** Build and download a multi-section PDF from several assistant turns. */
export async function downloadCopilotReportPdf(
  sections: CopilotReportSection[],
  reportTitle = "LMP Copilot Report",
): Promise<void> {
  if (!sections.length) {
    throw new Error("Nothing to export in this report.");
  }

  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = writeDocumentHeader(doc, reportTitle, margin);

  let hasContent = false;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const { blocks, plainText } = parseBlocks(section.content || "");
    const body = stripMarkdown(plainText || section.content || "");
    if (!blocks.length && !body) continue;

    hasContent = true;
    y = ensureSpace(doc, y, 28, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    y = writeParagraph(doc, section.title || `Part ${i + 1}`, margin, y, maxWidth, 17, margin);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y += 6;

    y = renderBlocksToDoc(doc, blocks, y, margin, maxWidth, autoTable);
    y = renderPlainTextDetails(doc, plainText || section.content, blocks, y, margin, maxWidth);
    y += 12;
  }

  if (!hasContent) {
    throw new Error("Nothing to export in this report.");
  }

  const filename = `${sanitiseFilename(reportTitle)}-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
