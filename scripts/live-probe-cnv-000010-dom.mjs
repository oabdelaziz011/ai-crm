/**
 * Live DOM probe for CNV-000010 structured message rendering.
 * Uses Playwright + magic-link login (URL read from artifacts/inbox-login-url.txt).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loginUrl = readFileSync(resolve(projectRoot, "artifacts/inbox-login-url.txt"), "utf8").trim();

const { chromium } = await import("playwright");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForURL(/\/dashboard\/omnichannel/, { timeout: 60000 });
  await page.waitForTimeout(2000);

  const cnvButton = page.locator("button").filter({ hasText: "CNV-000010" }).first();
  await cnvButton.waitFor({ timeout: 15000 });
  await cnvButton.click();
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll(".rounded-xl.border.px-3.py-2.text-sm")];
    const results = bubbles.map((bubble, index) => {
      const text = bubble.textContent?.trim() ?? "";
      const buttonChips = [...bubble.querySelectorAll("span.rounded-full")].map((el) => el.textContent?.trim());
      const listTrigger = bubble.querySelector("span.rounded-lg");
      const listTriggerText = listTrigger?.textContent?.trim() ?? null;
      const sectionBlocks = bubble.querySelectorAll(".rounded-lg.border.border-white\\/10").length;
      const hasListTreeIcon = Boolean(bubble.querySelector("svg.lucide-list-tree"));
      return {
        index,
        textPreview: text.slice(0, 80),
        buttonChips,
        listTriggerText,
        sectionBlocks,
        hasListTreeIcon,
        innerHTMLPreview: bubble.innerHTML.slice(0, 400),
      };
    });

    const targetTexts = ["please press on what you want", "Pick the option that fits you best.", "Do you want to proceed with reservation?"];
    const targets = targetTexts.map((needle) => {
      const match = results.find((r) => r.textPreview.includes(needle.slice(0, 20)));
      return { needle, match: match ?? null };
    });

    return {
      bubbleCount: results.length,
      targets,
      outgoingSamples: results.filter((r) =>
        r.textPreview.includes("please press") ||
        r.textPreview.includes("Pick the option") ||
        r.textPreview.includes("Do you want to proceed"),
      ),
    };
  });

  console.log(JSON.stringify(probe, null, 2));

  await page.screenshot({
    path: resolve(projectRoot, "artifacts/live-cnv-000010-probe.png"),
    fullPage: true,
  });
  console.log("screenshot: artifacts/live-cnv-000010-probe.png");
} finally {
  await browser.close();
}
