/**
 * @fileoverview Behavior tests for the reset flow.
 *
 * Two bugs from the 2026-08-24 adversarial review:
 *
 * 1. Race — handleFetchUrl wrote its results unconditionally after the await,
 *    so resetting while a fetch was in flight let the late response resurrect
 *    the results onto a supposedly cleared page.
 * 2. Layout — the top "Start over" bar appeared as soon as anything was typed,
 *    inserting itself ABOVE the input mid-keystroke and shoving the field the
 *    user was typing into ~140px down the page.
 */

import { test, expect } from "@playwright/test";

const RESET_BUTTON = 'button[aria-label="Clear everything and start a new analysis"]';

test("reset during an in-flight fetch does not resurrect results", async ({ page }) => {
  // A proxy response slow enough to click through, controlled entirely locally.
  await page.route("**/api/fetch", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      json: {
        ok: true,
        url: "https://slow.example",
        finalUrl: "https://slow.example",
        redirectChain: [],
        statusCode: 200,
        contentType: "text/html",
        head: '<html lang="en"><head><title>Slow Site Title</title><meta property="og:title" content="Slow Site Title"></head>',
        bodySnippet: "slow body",
        fetchedAt: new Date().toISOString(),
        timing: 1500,
      },
    });
  });
  await page.route("**/api/ai-check**", (route) =>
    route.fulfill({ json: { ok: true, robotsTxt: null, llmsTxt: null } }),
  );

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="url"]', "https://slow.example");
  await page.getByRole("button", { name: "Fetch", exact: true }).click();

  // Reset while the response is still in flight.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator('input[type="url"]')).toHaveValue("");

  // Let the late response land, then prove it changed nothing.
  await page.waitForTimeout(2500);
  await expect(page.locator("text=Slow Site Title")).toHaveCount(0);
  await expect(page.locator(RESET_BUTTON)).toHaveCount(0);
  await expect(page.locator('input[type="url"]')).toHaveValue("");
});

test("top reset bar waits for an analysis instead of jumping in mid-keystroke", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Untouched page: no reset controls anywhere.
  await expect(page.locator(RESET_BUTTON)).toHaveCount(0);

  // Typing alone must not summon the bar — it sits above the input, so
  // appearing now would shove the focused field down the page.
  await page.fill('input[type="url"]', "example");
  await page.waitForTimeout(400);
  await expect(page.locator(RESET_BUTTON)).toHaveCount(0);

  // A completed analysis is what earns it — top and bottom.
  await page.click('button:has-text("Paste HTML")');
  await page.click('button:has-text("Load Example")');
  await page.waitForSelector("text=Analyzed", { timeout: 10000 });
  await expect(page.locator(RESET_BUTTON)).toHaveCount(2);
});
