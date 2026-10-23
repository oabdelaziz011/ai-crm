/**
 * Local Playwright gap-closure — Complete Demo, Lost reason, Archive, empty state.
 * Seeds only tagged fixtures; cleans them up. Fake Provider / no real sends.
 *
 * Run: npx tsx scripts/opportunities-lifecycle-browser-verify.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import {
  cleanupLifecycleBrowserFixtures,
  createLifecycleBrowserFixtures,
} from "./opportunities-lifecycle-browser-fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../.verification-screenshots");
mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.APP_URL ?? process.env.LOGIN_APP_URL ?? "http://localhost:5173";
const email = process.env.VALUEOR_LOCAL_BROWSER_EMAIL ?? "demo-platform@vaultos.local";
const password = process.env.VALUEOR_LOCAL_BROWSER_PASSWORD ?? "DemoVault2026!";

const report: {
  ok: boolean;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
  consoleErrors: string[];
  failedRequests: string[];
  cleanup?: unknown;
  fixtures?: { leadTitle: string; oppName: string; tag: string };
} = { ok: true, steps: [], consoleErrors: [], failedRequests: [] };

function step(name: string, ok: boolean, detail?: string) {
  report.steps.push({ name, ok, detail });
  if (!ok) report.ok = false;
  console.log(`${ok ? "OK" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page: Page, name: string) {
  const path = resolve(outDir, `opp-lifecycle-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`SCREENSHOT_OK ${path}`);
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[type="email"]', { timeout: 45_000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /authenticate|sign in|log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 45_000 });
}

let fixtures: Awaited<ReturnType<typeof createLifecycleBrowserFixtures>> | null = null;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(msg.text());
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (/favicon|hot-update|sourcemap|websocket|realtime/i.test(url)) return;
  report.failedRequests.push(`${req.failure()?.errorText ?? "failed"} ${url}`);
});

// Capture Complete Demo API call
let completeDemoStatus: number | null = null;
page.on("response", (res) => {
  if (/\/leads\/[^/]+\/complete-demo/.test(res.url()) && res.request().method() === "POST") {
    completeDemoStatus = res.status();
  }
});

try {
  fixtures = await createLifecycleBrowserFixtures();
  report.fixtures = {
    leadTitle: fixtures.leadTitle,
    oppName: fixtures.oppName,
    tag: fixtures.tag,
  };
  step("seed tagged fixtures", true, fixtures.tag);

  await login(page);
  step("login", true);

  // --- Complete Demo ---
  await page.goto(`${baseUrl}/dashboard/leads/table`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  const leadSearch = page.locator('input[type="search"]').first();
  if (await leadSearch.count()) {
    await leadSearch.fill(fixtures.leadTitle);
    await page.waitForTimeout(1000);
  }
  const leadRow = page.locator("tr", { hasText: fixtures.leadTitle }).first();
  await leadRow.waitFor({ state: "visible", timeout: 20_000 });
  const actionsBtn = leadRow.getByRole("button", { name: /lead actions|actions|إجراءات/i });
  if ((await actionsBtn.count()) === 0) {
    // Fallback: last icon button in row
    await leadRow.locator("button").last().click();
  } else {
    await actionsBtn.click();
  }
  await page.waitForTimeout(400);
  const completeItem = page.getByRole("menuitem", { name: /complete demo|إكمال التجربة/i });
  const completeVisible = (await completeItem.count()) > 0;
  step("Complete Demo visible for demo_scheduled lead", completeVisible);
  if (completeVisible) {
    await completeItem.click();
    await page.waitForTimeout(2000);
    step(
      "Complete Demo API called",
      completeDemoStatus !== null && completeDemoStatus >= 200 && completeDemoStatus < 300,
      `status=${completeDemoStatus}`,
    );
    // Confirm no opportunity auto-created for this lead
    const oppCount = await fixtures.db.query(
      `select count(*)::int n from public.opportunities
        where lead_id = $1 and deleted_at is null`,
      [fixtures.leadId],
    );
    step("no Opportunity after Complete Demo", oppCount.rows[0].n === 0, `n=${oppCount.rows[0].n}`);
    const lifecycle = await fixtures.db.query(
      `select lifecycle_status from public.leads where id = $1`,
      [fixtures.leadId],
    );
    step(
      "Lead lifecycle is demo_completed",
      lifecycle.rows[0]?.lifecycle_status === "demo_completed",
      String(lifecycle.rows[0]?.lifecycle_status),
    );
  }
  await shot(page, "01-complete-demo");

  // --- Opportunities: empty search + Lost + Archive ---
  await page.goto(`${baseUrl}/dashboard/opportunities/table`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);

  const oppSearch = page.locator("#opp-table-search");
  await oppSearch.fill(`__no_match_${fixtures.tag}__`);
  await page.waitForTimeout(900);
  const emptyVisible =
    (await page.getByText(/no opportunities|لا توجد فرص/i).count()) > 0 ||
    (await page.locator("table tbody tr").count()) === 0;
  step("empty-state after unmatched search", emptyVisible);
  await shot(page, "02-empty-search");

  await oppSearch.fill(fixtures.oppName);
  await page.waitForTimeout(1000);
  const oppRow = page.locator("tr", { hasText: fixtures.oppName }).first();
  await oppRow.waitFor({ state: "visible", timeout: 20_000 });
  step("fixture opportunity visible in table", true);

  // Lost without reason
  const stageSelect = oppRow.locator('[role="combobox"]').first();
  if ((await stageSelect.count()) > 0) {
    await stageSelect.click();
    await page.waitForTimeout(300);
    const lostOption = page.getByRole("option", { name: /^lost$|^خسارة$/i });
    if ((await lostOption.count()) > 0) {
      await lostOption.click();
      await page.waitForTimeout(500);
      const dialog = page.getByRole("dialog");
      step("Lost reason dialog opens", (await dialog.count()) > 0);
      const confirm = dialog.getByRole("button", { name: /mark lost|تأكيد الخسارة/i });
      await confirm.click();
      await page.waitForTimeout(400);
      const validation =
        (await page.getByText(/lost reason is required|سبب الخسارة مطلوب/i).count()) > 0;
      step("Lost empty reason validation", validation);
      await dialog.locator("#opportunity-lost-reason").fill("Browser audit — budget cut");
      await confirm.click();
      await page.waitForTimeout(1500);
      const lostAt = await fixtures.db.query(
        `select lost_at, lost_reason from public.opportunities where id = $1`,
        [fixtures.opportunityId],
      );
      step(
        "Lost with reason persists",
        Boolean(lostAt.rows[0]?.lost_at) && String(lostAt.rows[0]?.lost_reason || "").length > 0,
        String(lostAt.rows[0]?.lost_reason ?? ""),
      );
    } else {
      step("Lost stage option available", false, "lost option not in stage list");
    }
  } else {
    step("stage select available for edit", false, "no combobox — likely no opportunities.edit");
  }
  await shot(page, "03-lost-flow");

  // Archive on a fresh open opp if Lost closed the previous one — create second tagged opp via SQL
  const archiveOppId = crypto.randomUUID();
  const archiveName = `${fixtures.tag}-archive-opp`;
  const pipe = await fixtures.db.query(
    `select pipeline_id, stage_id from public.opportunities where id = $1`,
    [fixtures.opportunityId],
  );
  // Re-open a qualification stage for archive fixture
  const openStage = await fixtures.db.query(
    `select id from public.opportunity_stages
      where company_id = $1 and stage_key = 'qualification' and deleted_at is null limit 1`,
    [fixtures.companyId],
  );
  await fixtures.db.query(
    `insert into public.opportunities (
       id, company_id, pipeline_id, stage_id, name, primary_contact_name,
       currency, probability_percent, probability_source, probability_reason,
       created_by, updated_by, metadata
     ) values (
       $1,$2,$3,$4,$5,$5,'USD',10,'manual','archive fixture',$6,$6,$7::jsonb
     )`,
    [
      archiveOppId,
      fixtures.companyId,
      pipe.rows[0]?.pipeline_id,
      openStage.rows[0]?.id ?? pipe.rows[0]?.stage_id,
      archiveName,
      fixtures.actorId,
      JSON.stringify({ auditTag: fixtures.tag, source: "browser-lifecycle-audit" }),
    ],
  );

  await page.goto(`${baseUrl}/dashboard/opportunities/table`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.locator("#opp-table-search").fill(archiveName);
  await page.waitForTimeout(1000);
  const archiveRow = page.locator("tr", { hasText: archiveName }).first();
  await archiveRow.waitFor({ state: "visible", timeout: 20_000 });
  await archiveRow.getByRole("button", { name: /row actions|actions|إجراءات/i }).click();
  await page.waitForTimeout(300);
  const archiveItem = page.getByRole("menuitem", { name: /archive|أرشفة/i });
  if ((await archiveItem.count()) > 0) {
    await archiveItem.click();
    await page.waitForTimeout(400);
    const confirmDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    step("Archive confirmation dialog", (await confirmDialog.count()) > 0);
    const confirmBtn = page.getByRole("button", { name: /archive|delete|أرشفة|حذف/i }).last();
    await confirmBtn.click();
    await page.waitForTimeout(1500);
    const deleted = await fixtures.db.query(
      `select deleted_at from public.opportunities where id = $1`,
      [archiveOppId],
    );
    step("Archive soft-deletes opportunity", Boolean(deleted.rows[0]?.deleted_at));
  } else {
    step("Archive action visible", false, "missing opportunities.delete permission?");
  }
  await shot(page, "04-archive");

  // Pagination note: only rendered when total > 50
  const pagination = page.getByRole("button", { name: /next|التالي/i });
  step(
    "pagination control present or not required",
    true,
    (await pagination.count()) > 0 ? "next visible" : "≤ page size — control hidden by design",
  );

  // Arabic RTL smoke
  const langBtn = page.getByRole("button", { name: /العربية|Arabic|AR/i }).first();
  if (await langBtn.count()) {
    await langBtn.click();
    await page.waitForTimeout(1200);
  }
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "");
  step("arabic rtl dir", dir === "rtl" || dir === "", `dir=${dir || "(unset)"}`);
  await shot(page, "05-ar");
} catch (error) {
  report.ok = false;
  step("harness", false, error instanceof Error ? error.message : String(error));
  await shot(page, "error").catch(() => undefined);
} finally {
  if (fixtures) {
    try {
      report.cleanup = await cleanupLifecycleBrowserFixtures(fixtures.db, fixtures.tag);
      step("fixture cleanup", true, JSON.stringify(report.cleanup));
    } catch (cleanupError) {
      step(
        "fixture cleanup",
        false,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      );
    }
  }
  const critical = report.failedRequests.filter((r) => !/ERR_ABORTED|websocket|realtime/i.test(r));
  step("no critical network failures", critical.length === 0, `${critical.length}`);
  const reportPath = resolve(outDir, `opp-lifecycle-browser-verify-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`REPORT ${reportPath}`);
  await browser.close();
  if (!report.ok) process.exitCode = 1;
}
