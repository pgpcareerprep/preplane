import { expect, test } from "@playwright/test";

const storageState = process.env.E2E_STORAGE_STATE;
const role = process.env.E2E_ROLE;

test.describe("authenticated role access", () => {
  test.skip(!storageState || !role, "Provide E2E_STORAGE_STATE and E2E_ROLE for seeded staging role tests");
  test.use({ storageState });

  test("core workspace and role routes are wired", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard", { exact: true }).first()).toBeVisible();

    await page.goto("/copilot");
    await expect(page.getByText("LMP Copilot", { exact: true }).first()).toBeVisible();

    await page.goto("/processes/new");
    if (role === "admin" || role === "allocator") {
      await expect(page).toHaveURL(/\/processes\/new/);
    } else {
      await expect(page).toHaveURL(/\/dashboard/);
    }

    await page.goto("/data-sources");
    if (role === "admin") {
      await expect(page).toHaveURL(/\/data-sources/);
    } else {
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });
});
