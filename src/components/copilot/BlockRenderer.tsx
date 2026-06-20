import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CopilotBlock, ExecutiveSummaryBlock } from "@/lib/copilotBlocks";
import { CopilotSummary } from "./CopilotSummary";
import { getAggregatedLmpData, type AggregatedLmpReport } from "@/lib/reportAggregator";
import { CopilotActivityFeed } from "./CopilotActivityFeed";
import { CopilotKpiRow } from "./CopilotKpiRow";
import { CopilotBarChart } from "./CopilotBarChart";
import { CopilotDonutChart } from "./CopilotDonutChart";
import { CopilotAreaChart } from "./CopilotAreaChart";
import { CopilotFunnel } from "./CopilotFunnel";
import { CopilotTable } from "./CopilotTable";
import { CopilotTimeline } from "./CopilotTimeline";
import { CopilotKanban } from "./CopilotKanban";
import { CopilotHeatmap } from "./CopilotHeatmap";
import { CopilotAlertCards } from "./CopilotAlertCards";
import { CopilotRecommendations } from "./CopilotRecommendations";
import { CopilotFollowUps } from "./CopilotFollowUps";
import { CopilotStatusCards } from "./CopilotStatusCards";
import { CopilotProgressTracker } from "./CopilotProgressTracker";
import { CopilotInlineForm } from "./CopilotInlineForm";
import { CopilotActionButtons } from "./CopilotActionButtons";
import { CopilotConfirmationCard } from "./CopilotConfirmationCard";
import { CopilotInfoCard } from "./CopilotInfoCard";
import { CopilotPipelineCard } from "./CopilotPipelineCard";
import { CopilotDisambiguationCard } from "./CopilotDisambiguationCard";
import { CopilotPermissionDeniedCard } from "./CopilotPermissionDeniedCard";
import { CopilotJdSummaryCard } from "./CopilotJdSummaryCard";
import { CopilotMentorShortlistCard } from "./CopilotMentorShortlistCard";
import { CopilotCvGapCard } from "./CopilotCvGapCard";
import { CopilotPlanCard } from "./CopilotPlanCard";

export function BlockRenderer({ block, onFollowUp, onAction, lmpId }: {
  block: CopilotBlock;
  onFollowUp?: (prompt: string) => void;
  onAction?: (cmd: string) => void;
  lmpId?: string;
}) {
  // Unified action handler: actions are sent as user messages to the copilot
  const handleAction = (cmd: string) => {
    if (onAction) onAction(cmd);
    else if (onFollowUp) onFollowUp(cmd);
  };

  switch (block.type) {
    case "executive-summary":
      return <ExecutiveSummaryWithAggregation block={block} lmpId={lmpId} />;
    case "kpi-row":
      return <CopilotKpiRow block={block} />;
    case "bar-chart":
      return <CopilotBarChart block={block} />;
    case "donut-chart":
      return <CopilotDonutChart block={block} />;
    case "area-chart":
      return <CopilotAreaChart block={block} />;
    case "funnel":
      return <CopilotFunnel block={block} />;
    case "table":
      return <CopilotTable block={block} onAction={handleAction} />;
    case "timeline":
      return <CopilotTimeline block={block} />;
    case "kanban":
      return <CopilotKanban block={block} />;
    case "heatmap":
      return <CopilotHeatmap block={block} />;
    case "alert-cards":
      return <CopilotAlertCards block={block} />;
    case "recommendations":
      return <CopilotRecommendations block={block} />;
    case "follow-ups":
      return <CopilotFollowUps block={block} onSelect={onFollowUp ?? (() => {})} />;
    case "status-cards":
      return <CopilotStatusCards block={block} />;
    case "progress-tracker":
      return <CopilotProgressTracker block={block} />;
    case "inline-form":
      return <CopilotInlineForm block={block} onAction={handleAction} />;
    case "action-buttons":
      return <CopilotActionButtons block={block} onAction={handleAction} />;
    case "confirmation-card":
      return <CopilotConfirmationCard block={block} onAction={handleAction} />;
    case "info-card":
      return <CopilotInfoCard block={block} onAction={handleAction} />;
    case "pipeline-card":
      return <CopilotPipelineCard block={block} onAction={handleAction} />;
    case "activity-feed":
      return <CopilotActivityFeed block={block} onAction={handleAction} />;
    case "disambiguation-card":
      return <CopilotDisambiguationCard block={block} onAction={handleAction} />;
    case "permission-denied-card":
      return <CopilotPermissionDeniedCard block={block} onAction={handleAction} />;
    case "jd-summary-card":
      return <CopilotJdSummaryCard block={block} onAction={handleAction} />;
    case "mentor-shortlist-card":
      return <CopilotMentorShortlistCard block={block} onAction={handleAction} />;
    case "cv-gap-card":
      return <CopilotCvGapCard block={block} />;
    case "plan-card":
      return <CopilotPlanCard block={block} onAction={handleAction} />;
    case "text":
      return (
        <div className="prose prose-sm max-w-none text-[13.5px] text-n800 leading-[1.65] prose-strong:text-n900 prose-a:text-orange-600">
          <ReactMarkdown>{block.content}</ReactMarkdown>
        </div>
      );
    default: {
      const unknownType = (block as { type?: string })?.type ?? "unknown";
      if (typeof console !== "undefined") {
        console.warn("[BlockRenderer] Unknown block type:", unknownType, block);
      }
      return (
        <div className="rounded-md border border-dashed border-n300 bg-n50 px-3 py-2 text-[12px] text-n600">
          Unsupported block: <code className="font-mono text-n700">{unknownType}</code>
        </div>
      );
    }
  }
}

function ExecutiveSummaryWithAggregation({ block, lmpId }: { block: ExecutiveSummaryBlock; lmpId?: string }) {
  const [report, setReport] = useState<AggregatedLmpReport | null>(null);

  useEffect(() => {
    if (!lmpId) return;
    let cancelled = false;
    getAggregatedLmpData(lmpId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { /* degrade silently — show base block */ });
    return () => { cancelled = true; };
  }, [lmpId]);

  if (!lmpId || !report) return <CopilotSummary block={block} />;

  const extras: string[] = [];
  const p = report.pipeline;
  extras.push(`Pipeline: ${p.shortlisted}→${p.r1}→${p.r2}→${p.r3}`);
  if (p.offers > 0) extras.push(`Offers: ${p.offers}`);
  if (p.converted > 0) extras.push(`Converted: ${p.converted}`);
  const alignedMentors = report.mentors.filter((m) => m.status === "aligned" || m.status === "confirmed").length;
  if (report.mentors.length > 0) extras.push(`Mentors aligned: ${alignedMentors}/${report.mentors.length}`);
  if (report.source.conflicts.length > 0) extras.push(`Conflicts: ${report.source.conflicts.length} field(s)`);

  const enriched: ExecutiveSummaryBlock = {
    ...block,
    highlights: [...(block.highlights ?? []), ...extras],
  };
  return <CopilotSummary block={enriched} />;
}
