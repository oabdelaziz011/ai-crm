/**
 * Capture real browser login request/response + console errors.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = resolve(root, "docs/architecture");
mkdirSync(outDir, { recursive: true });

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const report = {
  capturedAt: new Date().toISOString(),
  viteEnv: {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? null,
    VITE_SUPABASE_PUBLISHABLE_KEY_PREFIX: env.VITE_SUPABASE_PUBLISHABLE_KEY?.slice(0, 20) ?? null,
    keyLength: env.VITE_SUPABASE_PUBLISHABLE_KEY?.length ?? 0,
  },
  authRequests: [],
  consoleErrors: [],
  pageErrors: [],
  loginResult: null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    report.consoleErrors.push({ type: msg.type(), text: msg.text() });
  }
});

page.on("pageerror", (err) => {
  report.pageErrors.push({ name: err.name, message: err.message, stack: err.stack?.slice(0, 500) });
});

page.on("requestfailed", (req) => {
  if (req.url().includes("/auth/v1/")) {
    report.authRequests.push({
      phase: "requestfailed",
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText ?? null,
    });
  }
});

page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("/auth/v1/token")) return;
  let body = "";
  try {
    body = await res.text();
  } catch (e) {
    body = `[unreadable: ${e instanceof Error ? e.message : String(e)}]`;
  }
  report.authRequests.push({
    phase: "response",
    url,
    method: res.request().method(),
    status: res.status(),
    statusText: res.statusText(),
    headers: {
      "content-type": res.headers()["content-type"] ?? null,
      "access-control-allow-origin": res.headers()["access-control-allow-origin"] ?? null,
    },
    body: body.slice(0, 2000),
  });
});

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });

report.injectedEnv = {
  url: env.VITE_SUPABASE_URL ?? null,
  keyPrefix: env.VITE_SUPABASE_PUBLISHABLE_KEY?.slice(0, 20) ?? null,
  keyLength: env.VITE_SUPABASE_PUBLISHABLE_KEY?.length ?? 0,
};

await page.getByPlaceholder("you@example.com").fill("demo-platform@vaultos.local");
await page.locator('input[type="password"]').fill("DemoVault2026!");
await page.getByRole("button", { name: /authenticate/i }).click();
await page.waitForTimeout(8000);

report.loginResult = {
  url: page.url(),
  rootError: await page.locator(".text-destructive").first().textContent().catch(() => null),
};

// Direct bundled-client signIn probe (same module the app uses)
report.bundledClientProbe = await page.evaluate(async () => {
  try {
    const mod = await import("/src/lib/supabase.ts");
    const { data, error } = await mod.supabase.auth.signInWithPassword({
      email: "demo-platform@vaultos.local",
      password: "DemoVault2026!",
    });
    return {
      ok: !error,
      error: error
        ? {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? null,
            name: error.name ?? null,
          }
        : null,
      userId: data.session?.user?.id ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      thrown: {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
});

// Raw fetch probe (bypass supabase-js)
report.rawFetchProbe = await page.evaluate(
  async ({ url, key }) => {
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "demo-platform@vaultos.local", password: "DemoVault2026!" }),
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, statusText: res.statusText, body: body.slice(0, 500) };
    } catch (e) {
      return {
        ok: false,
        thrown: { name: e instanceof Error ? e.name : "unknown", message: e instanceof Error ? e.message : String(e) },
      };
    }
  },
  {
    url: env.VITE_SUPABASE_URL,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  },
);

writeFileSync(resolve(outDir, "login-network-investigation.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
