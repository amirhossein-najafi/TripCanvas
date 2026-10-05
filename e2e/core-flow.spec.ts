import { expect, test, type Page } from "@playwright/test";

async function addPlace(page: Page, query: string, id: string) {
  const search = page.getByTestId("place-search");
  if (await search.isVisible()) {
    await page.getByTestId("add-place").click();
    await expect(search).toBeHidden();
  }
  await page.getByTestId("add-place").click();
  await search.fill(query);
  const option = page.getByTestId(`place-${id}`);
  await expect(option).toBeVisible();
  await option.click();
  await page.getByTestId("add-to-itinerary").click();
  await expect(page.getByTestId(`activity-${id}`)).toBeVisible();
  await expect(page.getByTestId("add-to-itinerary")).toBeHidden();
}

test("create a Tokyo trip, add Shibuya, and drag it to the next day", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("continue-ali").click();
  await page.waitForURL(/\/trips/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Your trips" })).toBeVisible();
  await page.getByTestId("destination-search").fill("Tokyo");
  await expect(page.getByTestId("destination-tokyo")).toBeVisible();
  await page.getByTestId("destination-tokyo").click();
  await page.getByTestId("create-trip").click();
  await page.waitForURL(/\/trips\/.+\/itinerary/);

  await addPlace(page, "Shibuya", "shibuya");
  await addPlace(page, "Meiji", "meiji");

  const card = page.getByTestId("activity-meiji");
  const chip = page.getByTestId("day-chip-2");
  const from = await card.boundingBox();
  const to = await chip.boundingBox();
  if (!from || !to) throw new Error("Could not measure the activity or day chip.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 24 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await chip.click();
  await expect(page.getByTestId("activity-meiji")).toBeVisible();
  await expect(page.getByTestId("marker-meiji")).toBeVisible({ timeout: 20_000 });
});
