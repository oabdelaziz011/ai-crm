/**
 * Precise forensic: individual permission row clicks only (inside <label>).
 */
import { chromium } from "../artifacts/login-app/node_modules/playwright/index.mjs";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const ownerEmail = `rbac-row-${stamp}@valueor.test`;
const ownerPassword = `Review!${stamp}Aa`;
const companyName = `RBAC Row Co ${stamp}`;
const report = { stamp, findings: [] };

function note(name, detail) {
  report.findings.push({ name, detail });
  console.log(`FINDING ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const created = await admin.auth.admin.createUser({
  email: ownerEmail,
  password: ownerPassword,
  email_confirm: true,
  user_metadata: { full_name: "RBAC Row Owner" },
});
if (created.error) throw created.error;
const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
await userClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
const onboard = await userClient.rpc("onboard_own_company_v1", {
  p_payload: {
    name: companyName,
    legal_name: `${companyName} Legal`,
    business_type: "clinic",
    industry: "healthcare",
    contact_email: ownerEmail,
    contact_phone: "+966500007666",
    country: "Saudi Arabia",
    city: "Riyadh",
    address: "Test",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    owner_display_name: "RBAC Row Owner",
    owner_full_name: "RBAC Row Owner",
    owner_phone: "+966500007666",
    owner_job_title: "Owner",
  },
});
if (onboard.error) throw onboard.error;
const companyId = onboard.data.company_id || onboard.data.company?.id;
report.companyId = companyId;
console.log("company", companyId);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"]').fill("demo-platform@vaultos.local");
await page.locator('input[type="password"]').fill("DemoVault2026!");
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
await page.getByRole("button", { name: /^basic|أساس/i }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /next|التالي/i }).click();
await page.getByText(/دور المسؤول|Administrator role/i).waitFor({ timeout: 20000 });

const adminPanel = page.locator("section").filter({ hasText: /دور المسؤول|Administrator role/i }).first();
await adminPanel.locator("label").filter({ has: page.locator('button[role="checkbox"]') }).first().waitFor();

// Individual permission labels: contain checkbox AND do not contain group/select-all copy
const individualLabels = adminPanel.locator("label").filter({
  has: page.locator('button[role="checkbox"]'),
});

const probe = await page.evaluate(() => {
  const section = Array.from(document.querySelectorAll("section")).find((s) =>
    /دور المسؤول|Administrator/.test(s.textContent || ""),
  );
  if (!section) return { error: "no section" };

  const labels = Array.from(section.querySelectorAll("label")).filter((lab) => {
    const cb = lab.querySelector('button[role="checkbox"]');
    if (!cb) return false;
    const t = lab.textContent || "";
    if (/تحديد كل|Select all|إلغاء/.test(t)) return false;
    // group select-all is NOT inside label in current markup; individual rows are
    return true;
  });

  const results = [];
  for (const lab of labels.slice(0, 5)) {
    const cb = lab.querySelector('button[role="checkbox"]');
    const before = cb.getAttribute("data-state");
    const text = (lab.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);

    // Strategy A: click the checkbox button itself
    cb.click();
    const afterA = cb.getAttribute("data-state");
    // restore
    if (afterA !== before) cb.click();

    // Strategy B: click label center (text)
    const beforeB = cb.getAttribute("data-state");
    lab.click();
    const afterB = cb.getAttribute("data-state");
    if (afterB !== beforeB) lab.click(); // restore

    // Strategy C: dispatch pointer events on checkbox only with stopPropagation simulation
    const beforeC = cb.getAttribute("data-state");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    let labelReceived = false;
    const onLabel = () => {
      labelReceived = true;
    };
    lab.addEventListener("click", onLabel);
    cb.dispatchEvent(evt);
    lab.removeEventListener("click", onLabel);
    const afterC = cb.getAttribute("data-state");
    if (afterC !== beforeC) cb.click();

    results.push({
      text,
      before,
      afterCheckboxClick: afterA,
      checkboxClickNoOp: afterA === before,
      afterLabelClick: afterB,
      labelClickNoOp: afterB === beforeB,
      afterDispatchBubble: afterC,
      labelReceivedBubble: labelReceived,
      dispatchNoOp: afterC === beforeC,
    });
  }

  // Counter text
  const counter = (section.textContent || "").match(/المحدد:\s*\d+\s*\/\s*\d+|Selected:\s*\d+\s*\/\s*\d+/i)?.[0];

  // Structure sample
  const sample = labels[0];
  const sampleHtml = sample
    ? {
        outer: sample.outerHTML.slice(0, 500),
        checkboxParent: sample.querySelector('button[role="checkbox"]')?.parentElement?.tagName,
      }
    : null;

  return { counter, labelCount: labels.length, results, sampleHtml };
});

note("precise_probe", probe);

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, `rbac-row-forensic-${stamp}.json`), JSON.stringify({ ...report, probe }, null, 2));
await page.screenshot({ path: resolve(outDir, `rbac-row-forensic-${stamp}.png`), fullPage: true });
console.log("\nDone");
await browser.close();
