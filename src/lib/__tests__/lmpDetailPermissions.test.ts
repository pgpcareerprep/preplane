import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("LMP detailed-view operational permissions", () => {
  it("derives detailed read-only mode from real-user POC assignment", () => {
    const page = read("src/pages/LmpDetailPage.tsx");
    const viewing = read("src/lib/lmpViewingContext.tsx");

    expect(page).toContain("const { canOperateLmp } = useLmpPermission");
    expect(page).toContain("!canOperateLmp");
    expect(viewing).not.toContain('if (role === "admin" || role === "allocator") return "action"');
  });

  it("passes operational read-only state into active detailed tabs", () => {
    const page = read("src/pages/LmpDetailPage.tsx");
    const overview = read("src/components/lmp/UnifiedOverviewTab.tsx");
    // Sessions are now consolidated under MentorsTab → Assigned sub-tab (Phase 6
    // of the mentor rebuild), so SessionsLiveTab no longer appears as a top-level
    // tab in LmpDetailPage but is still rendered inside MentorsTab.
    const mentorsTab = read("src/components/lmp/detail/MentorsTab.tsx");

    expect(page).toContain("<MentorsTab");
    expect(page).not.toContain("<SessionsLiveTab");
    expect(page).toContain("<FeedbackTab");
    expect(mentorsTab).toContain("<SessionsLiveTab");
    expect(overview).toContain("const operationalReadOnly = readOnly || !canOperateLmp");
    expect(overview).toContain("readOnly={operationalReadOnly}");
  });

  it("keeps pipeline names visible and blocks read-only mutations", () => {
    const pipeline = read("src/components/lmp/execution/InteractivePipelineCard.tsx");
    const sessions = read("src/components/lmp/detail/SessionsLiveTab.tsx");

    expect(pipeline).toContain("whitespace-normal break-words");
    expect(pipeline).toContain("title={item.name}");
    expect(pipeline).toContain("if (readOnly) return");
    expect(sessions).toContain("Only an assigned POC can update sessions.");
    expect(sessions).toContain("Only an assigned POC can delete sessions.");
  });
});
