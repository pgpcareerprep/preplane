import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LMP_MENTOR_SUGGESTION_LIMIT, TOTAL_LIMIT } from "@/lib/config/thresholds";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("LMP Mentors tab scoped improvements", () => {
  it("uses an expanded LMP-only suggestion limit without changing the shared default", () => {
    const tab = read("src/components/lmp/detail/MentorsTab.tsx");
    const pipeline = read("src/lib/mentorPipeline.ts");

    expect(TOTAL_LIMIT).toBe(15);
    expect(LMP_MENTOR_SUGGESTION_LIMIT).toBe(30);
    expect(tab).toContain("LMP_MENTOR_SUGGESTION_LIMIT");
    expect(pipeline).toContain("suggestionLimit = TOTAL_LIMIT");
  });

  it("passes optional industries through existing match context", () => {
    const modal = read("src/components/lmp/detail/mentors/MatchContextModal.tsx");
    const tab = read("src/components/lmp/detail/MentorsTab.tsx");

    expect(modal).toContain("selectedIndustries");
    expect(modal).toContain("Required Industries");
    expect(tab).toContain("context?.selectedIndustries");
    expect(tab).toContain("const jdIndustry = Array.from(new Set(");
  });

  it("shows immediate matching feedback and reuses existing sessions UI in Assigned", () => {
    const modal = read("src/components/lmp/detail/mentors/MatchContextModal.tsx");
    const tab = read("src/components/lmp/detail/MentorsTab.tsx");

    expect(modal).toContain("Running mentor matching…");
    expect(modal).toContain("disabled={!canRun || starting}");
    expect(tab).toContain('<SessionsLiveTab lmpId={reqId} readOnly={readOnly} />');
  });
});
