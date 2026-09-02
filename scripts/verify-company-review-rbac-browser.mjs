/**
 * Browser E2E: company commercial review Step 3 entitlements + admin RBAC panel.
 * Creates a disposable onboarded company; does not touch existing production companies.
 *
 * Run: node scripts/verify-company-review-rbac-browser.mjs
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

if (!url || !serviceKey || !anonKey) throw new Error("Missing Supabase env");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const ownerEmail = `review-rbac-${stamp}@valueor.test`;
const ownerPassword = `Review!${stamp}Aa`;
const companyName = `Review RBAC Co ${stamp}`;
const report = { stamp, steps: [], companyId: null, ownerEmail };

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
    user_metadata: { full_name: "Review RBAC Owner" },
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
      contact_phone: "+966500008888",
      country: "Saudi Arabia",
      city: "Riyadh",
      address: "Test Street",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      owner_display_name: "Review RBAC Owner",
      owner_full_name: "Review RBAC Owner",
      owner_phone: "+966500008888",
      owner_job_title: "Owner",
    },
  });
  if (onboard.error) throw onboard.error;
  const companyId = onboard.data.company_id || onboard.data.company?.id;
  return { companyId, userId };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
}

const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let browser;
let page;

try {
  console.log("\nCompany review RBAC browser E2E\n");

  const { companyId, userId } = await createDisposableCompany();
  report.companyId = companyId;
  step("create disposable pending company", Boolean(companyId), companyId);

  await pgClient.connect();

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await login(page, SUPER_EMAIL, SUPER_PASSWORD);
  step("super admin login", true, SUPER_EMAIL);

  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /pending|قيد/i }).first().click({ timeout: 15000 }).catch(() => {});
  await page.getByPlaceholder(/search|بحث/i).fill(companyName).catch(() => page.locator("input").first().fill(companyName));
  await page.waitForTimeout(1000);

  const companyRow = page.locator("tr", { hasText: companyName }).first();
  await companyRow.waitFor({ timeout: 30000 });
  await companyRow.getByRole("button", { name: /row actions|إجراءات/i }).click();
  await page.getByRole("menuitem", { name: /review company|مراجعة/i }).click();
  step("open company review dialog", true, companyName);

  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: /^basic|أساس/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /next|التالي/i }).click();
  step("assign basic package in wizard", true, "step 2 complete");

  const adminPanelTitle = page.getByText(/Administrator role|دور المسؤول/i);
  await adminPanelTitle.waitFor({ timeout: 20000 });
  step("step 3 shows admin RBAC panel", await adminPanelTitle.isVisible(), "panel visible");

  const entitlementsTitle = page.getByText(/Company feature entitlements|مزايا الشركة/i);
  step("step 3 shows entitlements section", await entitlementsTitle.isVisible(), "entitlements section");

  await adminPanelTitle.scrollIntoViewIfNeeded();

  const permissionSearch = page.locator('[aria-label*="Search"], [aria-label*="بحث"], input[placeholder*="Search"], input[placeholder*="بحث"]').last();

  const clearAllButton = page.getByRole("button", { name: /clear all|إلغاء تحديد الكل/i });
  await clearAllButton.waitFor({ timeout: 10000 });
  await clearAllButton.click();
  await page.waitForTimeout(800);
  await page.getByText(/Selected:\s*0|المحدد:\s*0/i).waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: /Save admin access|حفظ وصول المسؤول/i }).click();
  await page.waitForTimeout(2500);
  step("save admin permissions from review panel", true, "clicked save");

  let customersViewRemoved = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { rows } = await pgClient.query(
      `select p.code
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
       join public.role_permissions rp on rp.role_id = r.id
       join public.permissions p on p.id = rp.permission_id
       where ur.user_id = $1 and r.company_id = $2 and p.code = 'customers.view'`,
      [userId, companyId],
    );
    customersViewRemoved = rows.length === 0;
    if (customersViewRemoved) break;
    await page.waitForTimeout(500);
  }
  step(
    "DB: customers.view absent after UI save",
    customersViewRemoved,
    customersViewRemoved ? "removed" : "still present",
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await page.getByPlaceholder(/search|بحث/i).fill(companyName).catch(() => page.locator("input").first().fill(companyName));
  await page.waitForTimeout(800);
  const companyRowReload = page.locator("tr", { hasText: companyName }).first();
  await companyRowReload.getByRole("button", { name: /row actions|إجراءات/i }).click();
  await page.getByRole("menuitem", { name: /review company|مراجعة/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click({ timeout: 10000 }).catch(() => {});
  await page.getByRole("button", { name: /next|التالي/i }).click();

  await adminPanelTitle.waitFor({ timeout: 20000 });
  step("reopen review preserves admin panel", await adminPanelTitle.isVisible(), "panel still visible after reload");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const ownerContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const ownerPage = await ownerContext.newPage();
  await login(ownerPage, ownerEmail, ownerPassword);
  step("company owner login", true, ownerEmail);

  await ownerPage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await ownerPage.waitForTimeout(1500);

  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const ownerSignIn = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  if (ownerSignIn.error) throw ownerSignIn.error;
  const { data: denied } = await ownerClient.rpc("has_company_permission", {
    p_company_id: companyId,
    p_code: "customers.view",
  });
  step("server denies customers.view for owner", denied === false, String(denied));

  const { rows: remainingPerms } = await pgClient.query(
    `select count(*)::int as count
     from public.user_roles ur
     join public.roles r on r.id = ur.role_id
     join public.role_permissions rp on rp.role_id = r.id
     where ur.user_id = $1 and r.company_id = $2`,
    [userId, companyId],
  );
  step(
    "DB: owner role permissions cleared via review panel",
    remainingPerms[0]?.count === 0,
    `${remainingPerms[0]?.count ?? "?"} permissions remain`,
  );

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const shotPath = resolve(outDir, `company-review-rbac-browser-${stamp}.png`);
  await ownerPage.screenshot({ path: shotPath, fullPage: true });
  report.screenshot = shotPath;
  await ownerContext.close().catch(() => {});

  const outPath = resolve(outDir, `company-review-rbac-browser-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`Screenshot: ${shotPath}`);
  console.log("\nPASS company review RBAC browser E2E\n");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (page) {
    try {
      const failShot = resolve(root, `scripts/_tmp-company-review-rbac-browser-${stamp}.png`);
      await page.screenshot({ path: failShot, fullPage: true });
      report.failScreenshot = failShot;
    } catch {
      /* ignore */
    }
  }
  const outPath = resolve(root, "scripts/_tmp-company-review-rbac-browser.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.error("\nFAIL", report.error);
  console.error(`Report: ${outPath}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await pgClient.end().catch(() => {});
}
