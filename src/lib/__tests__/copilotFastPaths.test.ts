import { describe, expect, it } from "vitest";
import { isConversionCountQuery, isMentorCoverageQuery, isPocWorkloadQuery, shouldPrefetchRag } from "../../../supabase/functions/_shared/copilotFastPaths";

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

  it("recognizes simple conversion count questions", () => {
    expect(isConversionCountQuery("Tell me how many are converted?")).toBe(true);
    expect(isConversionCountQuery("Show conversion trends by domain")).toBe(false);
  });
});
