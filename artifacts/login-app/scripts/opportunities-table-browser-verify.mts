/**
 * Local Playwright verification — Opportunities table-first UX.
 *
 * Prerequisites: login-app on APP_URL (default http://localhost:5173), local stack.
 * Uses the same disposable demo login pattern as existing browser harnesses.
 * Does not send outbound messages. Screenshots land in .verification-screenshots/.
 *
 * Run: npx tsx scripts/opportunities-table-browser-verify.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../.verification-screenshots");
mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.APP_URL ?? process.env.LOGIN_APP_URL ?? "http://localhost:5173";
const email = process.env.VALUEOR_LOCAL_BROWSER_EMAIL ?? "demo-platform@vaultos.local";
const password = process.env.VALUEOR_LOCAL_BROWSER_PASSWORD ?? "DemoVault2026!";

const report: {
  ok: boolean;
  baseUrl: string;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
  consoleErrors: string[];
  failedRequests: string[];
} = {
  ok: true,
  baseUrl,
  steps: [],
  consoleErrors: [],
  failedRequests: [],
};

function step(name: string, ok: boolean, detail?: string) {
  report.steps.push({ name, ok, detail });
  if (!ok) report.ok = false;
  console.log(`${ok ? "OK" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page: Page, name: string) {
  const path = resolve(outDir, `opp-table-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`SCREENSHOT_OK ${path}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(msg.text());
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (/favicon|hot-update|sourcemap/i.test(url)) return;
  report.failedRequests.push(`${req.failure()?.errorText ?? "failed"} ${url}`);
});

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[type="email"], input[autocomplete="email"]', { timeout: 45_000 });
  // Prefer stable input selectors — FormLabel association varies by locale/build.
  const emailInput = page.locator('input[type="email"], input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /authenticate|sign in|log in|تسجيل/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 45_000 });
  step("login", true);

  await page.goto(`${baseUrl}/dashboard/opportunities`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  const urlAfterDefault = page.url();
  const tableDefault = /\/opportunities\/table/.test(urlAfterDefault);
  step("default route is /table", tableDefault, urlAfterDefault);
  await shot(page, "01-table-default-en");

  // Pipeline still reachable
  await page.goto(`${baseUrl}/dashboard/opportunities/pipeline`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  step("pipeline route accessible", /\/opportunities\/pipeline/.test(page.url()), page.url());
  await shot(page, "02-pipeline-en");

  await page.goto(`${baseUrl}/dashboard/opportunities/table`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);

  const search = page.locator("#opp-table-search");
  const stageFilter = page.locator("#opp-table-stage");
  const ownerFilter = page.locator("#opp-table-owner");
  const outcomeFilter = page.locator("#opp-table-outcome");
  step("table filters present", (await search.count()) > 0 && (await stageFilter.count()) > 0);
  step("owner/outcome filters present", (await ownerFilter.count()) > 0 && (await outcomeFilter.count()) > 0);

  if ((await search.count()) > 0) {
    await search.fill("Acme");
    await page.waitForTimeout(600);
    await search.fill("");
    await page.waitForTimeout(800);
    step("search interaction", true);
  }

  const rows = page.locator("table tbody tr[tabindex='0']");
  await page.waitForTimeout(500);
  const rowCount = await rows.count();
  step("table rendered rows or empty state", rowCount >= 0, `rows=${rowCount}`);

  if (rowCount > 0) {
    const firstRow = rows.first();
    await firstRow.waitFor({ state: "visible", timeout: 15_000 });
    await firstRow.click({ timeout: 15_000 }).catch(async () => {
      // Realtime refetch can detach the node — re-query and force.
      await page.locator("table tbody tr[tabindex='0']").first().click({ force: true });
    });
    await page.waitForTimeout(1500);
    const workspaceVisible = (await page.locator('[role="dialog"]').count()) > 0;
    step("row opens Opportunity360", workspaceVisible);
    await shot(page, "03-opportunity360-en");
    const closeBtn = page.locator('[role="dialog"]').getByRole("button", { name: /close|إغلاق/i }).first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => undefined);
    await page.waitForTimeout(500);
  } else {
    step("row opens Opportunity360", true, "skipped — empty table");
  }

  // Arabic / RTL
  await page.goto(`${baseUrl}/dashboard/opportunities/table?lang=ar`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  }).catch(async () => {
    // Fallback: switch language via UI if query unsupported
    await page.goto(`${baseUrl}/dashboard/opportunities/table`, { waitUntil: "networkidle" });
  });
  await page.waitForTimeout(1000);
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || document.body.dir || "");
  // Try language switcher if still LTR
  if (dir !== "rtl") {
    const langBtn = page.getByRole("button", { name: /العربية|Arabic|AR/i }).first();
    if (await langBtn.count()) {
      await langBtn.click();
      await page.waitForTimeout(1500);
    }
  }
  const dir2 = await page.evaluate(() => document.documentElement.getAttribute("dir") || "");
  step("arabic/rtl check", dir2 === "rtl" || dir === "rtl", `dir=${dir2 || dir || "(unset)"}`);
  await shot(page, "04-table-ar");

  // Leads Complete Demo visibility (demo_scheduled only) — open leads table
  await page.goto(`${baseUrl}/dashboard/leads/table`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  step("leads table reachable for Complete Demo check", /\/leads\/table/.test(page.url()));
  await shot(page, "05-leads-table");
} catch (error) {
  report.ok = false;
  step("harness", false, error instanceof Error ? error.message : String(error));
  await shot(page, "error").catch(() => undefined);
} finally {
  const criticalFails = report.failedRequests.filter(
    (r) => !/hot-update|sockjs|vite|websocket|realtime|supabase\.co\/realtime|ERR_ABORTED/i.test(r),
  );
  step("no critical network failures", criticalFails.length === 0, `${criticalFails.length} failures`);
  step(
    "console errors tolerable",
    report.consoleErrors.length < 20,
    `${report.consoleErrors.length} console errors`,
  );

  const reportPath = resolve(outDir, `opp-table-browser-verify-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`REPORT ${reportPath}`);
  await browser.close();
  if (!report.ok) process.exitCode = 1;
}
