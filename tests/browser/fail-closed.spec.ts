import { expect, test } from "@playwright/test";

test("fails closed when the Convex deployment URL is invalid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect a Convex development deployment." })).toBeVisible();
  await expect(page.getByText("fails closed instead of connecting to a placeholder")).toBeVisible();
});
