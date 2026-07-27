/** SPA client-side navigation timing (no full reload). */
import { chromium } from "../artifacts/login-app/node_modules/playwright/index.mjs";

const BASE = "http://127.0.0.1:4173";
const EMAIL = "demo-beta-admin@vaultos.local";
const PASSWORD = "DemoVault2026!";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"], input[placeholder="you@example.com"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button:has-text("Authenticate")');
await page.waitForURL(/\/dashboard/, { timeout: 60000 });
await page.waitForTimeout(2000);

const routes = [
  { name: "customers", selector: 'button:has-text("Customers")' },
  { name: "bookings", selector: 'button:has-text("Bookings")' },
  { name: "calendar", selector: 'button:has-text("Calendar")' },
  { name: "ai-assistant", selector: 'button:has-text("AI Assistant")' },
  { name: "home", selector: 'button:has-text("Home")' },
];

const results = [];
for (const route of routes) {
  const requests = [];
  const handler = (req) => {
    if (req.url().includes("supabase.co")) requests.push({ url: req.url(), method: req.method() });
  };
  page.on("request", handler);

  const t0 = performance.now();
  await page.click(route.selector);
  await page.waitForTimeout(600);
  const ms = Math.round(performance.now() - t0);
  page.off("request", handler);

  results.push({ route: route.name, transitionMs: ms, supabaseRequests: requests.length, requests: requests.slice(0, 8) });
  console.log(`${route.name}: ${ms}ms, supabase=${requests.length}`);
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
