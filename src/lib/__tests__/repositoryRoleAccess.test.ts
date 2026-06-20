import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("POC and allocator Repository access", () => {
  it("allows all product roles into the Repository route while preserving role-specific labels", () => {
    const app = read("src/App.tsx");
    const navConfig = read("src/components/layout/navConfig.ts");

    expect(app).toContain('allowed={["admin", "allocator", "poc"]}>\n        <DataSourcesPage />');
    expect(navConfig).toContain('{ label: "Data Sources", to: "/data-sources", icon: Database }');
    expect(navConfig).toContain('roles: ["allocator", "poc"]');
    expect(navConfig).toContain('{ label: "Repository", to: "/data-sources", icon: Database }');
  });

  it("keeps Repository mutations admin-only", () => {
    const page = read("src/pages/DataSourcesPage.tsx");

    expect(page).toContain('onSync={isAdmin ? () => smartLmpSync.mutate() : undefined}');
    expect(page).toContain('onInspectMapping={isAdmin ? () => setMappingOpen(true) : undefined}');
    expect(page).toContain('<ExternalDiscoveryCard index={6} readOnly={isReadOnly} />');
    expect(page).toContain('readOnly={isReadOnly}');
  });

  it("removes destructive actions from non-admin record modals", () => {
    const alumni = read("src/components/datasources/AlumniViewAllModal.tsx");
    const lmps = read("src/components/datasources/ViewAllLmpsModal.tsx");
    const external = read("src/components/datasources/ExternalDiscoveryCard.tsx");

    expect(alumni).toContain("{!readOnly && (");
    expect(alumni).toContain("open={!readOnly && confirmOpen}");
    expect(lmps).toContain("{!readOnly && selectedIds.size > 0 && (");
    expect(lmps).toContain("open={!readOnly && confirmDelete}");
    expect(external).toContain("open={!readOnly && open}");
  });
});

describe("POC Settings visibility and read-only behavior", () => {
  it("shows the requested Settings tabs and routes to POCs", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/settings/SettingsLayout.tsx");

    for (const route of ["scoring", "feedback", "notifications", "lmp-guide"]) {
      expect(app).toContain(`path="${route}" element={<RouteRoleGate allowed={["admin", "allocator", "poc"]}>`);
    }
    for (const label of ["Scoring Weights", "Feedback Forms", "Notifications", "LMP Guide"]) {
      const item = layout.split("\n").find((line) => line.includes(`label: "${label}"`));
      expect(item).toContain('roles: ["admin", "allocator", "poc"]');
    }
  });

  it("keeps POC settings mutation controls read-only", () => {
    const scoring = read("src/pages/settings/ScoringWeightsPage.tsx");
    const feedback = read("src/pages/settings/FeedbackFormsPage.tsx");
    const notifications = read("src/pages/settings/NotificationsPage.tsx");
    const guide = read("src/pages/settings/LmpGuidePage.tsx");

    for (const source of [scoring, feedback, notifications, guide]) {
      expect(source).toContain('role === "admin" || role === "allocator"');
    }
    expect(feedback).toContain("<fieldset disabled={!canEdit}");
    expect(notifications).toContain("<fieldset disabled={!canEdit}");
    expect(scoring).toContain("disabled={!canEdit}");
  });
});
