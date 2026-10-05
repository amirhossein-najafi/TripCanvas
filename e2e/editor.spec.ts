import { expect, test } from "@playwright/test";

test("edits an activity and previews Plan my day before applying it", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("continue-ali").click();
  await page.waitForURL(/\/trips/);
  await page.goto("/trips/trip_tokyo/itinerary");
  await expect(page.getByTestId("activity-edit-act_breakfast")).toBeVisible();
  await page.getByTestId("activity-edit-act_breakfast").click();
  await expect(page.getByTestId("activity-status-done")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("plan-my-day").click();
  await page.getByTestId("build-day").click();
  await expect(page.getByTestId("plan-preview")).toBeVisible();
  await expect(page.getByTestId("keep-removed")).toBeChecked();
});
