import { expect, test } from "@playwright/test";

test("protected routes redirect anonymous users to login", async ({ page }) => {
  await page.goto("/processes/new");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole("heading", { name: "Login to PrepLane Tool" })).toBeVisible();
});

test("invalid public feedback links fail safely", async ({ page }) => {
  await page.goto("/feedback/not-a-valid-token");
  await expect(page.getByText(/invalid|expired|not found/i).first()).toBeVisible();
});
