/**
 * Verify UX-2 Company AI Access: registry-driven cards + preserved ai_chat toggle.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadDevScriptEnv,
  resolveLoginAppBaseUrl,
  resolveLoginCredentials,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const loginAppBaseUrl = resolveLoginAppBaseUrl(env);
const { email, password } = resolveLoginCredentials(env);
const screenshotsDir = resolve(root, "artifacts/login-app/docs/ux-2-company-ai-access");
const { mkdirSync } = await import("node:fs");
mkdirSync(screenshotsDir, { recursive: true });

const registrySource = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/platform-ai/company-ai-feature-registry.ts"),
  "utf8",
);

const registryChecks = {
  hasAiChatLive: registrySource.includes('id: "ai_chat"') && registrySource.includes('backendFeatureKey: "ai_chat"'),
  hasComingSoonFeatures: registrySource.includes('availability: "coming_soon"'),
  hasCategories: registrySource.includes('"core"') && registrySource.includes('"advanced"'),
};

const { chromium } = await import("../artifacts/login-app/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${loginAppBaseUrl}/login`, { waitUntil: "networkidle", timeout: 120_000 });
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
await page.waitForTimeout(3000);

await page.goto(`${loginAppBaseUrl}/dashboard/settings/platform-ai`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.waitForTimeout(4000);

const companySelector = page.getByRole("combobox").first();
if (await companySelector.isVisible().catch(() => false)) {
  await companySelector.click();
  await page.waitForTimeout(500);
  const firstCompany = page.locator('[cmdk-item]').first();
  if (await firstCompany.isVisible().catch(() => false)) {
    await firstCompany.click();
    await page.waitForTimeout(2000);
  } else {
    const fallbackOption = page.getByText(/demo|vault|company/i).first();
    if (await fallbackOption.isVisible().catch(() => false)) {
      await fallbackOption.click();
      await page.waitForTimeout(2000);
    }
  }
}

const bodyText = await page.locator("body").innerText();
const hasCompanySummary = /enabled features|ai status|plan/i.test(bodyText);
const hasCategoryGroups = /core ai|communication|intelligence|advanced/i.test(bodyText);
const hasAiChatCard = /ai chat/i.test(bodyText);
const hasComingSoon = /coming soon/i.test(bodyText);
const hasKnowledgeBase = /knowledge base/i.test(bodyText);

await page.screenshot({
  path: resolve(screenshotsDir, "after-company-ai-access.png"),
  fullPage: true,
});

if (await companySelector.isVisible().catch(() => false)) {
  await companySelector.click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(screenshotsDir, "after-company-selector-search.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
}

const aiChatSwitch = page.locator('[aria-label="AI Chat"], [aria-label="دردشة الذكاء الاصطناعي"]').first();
let aiChatToggleWorks = false;
if (await aiChatSwitch.isVisible().catch(() => false)) {
  const before = await aiChatSwitch.getAttribute("data-state");
  await aiChatSwitch.click();
  await page.waitForTimeout(1500);
  const after = await aiChatSwitch.getAttribute("data-state");
  aiChatToggleWorks = before !== after;
  await aiChatSwitch.click();
  await page.waitForTimeout(1000);
}

await browser.close();

const result = {
  registryChecks,
  uiChecks: {
    hasCompanySummary,
    hasCategoryGroups,
    hasAiChatCard,
    hasComingSoon,
    hasKnowledgeBase,
    aiChatToggleWorks,
  },
  screenshotsDir,
};

console.log(JSON.stringify(result, null, 2));
process.exit(
  registryChecks.hasAiChatLive &&
    registryChecks.hasComingSoonFeatures &&
    result.uiChecks.hasCompanySummary &&
    result.uiChecks.hasCategoryGroups &&
    result.uiChecks.hasAiChatCard &&
    result.uiChecks.hasComingSoon &&
    result.uiChecks.aiChatToggleWorks
    ? 0
    : 1,
);
