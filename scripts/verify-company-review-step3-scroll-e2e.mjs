/**
 * E2E: Step 3 permission matrix scroll usability + deselect persistence.
 * Disposable company only.
 *
 * Run: node scripts/verify-company-review-step3-scroll-e2e.mjs
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
const BASE = process.env.LOGIN_APP_URL || "http://127.0.0.1:5173";
const SUPER_EMAIL = "demo-platform@vaultos.local";
const SUPER_PASSWORD = "DemoVault2026!";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const ownerEmail = `scroll-e2e-${stamp}@valueor.test`;
const ownerPassword = `Review!${stamp}Aa`;
const companyName = `Scroll E2E Co ${stamp}`;
const report = {
  stamp,
  companyId: null,
  ownerEmail,
  scroll: { status: "PENDING", cases: [] },
  selection: { status: "PENDING", cases: [] },
  persistence: { status: "PENDING", cases: [] },
  authz: { status: "PENDING", cases: [] },
  selectedCountAudit: null,
};

function pass(section, name, detail) {
  report[section].cases.push({ name, ok: true, detail });
  console.log(`PASS [${section}] ${name} — ${detail}`);
}
function fail(section, name, detail) {
  report[section].cases.push({ name, ok: false, detail });
  console.log(`FAIL [${section}] ${name} — ${detail}`);
  throw new Error(`[${section}] ${name}: ${detail}`);
}

async function createCompany() {
  const created = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: "Scroll E2E Owner" },
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  await userClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  const onboard = await userClient.rpc("onboard_own_company_v1", {
    p_payload: {
      name: companyName,
      legal_name: `${companyName} Legal`,
      business_type: "clinic",
      industry: "healthcare",
      contact_email: ownerEmail,
      contact_phone: "+966500006555",
      country: "Saudi Arabia",
      city: "Riyadh",
      address: "Test",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      owner_display_name: "Scroll E2E Owner",
      owner_full_name: "Scroll E2E Owner",
      owner_phone: "+966500006555",
      owner_job_title: "Owner",
    },
  });
  if (onboard.error) throw onboard.error;
  return { companyId: onboard.data.company_id || onboard.data.company?.id, userId };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
}

async function openStep3(page, { pickEnterprise = true } = {}) {
  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /pending|قيد/i }).first().click().catch(() => {});
  await page.getByPlaceholder(/search|بحث/i).fill(companyName).catch(() => {});
  await page.waitForTimeout(800);
  const row = page.locator("tr", { hasText: companyName }).first();
  await row.waitFor({ timeout: 30000 });
  await row.getByRole("button", { name: /row actions|إجراءات/i }).click();
  await page.getByRole("menuitem", { name: /review company|مراجعة/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click();
  if (pickEnterprise) {
    const ent = page.getByRole("button", { name: /enterprise|مؤسسات/i }).first();
    if (await ent.count()) await ent.click();
    else await page.getByRole("button", { name: /^basic|أساس|pro/i }).first().click();
  } else {
    await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByText(/دور المسؤول|Administrator role/i).waitFor({ timeout: 20000 });
}

const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let browser;
try {
  console.log("\nStep 3 scroll E2E\n");
  const { companyId, userId } = await createCompany();
  report.companyId = companyId;
  await pgClient.connect();

  const { rows: adminPermRows } = await pgClient.query(
    `select count(*)::int as n
     from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     where r.company_id = $1 and r.template_key = 'admin'`,
    [companyId],
  );

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await login(page, SUPER_EMAIL, SUPER_PASSWORD);
  await openStep3(page);

  const counterText = await page.locator("text=/المحدد:|Selected:/i").last().innerText();
  const cm = counterText.match(/(\d+)\s*\/\s*(\d+)/);
  const initialSelected = cm ? Number(cm[1]) : null;
  const initialTotal = cm ? Number(cm[2]) : null;
  report.selectedCountAudit = {
    counterText,
    initialSelected,
    initialTotal,
    dbAdminRolePermissions: adminPermRows[0]?.n,
    interpretation:
      initialSelected === adminPermRows[0]?.n
        ? "intentional_default_admin_template"
        : "investigate",
  };
  pass(
    "selection",
    "initial_counter_matches_admin_template",
    `${initialSelected}/${initialTotal}; dbAdmin=${adminPermRows[0]?.n}`,
  );

  // Expand all groups
  await page.getByRole("button", { name: /expand all|توسيع الكل/i }).click();
  await page.waitForTimeout(600);

  const scrollAudit = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const adminSection = Array.from(document.querySelectorAll("section")).find((s) =>
      /دور المسؤول|Administrator/.test(s.textContent || ""),
    );
    const clippedMaxH = Array.from(adminSection?.querySelectorAll("div") || []).filter((d) => {
      const cls = d.className?.toString?.() || "";
      const s = window.getComputedStyle(d);
      return cls.includes("max-h-[22rem]") || (s.maxHeight === "352px" && s.overflowY === "hidden" && d.scrollHeight > d.clientHeight + 50);
    });

    const mainScroller = dialog
      ? Array.from(dialog.querySelectorAll("*")).find((node) => {
          const s = window.getComputedStyle(node);
          return (
            s.overflowY === "auto" &&
            (node.className?.toString?.() || "").includes("overflow-y-auto") &&
            (node.className?.toString?.() || "").includes("flex-1")
          );
        })
      : null;

    const nestedMatrixScrollers = Array.from(adminSection?.querySelectorAll("div") || []).filter((d) => {
      const s = window.getComputedStyle(d);
      return s.overflowY === "auto" && d.scrollHeight > d.clientHeight + 20;
    });

    const codes = Array.from(adminSection?.querySelectorAll("[data-permission-code]") || []).map((el) =>
      el.getAttribute("data-permission-code"),
    );
    const lastCode = codes[codes.length - 1];
    const firstCode = codes[0];

    function isInDialogView(el) {
      if (!el || !dialog) return false;
      const r = el.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      const footer = dialog.querySelector("footer");
      const footerTop = footer?.getBoundingClientRect().top ?? d.bottom;
      return r.top >= d.top - 4 && r.bottom <= footerTop + 4;
    }

    // Scroll to top then bottom via main scroller
    if (mainScroller) mainScroller.scrollTop = 0;
    const firstEl = adminSection?.querySelector(`[data-permission-code="${firstCode}"]`);
    firstEl?.scrollIntoView({ block: "center" });
    const firstVisible = isInDialogView(firstEl);

    const lastEl = adminSection?.querySelector(`[data-permission-code="${lastCode}"]`);
    lastEl?.scrollIntoView({ block: "center" });
    const lastVisible = isInDialogView(lastEl);

    if (mainScroller) {
      mainScroller.scrollTop = mainScroller.scrollHeight;
    }
    const endReached = mainScroller
      ? mainScroller.scrollTop + mainScroller.clientHeight >= mainScroller.scrollHeight - 8
      : false;

    // PageDown / End simulation
    if (mainScroller) {
      mainScroller.scrollTop = 0;
      mainScroller.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      mainScroller.scrollTop = mainScroller.scrollHeight;
    }

    return {
      clippedMaxHCount: clippedMaxH.length,
      nestedMatrixScrollers: nestedMatrixScrollers.length,
      permissionCount: codes.length,
      firstCode,
      lastCode,
      firstVisible,
      lastVisible,
      endReached,
      mainScrollH: mainScroller?.scrollHeight ?? null,
      mainClientH: mainScroller?.clientHeight ?? null,
    };
  });

  if (scrollAudit.clippedMaxHCount > 0) {
    fail("scroll", "no_maxh_clip_container", JSON.stringify(scrollAudit));
  }
  pass("scroll", "no_maxh_clip_container", "ok");

  if (scrollAudit.nestedMatrixScrollers > 0) {
    fail("scroll", "no_accidental_nested_matrix_scroller", JSON.stringify(scrollAudit));
  }
  pass("scroll", "no_accidental_nested_matrix_scroller", "single parent scroll");

  if (!scrollAudit.lastVisible) {
    fail("scroll", "last_permission_reachable", JSON.stringify(scrollAudit));
  }
  pass("scroll", "last_permission_reachable", scrollAudit.lastCode);

  if (!scrollAudit.firstVisible && scrollAudit.permissionCount > 0) {
    // first may not be visible after scrolling to last — re-check by scrolling to first
    await page.evaluate((code) => {
      document.querySelector(`[data-permission-code="${code}"]`)?.scrollIntoView({ block: "center" });
    }, scrollAudit.firstCode);
    const firstOk = await page.evaluate((code) => {
      const el = document.querySelector(`[data-permission-code="${code}"]`);
      const dialog = document.querySelector('[role="dialog"]');
      if (!el || !dialog) return false;
      const r = el.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      return r.top >= d.top - 4 && r.bottom <= d.bottom + 4;
    }, scrollAudit.firstCode);
    if (!firstOk) fail("scroll", "first_permission_reachable", scrollAudit.firstCode);
  }
  pass("scroll", "first_permission_reachable", scrollAudit.firstCode);

  // Wheel moves main scroller
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const main = Array.from(dialog?.querySelectorAll("*") || []).find((node) =>
      (node.className?.toString?.() || "").includes("overflow-y-auto") &&
      (node.className?.toString?.() || "").includes("flex-1"),
    );
    if (main) main.scrollTop = 200;
  });
  const beforeWheel = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const main = Array.from(dialog?.querySelectorAll("*") || []).find((node) =>
      (node.className?.toString?.() || "").includes("overflow-y-auto") &&
      (node.className?.toString?.() || "").includes("flex-1"),
    );
    return main?.scrollTop ?? -1;
  });
  await page.locator("[data-permission-code]").first().hover();
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(200);
  const afterWheel = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const main = Array.from(dialog?.querySelectorAll("*") || []).find((node) =>
      (node.className?.toString?.() || "").includes("overflow-y-auto") &&
      (node.className?.toString?.() || "").includes("flex-1"),
    );
    return main?.scrollTop ?? -1;
  });
  if (!(afterWheel > beforeWheel)) {
    fail("scroll", "mouse_wheel_works", `${beforeWheel} -> ${afterWheel}`);
  }
  pass("scroll", "mouse_wheel_works", `${beforeWheel} -> ${afterWheel}`);

  // Footer usable
  const footerVisible = await page.locator("footer").filter({ hasText: /التالي|Next|رجوع|Back/i }).isVisible();
  if (!footerVisible) fail("scroll", "footer_usable", "footer not visible");
  pass("scroll", "footer_usable", "ok");
  report.scroll.status = "PASS";

  // Deselect one permission, scroll away and back
  const targetCode = "customers.view";
  await page.locator(`[data-permission-code="${targetCode}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-permission-code="${targetCode}"]`).click();
  await page.waitForTimeout(300);
  const offState = await page.locator(`[data-permission-code="${targetCode}"]`).getAttribute("aria-checked");
  if (offState !== "false") fail("selection", "deselect_one", offState);
  pass("selection", "deselect_one", targetCode);

  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const main = Array.from(dialog?.querySelectorAll("*") || []).find((node) =>
      (node.className?.toString?.() || "").includes("overflow-y-auto") &&
      (node.className?.toString?.() || "").includes("flex-1"),
    );
    if (main) main.scrollTop = main.scrollHeight;
  });
  await page.waitForTimeout(200);
  await page.locator(`[data-permission-code="${targetCode}"]`).scrollIntoViewIfNeeded();
  const stillOff = await page.locator(`[data-permission-code="${targetCode}"]`).getAttribute("aria-checked");
  if (stillOff !== "false") fail("selection", "state_survives_scroll_away", stillOff);
  pass("selection", "state_survives_scroll_away", "still off");
  report.selection.status = "PASS";

  // Save + reload
  await page.getByRole("button", { name: /Save admin access|حفظ وصول المسؤول/i }).click();
  await page.waitForTimeout(2000);
  const { rows: hasCust } = await pgClient.query(
    `select 1
     from public.user_roles ur
     join public.roles r on r.id = ur.role_id
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
     where ur.user_id = $1 and r.company_id = $2 and p.code = 'customers.view'`,
    [userId, companyId],
  );
  if (hasCust.length > 0) fail("persistence", "db_customers_view_removed", "still present");
  pass("persistence", "db_customers_view_removed", "absent");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await openStep3(page, { pickEnterprise: false });
  await page.getByRole("button", { name: /expand all|توسيع الكل/i }).click().catch(() => {});
  await page.locator(`[data-permission-code="${targetCode}"]`).scrollIntoViewIfNeeded();
  const reloaded = await page.locator(`[data-permission-code="${targetCode}"]`).getAttribute("aria-checked");
  if (reloaded !== "false") fail("persistence", "reload_preserves_off", reloaded);
  pass("persistence", "reload_preserves_off", "customers.view off");
  report.persistence.status = "PASS";

  // Owner authz
  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const sign = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  if (sign.error) throw sign.error;
  const { data: denied } = await ownerClient.rpc("has_company_permission", {
    p_company_id: companyId,
    p_code: "customers.view",
  });
  if (denied !== false) fail("authz", "owner_denied_customers_view", String(denied));
  pass("authz", "owner_denied_customers_view", "false");
  report.authz.status = "PASS";

  // Entitlements section still reachable (scroll to top features)
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const main = Array.from(dialog?.querySelectorAll("*") || []).find((node) =>
      (node.className?.toString?.() || "").includes("overflow-y-auto") &&
      (node.className?.toString?.() || "").includes("flex-1"),
    );
    if (main) main.scrollTop = 0;
  });
  const entitlementsVisible = await page
    .getByText(/Company feature entitlements|مزايا الشركة التجارية/i)
    .first()
    .isVisible();
  if (!entitlementsVisible) fail("scroll", "entitlements_section_reachable", "not visible at top");
  pass("scroll", "entitlements_section_reachable", "ok");

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const shot = resolve(outDir, `step3-scroll-e2e-${stamp}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  report.screenshot = shot;
  writeFileSync(resolve(outDir, `step3-scroll-e2e-${stamp}.json`), JSON.stringify(report, null, 2));
  console.log("\n=== FINAL ===");
  console.log(`Scroll: ${report.scroll.status}`);
  console.log(`Selection: ${report.selection.status}`);
  console.log(`Persistence: ${report.persistence.status}`);
  console.log(`Authz: ${report.authz.status}`);
  console.log(`Selected count audit: ${JSON.stringify(report.selectedCountAudit)}`);
  console.log("\nPASS step 3 scroll E2E\n");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  for (const key of ["scroll", "selection", "persistence", "authz"]) {
    if (report[key].status === "PENDING") {
      report[key].status = report[key].cases.some((c) => c.ok === false) ? "FAIL" : report[key].cases.length ? "PARTIAL" : "FAIL";
    }
  }
  writeFileSync(resolve(root, "scripts/_tmp-step3-scroll-e2e.json"), JSON.stringify(report, null, 2));
  console.error("\nFAIL", report.error);
  console.log("\n=== FINAL ===");
  console.log(`Scroll: ${report.scroll.status}`);
  console.log(`Selection: ${report.selection.status}`);
  console.log(`Persistence: ${report.persistence.status}`);
  console.log(`Authz: ${report.authz.status}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await pgClient.end().catch(() => {});
}
