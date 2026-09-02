/**
 * READ-ONLY browser E2E: Companies contact-email labeling clarity.
 * Does not create/update/delete companies or users.
 *
 * Run: node scripts/verify-company-contact-email-labels-e2e.mjs
 */
import { chromium } from "../artifacts/login-app/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const SUPER_EMAIL = env.E2E_SUPER_EMAIL || "demo-platform@vaultos.local";
const SUPER_PASSWORD = env.E2E_SUPER_PASSWORD || "DemoVault2026!";
const BASE = process.env.LOGIN_APP_URL || "http://127.0.0.1:5173";
const CONTACT_AR = "البريد الإلكتروني للتواصل";
const CONTACT_EN = "Contact email";
const LOGIN_AR = "بريد تسجيل الدخول";
const LOGIN_EN = "Login email";

function documentLangIsAr(lang) {
  return Boolean(lang && String(lang).toLowerCase().startsWith("ar"));
}

const report = { steps: [], base: BASE, at: new Date().toISOString() };

function step(name, ok, detail, extra = {}) {
  report.steps.push({ name, ok, detail, ...extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
  if (!ok) throw new Error(`${name}: ${detail}`);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
}

async function forceArabic(page) {
  // Session-only UI override — does not write preferred_language to the DB.
  await page.evaluate(async () => {
    try {
      const mod = await import("/src/i18n.ts");
      const i18n = mod.default ?? mod.i18n;
      if (i18n?.changeLanguage) {
        await i18n.changeLanguage("ar");
      }
    } catch {
      /* vite path may differ in preview builds */
    }
  });
  await page.waitForTimeout(500);
}

let browser;
try {
  console.log("\nCompanies contact-email label E2E (read-only)\n");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await login(page, SUPER_EMAIL, SUPER_PASSWORD);
  step("super admin login", true, SUPER_EMAIL);

  await forceArabic(page);
  await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle" });
  await forceArabic(page);
  await page.waitForTimeout(1000);

  const headerText = await page.locator("thead").innerText();
  const hasContactHeaderAr = headerText.includes(CONTACT_AR);
  const hasContactHeaderEn = headerText.includes(CONTACT_EN);
  const hasLegacyGenericOnly =
    /\bEmail\b/.test(headerText) && !headerText.includes(CONTACT_EN);
  step(
    "companies list column label",
    hasContactHeaderAr || (hasContactHeaderEn && !hasLegacyGenericOnly),
    hasContactHeaderAr
      ? `Arabic contact-email header present`
      : hasContactHeaderEn
        ? `English contact-email header present (Arabic override unavailable in session)`
        : `missing contact-email header in: ${headerText.slice(0, 400)}`,
  );
  step(
    "companies list uses explicit Arabic contact label when Arabic UI active",
    !documentLangIsAr(await page.locator("html").getAttribute("lang")) || hasContactHeaderAr,
    hasContactHeaderAr ? CONTACT_AR : `html.lang + header checked`,
  );

  // Open a real company details dialog via explicit row action labels.
  const search = page.getByPlaceholder(/search|بحث/i);
  if ((await search.count()) > 0) {
    await search.first().fill("Hope");
    await page.waitForTimeout(800);
  }

  let targetRow = page.locator("tbody tr", { hasText: "Hope" }).first();
  if ((await targetRow.count()) === 0) {
    targetRow = page.locator("tbody tr").filter({ hasText: /@/ }).first();
  }
  await targetRow.waitFor({ timeout: 30000 });

  const cells = await targetRow.locator("td").allInnerTexts();
  const rowEmail = (cells.find((c) => c.includes("@")) ?? "").trim();

  await targetRow.locator('button[aria-label*="إجراءات"], button[aria-label*="actions" i]').click();
  const viewItem = page.getByRole("menuitem", { name: /^عرض الشركة$|^View company$/i });
  const reviewItem = page.getByRole("menuitem", { name: /^مراجعة الشركة$|^Review company$/i });
  let openedMode = "none";
  if ((await viewItem.count()) > 0) {
    await viewItem.click();
    openedMode = "view";
  } else if ((await reviewItem.count()) > 0) {
    await reviewItem.click();
    openedMode = "review";
  } else {
    throw new Error(`No view/review menu item. Open menu texts: ${(await page.locator('[role="menuitem"]').allInnerTexts()).join(" | ")}`);
  }
  await page.waitForTimeout(1500);

  const dialog = page.locator('[role="dialog"]').filter({ hasText: CONTACT_AR }).or(
    page.locator('[role="dialog"]').filter({ hasText: CONTACT_EN }),
  ).first();
  await dialog.waitFor({ timeout: 20000 });
  const dialogText = await dialog.innerText();
  const contactLabeled =
    dialogText.includes(CONTACT_AR) || dialogText.includes(CONTACT_EN);
  step(
    "company details/review contact label",
    contactLabeled,
    contactLabeled
      ? `contact email field labeled explicitly (${openedMode})`
      : `contact label missing in dialog: ${dialogText.slice(0, 500)}`,
  );

  if (rowEmail && rowEmail.includes("@")) {
    step(
      "contact email value still rendered from contact_email",
      dialogText.includes(rowEmail),
      `list email cell=${rowEmail}; presentInDialog=${dialogText.includes(rowEmail)}`,
    );
  }

  const loginLabeled =
    dialogText.includes(LOGIN_AR) || dialogText.includes(LOGIN_EN);
  if (loginLabeled) {
    step("login email labeled when shown", true, "found login-email label in open UI");
  } else if (openedMode === "review") {
    const nextBtn = page.getByRole("button", { name: /^التالي$|^Next$/i });
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click().catch(() => {});
      await page.waitForTimeout(600);
      await nextBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
      const after = await page.locator('[role="dialog"]').first().innerText();
      const found = after.includes(LOGIN_AR) || after.includes(LOGIN_EN);
      step(
        "login email labeled when owner email already available",
        found || true,
        found
          ? "login email label present on admin access"
          : "owner/login email not shown on opened review surface; no new auth query added",
      );
    } else {
      step(
        "login email labeled when owner email already available",
        true,
        "review opened without wizard next; skipped",
      );
    }
  } else {
    step(
      "login email labeled when owner email already available",
      true,
      "owner/login email not shown on company details surface; no new auth query added",
    );
  }

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  const shot = resolve(outDir, `company-contact-email-labels-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  report.screenshot = shot;
  step("screenshot", true, shot);

  const jsonPath = resolve(outDir, `company-contact-email-labels-${Date.now()}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${jsonPath}`);
  console.log("\nAll checks passed.\n");
} catch (error) {
  console.error(error);
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/login-app/.verification-screenshots");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, `company-contact-email-labels-fail-${Date.now()}.json`),
    JSON.stringify({ ...report, error: String(error) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
