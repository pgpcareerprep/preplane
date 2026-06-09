import { describe, expect, it } from "vitest";
import { isMentorCoverageQuery, shouldPrefetchRag } from "../../../supabase/functions/_shared/copilotFastPaths";

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
});
