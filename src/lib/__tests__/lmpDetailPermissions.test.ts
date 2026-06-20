import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("LMP detailed-view operational permissions", () => {
  it("derives operational read-only mode from real-user POC assignment", () => {
    const page = read("src/pages/LmpDetailPage.tsx");
    const viewing = read("src/lib/lmpViewingContext.tsx");

    expect(page).toContain("const { canOperateLmp } = useLmpPermission");
    expect(page).toContain("operationalReadOnly");
    expect(page).toContain("!canOperateLmp");
    expect(page).not.toContain("inert");
    expect(viewing).not.toContain('if (role === "admin" || role === "allocator") return "action"');
  });

  it("passes operational read-only state into active detailed tabs without blocking view interactions", () => {
    const page = read("src/pages/LmpDetailPage.tsx");
    const overview = read("src/components/lmp/UnifiedOverviewTab.tsx");
    const mentorsTab = read("src/components/lmp/detail/MentorsTab.tsx");

    expect(page).toContain("<MentorsTab");
    expect(page).not.toContain("<SessionsLiveTab");
    expect(page).toContain("<FeedbackTab");
    expect(page).toContain("View-only process access");
    expect(mentorsTab).toContain("<SessionsLiveTab");
    expect(overview).toContain("const operationalReadOnlyMode = operationalReadOnly ?? !canOperateLmp");
    expect(overview).toContain("canManageJd={canManageLmp}");
  });

  it("keeps pipeline names visible and blocks read-only mutations", () => {
    const pipeline = read("src/components/lmp/execution/InteractivePipelineCard.tsx");
    const sessions = read("src/components/lmp/detail/SessionsLiveTab.tsx");

    expect(pipeline).toContain("truncate whitespace-nowrap");
    expect(pipeline).toContain("title={item.name}");
    expect(pipeline).toContain("if (readOnly) return");
    expect(sessions).toContain("Only an assigned POC can update sessions.");
    expect(sessions).toContain("Only an assigned POC can delete sessions.");
  });
});
