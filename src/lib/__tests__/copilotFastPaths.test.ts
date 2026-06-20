import { describe, expect, it } from "vitest";
import { isConversionCountQuery, isConversionReportQuery, isCopilotPdfExportQuery, isMentorCoverageQuery, isPocConversionMetricsQuery, isPocProgressReportQuery, isPocWorkloadQuery, shouldPrefetchRag } from "../../../supabase/functions/_shared/copilotFastPaths";

describe("Copilot fast paths", () => {
  it("recognizes ongoing LMPs missing mentor alignment", () => {
    expect(isMentorCoverageQuery("Which ongoing LMP processes don't have a mentor aligned yet?")).toBe(true);
    expect(isMentorCoverageQuery("Show active processes without mentors")).toBe(true);
    expect(isMentorCoverageQuery("Find a mentor for Sam")).toBe(false);
  });

  it("prefetches RAG only for semantic discovery", () => {
    expect(shouldPrefetchRag("Find similar past finance processes")).toBe(true);
    expect(shouldPrefetchRag("Show ongoing LMPs without a mentor")).toBe(false);
  });

  it("recognizes POC workload reports", () => {
    expect(isPocWorkloadQuery("Show me every POC's current active load, max threshold, conversion rate, and capacity.")).toBe(true);
    expect(isPocWorkloadQuery("Find the POC for Google")).toBe(false);
  });

  it("recognizes POC conversion / performance follow-ups", () => {
    expect(isPocConversionMetricsQuery("show the conversion and performance percentage poc wise")).toBe(true);
    expect(isPocWorkloadQuery("show the conversion and performance percentage poc wise")).toBe(true);
    expect(isPocConversionMetricsQuery("Break down conversion by POC")).toBe(true);
    expect(isConversionReportQuery("show conversion breakdown by poc")).toBe(true);
    expect(isPocConversionMetricsQuery("How is Google doing?")).toBe(false);
  });

  it("recognizes prep POC progress report requests", () => {
    expect(isPocProgressReportQuery("create a progress report of all the prep poc")).toBe(true);
    expect(isPocWorkloadQuery("create a progress report of all the prep poc")).toBe(true);
    expect(isPocProgressReportQuery("Show conversion trends by domain")).toBe(false);
  });

  it("recognizes simple conversion count questions", () => {
    expect(isConversionCountQuery("Tell me how many are converted?")).toBe(true);
    expect(isConversionCountQuery("Show conversion trends by domain")).toBe(false);
    expect(isConversionCountQuery("please create a lmp conversion and student place conversion report")).toBe(false);
  });

  it("recognizes LMP and student placement conversion report requests", () => {
    expect(isConversionReportQuery("please create a lmp conversion and student place conversion report")).toBe(true);
    expect(isConversionReportQuery("Generate an LMP conversion report")).toBe(true);
    expect(isConversionReportQuery("Tell me how many are converted?")).toBe(false);
  });

  it("recognizes PDF export / download requests", () => {
    expect(isCopilotPdfExportQuery("create a downloadable pdf of this")).toBe(true);
    expect(isCopilotPdfExportQuery("download this report as pdf")).toBe(true);
    expect(isCopilotPdfExportQuery("export the above as PDF")).toBe(true);
    expect(isCopilotPdfExportQuery("show POC workload")).toBe(false);
  });
});
