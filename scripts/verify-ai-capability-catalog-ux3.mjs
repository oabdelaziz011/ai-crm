/**
 * Verify UX-3 AI Capability Catalog: schema, dependency/plan resolution, ai_chat preserved.
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
const screenshotsDir = resolve(root, "artifacts/login-app/docs/ux-3-ai-capability-catalog");
const { mkdirSync } = await import("node:fs");
mkdirSync(screenshotsDir, { recursive: true });

const schemaSource = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/platform-ai/ai-capability-catalog-schema.ts"),
  "utf8",
);
const catalogSource = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/platform-ai/ai-capability-catalog.ts"),
  "utf8",
);
const dependencySource = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/platform-ai/resolve-ai-capability-dependencies.ts"),
  "utf8",
);
const stateSource = readFileSync(
  resolve(root, "artifacts/login-app/src/lib/platform-ai/resolve-ai-capability-state.ts"),
  "utf8",
);

const registryChecks = {
  hasExtendedSchema:
    schemaSource.includes("displayNameKey") &&
    schemaSource.includes("minimumPlan") &&
    schemaSource.includes("dependencies") &&
    schemaSource.includes("defaultEnabled") &&
    schemaSource.includes("experimental") &&
    schemaSource.includes("visible"),
  hasDependencyResolver: dependencySource.includes("resolveAiCapabilityDependencies"),
  hasStateResolver: stateSource.includes("resolveAiCapabilityState"),
  aiChatPreserved:
    catalogSource.includes('id: "ai_chat"') && catalogSource.includes('backendFeatureKey: "ai_chat"'),
  knowledgeRequiresChat: catalogSource.includes('id: "knowledge_base"') && catalogSource.includes('dependencies: ["ai_chat"]'),
  agentsRequireWorkflow:
    catalogSource.includes('id: "ai_agents"') &&
    catalogSource.includes('"ai_chat", "workflow_ai"'),
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
await page.waitForTimeout(3000);

const companySelector = page.getByRole("combobox").first();
if (await companySelector.isVisible().catch(() => false)) {
  await companySelector.click();
  await page.waitForTimeout(500);
  const firstCompany = page.locator("[cmdk-item]").first();
  if (await firstCompany.isVisible().catch(() => false)) {
    await firstCompany.click();
    await page.waitForTimeout(2000);
  }
}

const bodyText = await page.locator("body").innerText();
const uiChecks = {
  hasSummaryStats: /locked features|coming soon|beta|last updated/i.test(bodyText),
  hasStateBadges: /enabled|coming soon|locked|beta/i.test(bodyText),
  hasDependencyReason: /requires.*ai chat/i.test(bodyText),
  hasPlanLockReason: /requires.*enterprise|requires.*pro/i.test(bodyText),
  hasAiChatCard: /ai chat/i.test(bodyText),
};

await page.screenshot({
  path: resolve(screenshotsDir, "after-ai-capability-catalog.png"),
  fullPage: true,
});

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
  uiChecks: { ...uiChecks, aiChatToggleWorks },
  screenshotsDir,
};

console.log(JSON.stringify(result, null, 2));
process.exit(
  Object.values(registryChecks).every(Boolean) &&
    uiChecks.hasSummaryStats &&
    uiChecks.hasStateBadges &&
    uiChecks.hasAiChatCard &&
    result.uiChecks.aiChatToggleWorks
    ? 0
    : 1,
);
