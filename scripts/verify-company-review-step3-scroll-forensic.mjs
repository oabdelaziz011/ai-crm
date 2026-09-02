/**
 * Forensic: Step 3 permission matrix scroll + 293/293 selected count.
 * Disposable company only.
 *
 * Run: node scripts/verify-company-review-step3-scroll-forensic.mjs
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
const ownerEmail = `scroll-fx-${stamp}@valueor.test`;
const ownerPassword = `Review!${stamp}Aa`;
const companyName = `Scroll FX Co ${stamp}`;
const report = { stamp, companyName, findings: [], steps: [] };

function note(name, detail) {
  report.findings.push({ name, detail });
  console.log(`FINDING ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}
function step(name, ok, detail) {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
  if (!ok) throw new Error(`${name}: ${detail}`);
}

const created = await admin.auth.admin.createUser({
  email: ownerEmail,
  password: ownerPassword,
  email_confirm: true,
  user_metadata: { full_name: "Scroll FX Owner" },
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
    contact_phone: "+966500006666",
    country: "Saudi Arabia",
    city: "Riyadh",
    address: "Test",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    owner_display_name: "Scroll FX Owner",
    owner_full_name: "Scroll FX Owner",
    owner_phone: "+966500006666",
    owner_job_title: "Owner",
  },
});
if (onboard.error) throw onboard.error;
const companyId = onboard.data.company_id || onboard.data.company?.id;
report.companyId = companyId;
step("create disposable", Boolean(companyId), companyId);

const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await pgClient.connect();

const { rows: templateCount } = await pgClient.query(
  `select count(*)::int as n
   from public.platform_role_template_permissions`,
);
const { rows: rolePermCount } = await pgClient.query(
  `select count(*)::int as n
   from public.user_roles ur
   join public.roles r on r.id = ur.role_id
   join public.role_permissions rp on rp.role_id = r.id
   where ur.user_id = $1 and r.company_id = $2 and r.template_key = 'admin'`,
  [userId, companyId],
);
const { rows: adminRolePermExact } = await pgClient.query(
  `select count(*)::int as n
   from public.roles r
   join public.role_permissions rp on rp.role_id = r.id
   where r.company_id = $1 and r.template_key = 'admin'`,
  [companyId],
);
note("platform_role_template_permissions_total", templateCount[0]?.n);
note("owner_admin_role_permission_count", rolePermCount[0]?.n);
note("company_admin_role_permission_count", adminRolePermExact[0]?.n);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(SUPER_EMAIL);
  await page.locator('input[type="password"]').fill(SUPER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });

  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /pending|قيد/i }).first().click().catch(() => {});
  await page.getByPlaceholder(/search|بحث/i).fill(companyName).catch(() => {});
  await page.waitForTimeout(900);
  const row = page.locator("tr", { hasText: companyName }).first();
  await row.waitFor({ timeout: 30000 });
  await row.getByRole("button", { name: /row actions|إجراءات/i }).click();
  await page.getByRole("menuitem", { name: /review company|مراجعة/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /package|باقة|commercial package/i }).first().click();
  await page.getByRole("button", { name: /^basic|أساس|pro|enterprise/i }).first().click();
  await page.waitForTimeout(1500);
  // Prefer Enterprise if available so more features/permissions are visible
  const entBtn = page.getByRole("button", { name: /enterprise|مؤسسات/i }).first();
  if (await entBtn.count()) {
    await entBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByText(/دور المسؤول|Administrator role/i).waitFor({ timeout: 20000 });

  const counterText = await page.locator("text=/المحدد:|Selected:/i").last().innerText();
  note("initial_selected_counter", counterText);

  const scrollProbe = await page.evaluate(() => {
    const adminSection = Array.from(document.querySelectorAll("section")).find((s) =>
      /دور المسؤول|Administrator/.test(s.textContent || ""),
    );
    if (!adminSection) return { error: "no admin section" };

    const matrixWrap = adminSection.querySelector(".max-h-\\[22rem\\], [class*='max-h-']");
    // find wrapper around permission selector by looking for role=checkbox groups
    const candidates = Array.from(adminSection.querySelectorAll("div")).filter((d) => {
      const cls = d.className?.toString?.() || "";
      return cls.includes("max-h") || cls.includes("overflow");
    });

    const chain = [];
    let el = adminSection.querySelector("[data-permission-code]")?.parentElement;
    for (let i = 0; i < 12 && el; i += 1) {
      const style = window.getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        className: (el.className?.toString?.() || "").slice(0, 120),
        overflowY: style.overflowY,
        overflowX: style.overflowX,
        maxHeight: style.maxHeight,
        height: style.height,
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        canScroll: el.scrollHeight > el.clientHeight + 2,
      });
      el = el.parentElement;
    }

    // Main dialog scroll area
    const dialog = document.querySelector('[role="dialog"]');
    const dialogScrollers = dialog
      ? Array.from(dialog.querySelectorAll("*")).filter((node) => {
          const s = window.getComputedStyle(node);
          return (s.overflowY === "auto" || s.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 2;
        })
      : [];

    return {
      counterNearAdmin: (adminSection.textContent || "").match(/المحدد:\s*\d+\s*\/\s*\d+|Selected:\s*\d+\s*\/\s*\d+/i)?.[0],
      overflowCandidates: candidates.slice(0, 15).map((d) => ({
        className: (d.className?.toString?.() || "").slice(0, 140),
        overflowY: window.getComputedStyle(d).overflowY,
        maxHeight: window.getComputedStyle(d).maxHeight,
        clientH: d.clientHeight,
        scrollH: d.scrollHeight,
        clipped: d.scrollHeight > d.clientHeight + 2 && window.getComputedStyle(d).overflowY === "hidden",
      })),
      ancestorChain: chain,
      dialogScrollContainerCount: dialogScrollers.length,
      dialogScrollers: dialogScrollers.slice(0, 8).map((n) => ({
        className: (n.className?.toString?.() || "").slice(0, 120),
        clientH: n.clientHeight,
        scrollH: n.scrollHeight,
      })),
    };
  });
  note("scroll_probe_before_expand", scrollProbe);

  // Expand all
  const expandAll = page.getByRole("button", { name: /expand all|توسيع الكل/i });
  if (await expandAll.count()) await expandAll.click();
  await page.waitForTimeout(800);

  const afterExpand = await page.evaluate(() => {
    const adminSection = Array.from(document.querySelectorAll("section")).find((s) =>
      /دور المسؤول|Administrator/.test(s.textContent || ""),
    );
    const clipped = Array.from(adminSection?.querySelectorAll("div") || [])
      .map((d) => {
        const s = window.getComputedStyle(d);
        return {
          className: (d.className?.toString?.() || "").slice(0, 140),
          overflowY: s.overflowY,
          maxHeight: s.maxHeight,
          clientH: d.clientHeight,
          scrollH: d.scrollHeight,
          clipped: d.scrollHeight > d.clientHeight + 2 && s.overflowY === "hidden",
        };
      })
      .filter((x) => x.clipped || (x.maxHeight && x.maxHeight !== "none" && x.scrollH > x.clientH));

    const permissionRows = adminSection?.querySelectorAll("[data-permission-code]")?.length || 0;
    const lastRow = adminSection?.querySelector("[data-permission-code]:last-of-type");
    const lastRect = lastRow?.getBoundingClientRect();
    const dialog = document.querySelector('[role="dialog"]');
    const mainScroller = dialog
      ? Array.from(dialog.querySelectorAll("*")).find((node) => {
          const s = window.getComputedStyle(node);
          return s.overflowY === "auto" && node.scrollHeight > node.clientHeight + 50;
        })
      : null;

    let reachedBottom = false;
    if (mainScroller) {
      mainScroller.scrollTop = mainScroller.scrollHeight;
      reachedBottom = mainScroller.scrollTop + mainScroller.clientHeight >= mainScroller.scrollHeight - 4;
    }

    // Can we see last permission row after scroll?
    const lastVisible = lastRow
      ? (() => {
          const r = lastRow.getBoundingClientRect();
          const dialogRect = dialog?.getBoundingClientRect();
          return dialogRect ? r.bottom <= dialogRect.bottom + 2 && r.top >= dialogRect.top - 2 : false;
        })()
      : false;

    return {
      clippedContainers: clipped,
      permissionRowCount: permissionRows,
      lastRowRect: lastRect
        ? { top: lastRect.top, bottom: lastRect.bottom, height: lastRect.height }
        : null,
      mainScroller: mainScroller
        ? {
            className: (mainScroller.className?.toString?.() || "").slice(0, 120),
            scrollTop: mainScroller.scrollTop,
            clientH: mainScroller.clientHeight,
            scrollH: mainScroller.scrollHeight,
            reachedBottom,
          }
        : null,
      lastVisibleAfterMainScroll: lastVisible,
    };
  });
  note("scroll_probe_after_expand", afterExpand);

  const hasClippedMatrix = (afterExpand.clippedContainers || []).some(
    (c) => /max-h|overflow-hidden/i.test(c.className) && c.clipped,
  );
  note("matrix_clipped_by_nested_container", hasClippedMatrix);

  // Wheel on matrix area
  const matrixBox = page.locator("section").filter({ hasText: /دور المسؤول|Administrator role/i }).locator("[data-permission-code]").first();
  await matrixBox.scrollIntoViewIfNeeded();
  const beforeWheel = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const scroller = dialog
      ? Array.from(dialog.querySelectorAll("*")).find((node) => {
          const s = window.getComputedStyle(node);
          return s.overflowY === "auto" && node.scrollHeight > node.clientHeight + 50;
        })
      : null;
    return scroller?.scrollTop ?? -1;
  });
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(300);
  const afterWheel = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const scroller = dialog
      ? Array.from(dialog.querySelectorAll("*")).find((node) => {
          const s = window.getComputedStyle(node);
          return s.overflowY === "auto" && node.scrollHeight > node.clientHeight + 50;
        })
      : null;
    return scroller?.scrollTop ?? -1;
  });
  note("wheel_scroll_delta", { beforeWheel, afterWheel, moved: afterWheel > beforeWheel });

  // Compare selected count to template
  const m = String(counterText).match(/(\d+)\s*\/\s*(\d+)/);
  const selected = m ? Number(m[1]) : null;
  const total = m ? Number(m[2]) : null;
  note("selected_vs_template", {
    uiSelected: selected,
    uiTotal: total,
    onboardAdminRoleCount: rolePermCount[0]?.n,
    companyAdminRoleCount: adminRolePermExact[0]?.n,
    allSelected: selected !== null && selected === total,
    likelyDefaultAdminTemplate: selected !== null && selected === total && (rolePermCount[0]?.n ?? 0) > 0,
  });

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const shot = resolve(outDir, `step3-scroll-forensic-${stamp}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  report.screenshot = shot;
  writeFileSync(resolve(outDir, `step3-scroll-forensic-${stamp}.json`), JSON.stringify(report, null, 2));
  console.log(`\nReport written. clipped=${hasClippedMatrix}`);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(root, "scripts/_tmp-step3-scroll-forensic.json"), JSON.stringify(report, null, 2));
  console.error("FAIL", report.error);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  await pgClient.end().catch(() => {});
}
