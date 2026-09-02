/**
 * Forensic: reproduce Company Review Step 3 individual permission click failure.
 * Disposable company only. No production mutations beyond review of this company.
 *
 * Run: node scripts/verify-company-review-rbac-click-forensic.mjs
 */
import { chromium } from "../artifacts/login-app/node_modules/playwright/index.mjs";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const SUPER_EMAIL = "demo-platform@vaultos.local";
const SUPER_PASSWORD = "DemoVault2026!";
const BASE = process.env.LOGIN_APP_URL || "http://127.0.0.1:5173";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const ownerEmail = `rbac-click-${stamp}@valueor.test`;
const ownerPassword = `Review!${stamp}Aa`;
const companyName = `RBAC Click Co ${stamp}`;
const report = { stamp, companyName, findings: [], steps: [] };

function note(name, detail, extra = {}) {
  report.findings.push({ name, detail, ...extra });
  console.log(`FINDING ${name} — ${detail}`);
}
function step(name, ok, detail, extra = {}) {
  report.steps.push({ name, ok, detail, ...extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
  if (!ok) throw new Error(`${name}: ${detail}`);
}

async function createDisposableCompany() {
  const created = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: "RBAC Click Owner" },
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await userClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  if (signedIn.error) throw signedIn.error;
  const onboard = await userClient.rpc("onboard_own_company_v1", {
    p_payload: {
      name: companyName,
      legal_name: `${companyName} Legal`,
      business_type: "clinic",
      industry: "healthcare",
      contact_email: ownerEmail,
      contact_phone: "+966500007777",
      country: "Saudi Arabia",
      city: "Riyadh",
      address: "Test Street",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      owner_display_name: "RBAC Click Owner",
      owner_full_name: "RBAC Click Owner",
      owner_phone: "+966500007777",
      owner_job_title: "Owner",
    },
  });
  if (onboard.error) throw onboard.error;
  return { companyId: onboard.data.company_id || onboard.data.company?.id, userId };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
}

async function openStep3(page) {
  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /pending|قيد/i }).first().click({ timeout: 15000 }).catch(() => {});
  await page.getByPlaceholder(/search|بحث/i).fill(companyName).catch(() => {});
  await page.waitForTimeout(900);
  const row = page.locator("tr", { hasText: companyName }).first();
  await row.waitFor({ timeout: 30000 });
  await row.getByRole("button", { name: /row actions|إجراءات/i }).click();
  await page.getByRole("menuitem", { name: /review company|مراجعة/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: /^basic|أساس/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByText(/Administrator role|دور المسؤول/i).waitFor({ timeout: 20000 });
}

function parseCounter(text) {
  const m = String(text).match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { selected: Number(m[1]), total: Number(m[2]) } : null;
}

const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let browser;
try {
  console.log("\nRBAC click forensic\n");
  const { companyId, userId } = await createDisposableCompany();
  report.companyId = companyId;
  report.userId = userId;
  step("create disposable company", Boolean(companyId), companyId);
  await pgClient.connect();

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await login(page, SUPER_EMAIL, SUPER_PASSWORD);
  await openStep3(page);

  const counterEl = page.locator("text=/المحدد:|Selected:/i").last();
  await counterEl.waitFor({ timeout: 15000 });
  const counterBefore = parseCounter(await counterEl.innerText());
  note("counter_before_click", JSON.stringify(counterBefore));

  // Find first checked permission checkbox inside admin panel
  const adminPanel = page.locator("section").filter({ hasText: /دور المسؤول|Administrator role/i }).first();
  const checkedBox = adminPanel.locator('button[role="checkbox"][data-state="checked"]').first();
  await checkedBox.waitFor({ timeout: 15000 });

  const boxInfo = await checkedBox.evaluate((el) => {
    const label = el.closest("label");
    const style = window.getComputedStyle(el);
    const labelStyle = label ? window.getComputedStyle(label) : null;
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      disabled: el.disabled || el.getAttribute("aria-disabled"),
      dataState: el.getAttribute("data-state"),
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      inLabel: Boolean(label),
      labelPointerEvents: labelStyle?.pointerEvents ?? null,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      ariaLabel: el.getAttribute("aria-label"),
    };
  });
  note("checkbox_dom", JSON.stringify(boxInfo));

  // Element at click point
  const hit = await checkedBox.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      x,
      y,
      topTag: top?.tagName,
      topRole: top?.getAttribute?.("role"),
      topClass: top?.className?.toString?.().slice(0, 120),
      isCheckbox: top === el || el.contains(top),
    };
  });
  note("element_from_point", JSON.stringify(hit));

  // Count onCheckedChange-equivalent: click checkbox and observe state + counter
  const stateBefore = await checkedBox.getAttribute("data-state");
  await checkedBox.click({ force: false });
  await page.waitForTimeout(400);
  const stateAfterCheckboxClick = await checkedBox.getAttribute("data-state").catch(() => "gone");
  const counterAfterCheckbox = parseCounter(await counterEl.innerText());
  note("click_checkbox_direct", `state ${stateBefore} -> ${stateAfterCheckboxClick}; counter ${JSON.stringify(counterBefore)} -> ${JSON.stringify(counterAfterCheckbox)}`);

  // If double-toggle restored state, counter unchanged is the bug
  const checkboxClickNoOp =
    stateAfterCheckboxClick === stateBefore &&
    counterAfterCheckbox?.selected === counterBefore?.selected;
  note("checkbox_click_appears_noop", String(checkboxClickNoOp));

  // Click the label row (text area) of a different checked permission
  const checkedLabels = adminPanel.locator("label").filter({
    has: page.locator('button[role="checkbox"][data-state="checked"]'),
  });
  const labelCount = await checkedLabels.count();
  note("checked_label_count", String(labelCount));

  if (labelCount > 1) {
    const label = checkedLabels.nth(1);
    const labelBoxBefore = await label.locator('button[role="checkbox"]').getAttribute("data-state");
    const counterMid = parseCounter(await counterEl.innerText());
    // Click on the text portion (not the checkbox)
    await label.locator("span, div, p").first().click({ force: false }).catch(async () => {
      await label.click({ position: { x: 80, y: 12 } });
    });
    await page.waitForTimeout(400);
    const labelBoxAfter = await label.locator('button[role="checkbox"]').getAttribute("data-state");
    const counterAfterLabel = parseCounter(await counterEl.innerText());
    note(
      "click_label_text",
      `state ${labelBoxBefore} -> ${labelBoxAfter}; counter ${JSON.stringify(counterMid)} -> ${JSON.stringify(counterAfterLabel)}`,
    );
  }

  // Clear all
  const clearBtn = page.getByRole("button", { name: /clear all|إلغاء تحديد الكل/i });
  const counterBeforeClear = parseCounter(await counterEl.innerText());
  await clearBtn.click();
  await page.waitForTimeout(500);
  const counterAfterClear = parseCounter(await counterEl.innerText());
  note("clear_all", `${JSON.stringify(counterBeforeClear)} -> ${JSON.stringify(counterAfterClear)}`);
  step("clear_all_zeros_counter", counterAfterClear?.selected === 0, JSON.stringify(counterAfterClear));

  // Select all
  const selectAll = adminPanel.locator("label").filter({ hasText: /تحديد كل|Select all/i }).first();
  await selectAll.click();
  await page.waitForTimeout(500);
  const counterAfterSelectAll = parseCounter(await counterEl.innerText());
  note("select_all", JSON.stringify(counterAfterSelectAll));
  step(
    "select_all_increases",
    (counterAfterSelectAll?.selected ?? 0) > 0,
    JSON.stringify(counterAfterSelectAll),
  );

  // Isolate: inject click listener to count onCheckedChange by observing toggle via evaluate
  const toggleProbe = await adminPanel.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('button[role="checkbox"][data-state="checked"]'));
    const target = boxes.find((b) => b.closest("label") && !b.closest("label")?.innerText?.includes("تحديد كل"));
    if (!target) return { error: "no target" };
    let clickCount = 0;
    let changeEvents = 0;
    const onClick = () => {
      clickCount += 1;
    };
    target.addEventListener("click", onClick, true);
    target.click();
    // After programmatic click, state may have toggled twice if label also fires
    const state = target.getAttribute("data-state");
    target.removeEventListener("click", onClick, true);
    return {
      clickCount,
      stateAfterProgrammaticClick: state,
      inLabel: Boolean(target.closest("label")),
    };
  });
  note("programmatic_checkbox_click_probe", JSON.stringify(toggleProbe));

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const shot = resolve(outDir, `rbac-click-forensic-${stamp}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  report.screenshot = shot;
  const outPath = resolve(outDir, `rbac-click-forensic-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`Screenshot: ${shot}`);

  // Verdict
  if (checkboxClickNoOp) {
    console.log("\nVERDICT: individual checkbox click is a NO-OP (likely label+Radix double-toggle)\n");
  } else {
    console.log("\nVERDICT: checkbox click changed state; investigate other causes\n");
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(root, "scripts/_tmp-rbac-click-forensic.json"), JSON.stringify(report, null, 2));
  console.error("\nFAIL", report.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await pgClient.end().catch(() => {});
}
