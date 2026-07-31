/**
 * Verify Platform AI Settings moved to Settings + legacy redirect.
 *
 * Env: BROWSER_SESSION_FILE (defaults to artifacts/inbox-session.json)
 */
import { readFileSync } from "node:fs";
import {
  loadDevScriptEnv,
  resolveBrowserSessionPath,
  resolveLoginAppBaseUrl,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const session = JSON.parse(readFileSync(resolveBrowserSessionPath(root, env), "utf8"));
const loginAppBaseUrl = resolveLoginAppBaseUrl(env);

const { chromium } = await import("../artifacts/login-app/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${loginAppBaseUrl}/`, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ storageKey, storageValue }) => {
    localStorage.setItem("valueor.sidebar.collapsed", "false");
    localStorage.setItem(storageKey, JSON.stringify(storageValue));
  },
  { storageKey: session.storageKey, storageValue: session.storageValue },
);

await page.goto(`${loginAppBaseUrl}/dashboard`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(6000);

const dashboardUrl = page.url();
const onLogin = dashboardUrl.includes("/login");

const legacyTargetUrl = session.targetUrl?.startsWith("http")
  ? session.targetUrl
  : `${loginAppBaseUrl}${session.targetUrl ?? "/dashboard/platform/ai-settings"}`;

await page.goto(legacyTargetUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(8000);

const legacyUrl = page.url();
const legacyRedirectOk = legacyUrl.includes("/settings/platform-ai");

await page.goto(`${loginAppBaseUrl}/dashboard/settings/platform-ai`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.waitForTimeout(4000);

const settingsUrl = page.url();
const bodyText = await page.locator("body").innerText();
const hasAccessDenied = /access denied|unauthorized|403/i.test(bodyText);
const hasNotFound = /not found|404/i.test(bodyText);
const sidebarText = await page.locator("aside").innerText().catch(() => "");
const sidebarHasLegacyLink = /platform ai settings|إعدادات الذكاء الاصطناعي للمنصة/i.test(sidebarText);
const settingsNavHasPlatformAi = /platform ai|الذكاء الاصطناعي للمنصة/i.test(bodyText);

const breadcrumbText = await page
  .locator("nav[aria-label='Breadcrumb'], [data-testid='breadcrumbs']")
  .first()
  .innerText()
  .catch(() => bodyText.slice(0, 500));

const registryModule = await fetch(`${loginAppBaseUrl}/src/config/settings-route-registry.ts`).then((r) => r.text());
const dashboardRegistry = await fetch(`${loginAppBaseUrl}/src/config/dashboard-route-registry.ts`).then((r) => r.text());

const settingsRegistryHasRoute =
  registryModule.includes('id: "platform-ai"') &&
  registryModule.includes("/platform-ai") &&
  registryModule.includes("superAdminOnly: true");

const dashboardRegistryRemovedSidebarRoute = !dashboardRegistry.includes('id: "platform-ai-admin"');

await browser.close();

const result = {
  settingsRegistryHasRoute,
  dashboardRegistryRemovedSidebarRoute,
  sessionProfile: session.profile,
  bootstrappedToDashboard: !onLogin,
  dashboardUrl,
  legacyTargetUrl,
  legacyRedirectOk,
  legacyFinalUrl: legacyUrl,
  settingsRouteUrl: settingsUrl,
  directSettingsRouteOk:
    !onLogin &&
    !hasAccessDenied &&
    !hasNotFound &&
    settingsUrl.includes("/settings/platform-ai") &&
    settingsNavHasPlatformAi,
  hasAccessDenied,
  hasNotFound,
  sidebarHasLegacyLink,
  settingsNavHasPlatformAi,
  breadcrumbPreview: breadcrumbText.slice(0, 300),
};

console.log(JSON.stringify(result, null, 2));
process.exit(
  result.settingsRegistryHasRoute &&
    result.dashboardRegistryRemovedSidebarRoute &&
    result.legacyRedirectOk &&
    result.directSettingsRouteOk &&
    !result.sidebarHasLegacyLink
    ? 0
    : 1,
);
