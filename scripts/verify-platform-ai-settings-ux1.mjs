/**
 * Verify Platform AI Settings UX-1: settings tab, redirect, auth, sections.
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
const screenshotsDir = resolve(root, "artifacts/login-app/docs/ux-1-platform-ai-settings");

const { chromium } = await import("../artifacts/login-app/node_modules/playwright/index.mjs");
const { mkdirSync } = await import("node:fs");
mkdirSync(screenshotsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${loginAppBaseUrl}/login`, { waitUntil: "networkidle", timeout: 120_000 });
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
await page.waitForTimeout(3000);

await page.goto(`${loginAppBaseUrl}/dashboard/settings`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(2000);
const settingsBody = await page.locator("body").innerText();
const settingsNavHasPlatformAi = /platform ai/i.test(settingsBody);

await page.goto(`${loginAppBaseUrl}/dashboard/platform/ai-settings`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.waitForTimeout(3000);
const legacyUrl = page.url();
const legacyRedirectOk = legacyUrl.includes("/settings/platform-ai");
await page.screenshot({
  path: resolve(screenshotsDir, "after-legacy-redirect.png"),
  fullPage: true,
});

await page.goto(`${loginAppBaseUrl}/dashboard/settings/platform-ai`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.waitForTimeout(3000);
const settingsUrl = page.url();
const bodyText = await page.locator("body").innerText();
const hasAccessDenied = /access denied|unauthorized|403/i.test(bodyText);
const hasNotFound = /not found|404/i.test(bodyText);
const hasGeneralSection = /general/i.test(bodyText);
const hasProvidersSection = /providers/i.test(bodyText);
const hasApiKeysSection = /api keys/i.test(bodyText);
const hasCompanyAccessSection = /company ai access/i.test(bodyText);
const hasUsageSection = /usage dashboard/i.test(bodyText);
const sidebarText = await page.locator("aside").innerText().catch(() => "");
const sidebarHasLegacyLink = /platform ai settings/i.test(sidebarText);

await page.screenshot({
  path: resolve(screenshotsDir, "after-settings-platform-ai.png"),
  fullPage: true,
});

const breadcrumbText = await page
  .locator('[aria-label="Breadcrumb"], nav')
  .first()
  .innerText()
  .catch(() => bodyText.slice(0, 400));

const settingsRegistry = readFileSync(
  resolve(root, "artifacts/login-app/src/config/settings-route-registry.ts"),
  "utf8",
);
const dashboardRegistry = readFileSync(
  resolve(root, "artifacts/login-app/src/config/dashboard-route-registry.ts"),
  "utf8",
);
const outlet = readFileSync(
  resolve(root, "artifacts/login-app/src/components/dashboard/dashboard-outlet.tsx"),
  "utf8",
);

await browser.close();

const result = {
  settingsRegistryHasRoute:
    settingsRegistry.includes('id: "platform-ai"') && settingsRegistry.includes("superAdminOnly: true"),
  dashboardRegistryRemovedSidebarRoute: !dashboardRegistry.includes('id: "platform-ai-admin"'),
  outletHasLegacyRedirect:
    outlet.includes('/platform/ai-settings') && outlet.includes('/settings/platform-ai'),
  settingsNavHasPlatformAi,
  legacyRedirectOk,
  legacyFinalUrl: legacyUrl,
  settingsRouteUrl: settingsUrl,
  directSettingsRouteOk:
    !hasAccessDenied &&
    !hasNotFound &&
    settingsUrl.includes("/settings/platform-ai") &&
    hasGeneralSection &&
    hasProvidersSection &&
    hasApiKeysSection &&
    hasCompanyAccessSection &&
    hasUsageSection,
  hasAccessDenied,
  hasNotFound,
  sidebarHasLegacyLink,
  sections: {
    general: hasGeneralSection,
    providers: hasProvidersSection,
    apiKeys: hasApiKeysSection,
    companyAiAccess: hasCompanyAccessSection,
    usage: hasUsageSection,
  },
  breadcrumbPreview: breadcrumbText.slice(0, 400),
  screenshotsDir,
};

console.log(JSON.stringify(result, null, 2));
process.exit(
  result.settingsRegistryHasRoute &&
    result.dashboardRegistryRemovedSidebarRoute &&
    result.outletHasLegacyRedirect &&
    result.legacyRedirectOk &&
    result.directSettingsRouteOk &&
    !result.sidebarHasLegacyLink
    ? 0
    : 1,
);
