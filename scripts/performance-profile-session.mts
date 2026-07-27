/**
 * ValueOR performance profiling session — measurement only.
 * Run: npx tsx scripts/performance-profile-session.mts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Request, type Response } from "../artifacts/login-app/node_modules/playwright/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/performance-profile");
mkdirSync(outDir, { recursive: true });

const BASE = process.env.PROFILE_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.PROFILE_EMAIL ?? "demo-beta-admin@vaultos.local";
const PASSWORD = process.env.PROFILE_PASSWORD ?? "DemoVault2026!";

type NetEntry = {
  url: string;
  method: string;
  resourceType: string;
  status: number;
  durationMs: number;
  transferSize: number;
  startMs: number;
  isSupabase: boolean;
  isRpc: boolean;
  isDuplicateKey: string;
};

type RouteTransition = {
  from: string;
  to: string;
  clickToPaintMs: number;
  networkRequests: number;
  supabaseRequests: number;
  rpcRequests: number;
  duplicateRequests: number;
  jsChunksLoaded: number;
  longTasksMs: number;
  longTaskCount: number;
};

const ROUTES = [
  "/dashboard",
  "/dashboard/customers",
  "/dashboard/bookings",
  "/dashboard/calendar",
  "/dashboard/ai-assistant",
  "/dashboard/ai-chat",
  "/dashboard/settings",
  "/dashboard/users",
  "/dashboard/reports",
  "/dashboard",
];

function envFromLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  const path = resolve(root, "artifacts/login-app/.env.local");
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  return env;
}

function duplicateKey(url: string, method: string): string {
  try {
    const u = new URL(url);
    return `${method}:${u.origin}${u.pathname}`;
  } catch {
    return `${method}:${url}`;
  }
}

async function measureRpcTimings(): Promise<
  { name: string; durationMs: number; error?: string }[]
> {
  const env = envFromLocal();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return [];

  const { createClient } = await import(
    "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
  );
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const companyId = (
    await sb.from("profiles").select("company_id").eq("id", (await sb.auth.getUser()).data.user?.id ?? "").maybeSingle()
  ).data?.company_id;

  const rpcs: { name: string; args: Record<string, unknown> }[] = [
    { name: "platform_resolve_ai_runtime_config", args: { p_company_id: companyId, p_provider_key: "openai", p_use_case: "chat" } },
    { name: "platform_ai_feature_enabled", args: { p_company_id: companyId, p_feature_key: "ai_chat" } },
  ];

  const results: { name: string; durationMs: number; error?: string }[] = [];
  for (const rpc of rpcs) {
    const t0 = performance.now();
    const { error } = await sb.rpc(rpc.name, rpc.args);
    results.push({
      name: rpc.name,
      durationMs: Math.round(performance.now() - t0),
      error: error?.message,
    });
  }

  const queries: { label: string; fn: () => Promise<unknown> }[] = [
    {
      label: "customers.select(*)",
      fn: async () => sb.from("customers").select("*").order("created_at", { ascending: false }),
    },
    {
      label: "bookings.select(*)",
      fn: async () => sb.from("bookings").select("*").order("created_at", { ascending: false }),
    },
    {
      label: "invoices.select(*)",
      fn: async () => sb.from("invoices").select("*").order("created_at", { ascending: false }),
    },
    {
      label: "profiles+company+roles+permissions (auth chain)",
      fn: async () => {
        const userId = (await sb.auth.getUser()).data.user?.id;
        if (!userId) return null;
        const t0 = performance.now();
        await sb.from("profiles").select("id, company_id, full_name, is_super_admin").eq("id", userId).maybeSingle();
        await sb.from("user_roles").select("role_id").eq("user_id", userId);
        return performance.now() - t0;
      },
    },
  ];

  for (const q of queries) {
    const t0 = performance.now();
    await q.fn();
    results.push({ name: q.label, durationMs: Math.round(performance.now() - t0) });
  }

  return results;
}

function analyzeBundleSizes(): { file: string; kb: number; gzipEstimateKb: number }[] {
  const dist = resolve(root, "artifacts/login-app/dist/public/assets");
  try {
    const files = readdirSync(dist).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
    return files
      .map((file) => {
        const bytes = statSync(join(dist, file)).size;
        return { file, kb: Math.round(bytes / 1024), gzipEstimateKb: Math.round(bytes / 1024 / 3) };
      })
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 30);
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== ValueOR Performance Profile ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    (window as unknown as { __PERF__: Record<string, unknown> }).__PERF__ = {
      longTasks: [] as { duration: number; startTime: number; name: string }[],
      renders: [] as { component: string; ts: number }[],
    };
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "longtask" || entry.duration > 50) {
            (window as unknown as { __PERF__: { longTasks: unknown[] } }).__PERF__.longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name,
            });
          }
        }
      });
      po.observe({ entryTypes: ["longtask"] });
    } catch {
      /* longtask not supported in all contexts */
    }
  });

  const allNetwork: NetEntry[] = [];
  const requestStarts = new Map<Request, number>();

  page.on("request", (req) => requestStarts.set(req, performance.now()));
  page.on("response", async (res: Response) => {
    const req = res.request();
    const start = requestStarts.get(req) ?? performance.now();
    const url = req.url();
    let transferSize = 0;
    try {
      const headers = await res.allHeaders();
      const cl = headers["content-length"];
      transferSize = cl ? Number(cl) : 0;
    } catch {
      /* ignore */
    }
    allNetwork.push({
      url,
      method: req.method(),
      resourceType: req.resourceType(),
      status: res.status(),
      durationMs: Math.round(performance.now() - start),
      transferSize,
      startMs: Math.round(start),
      isSupabase: url.includes("supabase.co"),
      isRpc: url.includes("/rest/v1/rpc/"),
      isDuplicateKey: duplicateKey(url, req.method()),
    });
  });

  // Login
  const loginStart = performance.now();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="you@example.com"], input[type="email"]', EMAIL);
  await page.fill('input[placeholder="••••••••"], input[type="password"]', PASSWORD);
  await page.click('button:has-text("Authenticate")');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  const loginMs = Math.round(performance.now() - loginStart);
  console.log(`Login → dashboard: ${loginMs}ms`);

  // Initial load metrics
  const initialNav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  await page.waitForTimeout(1500);

  const routeTransitions: RouteTransition[] = [];
  let prevPath = page.url();

  for (const route of ROUTES) {
    const path = route.startsWith("/") ? route : `/${route}`;
    const navStart = performance.now();

    await page.evaluate((p) => {
      window.history.pushState({}, "", p);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);

    // Also try wouter link navigation via direct goto for reliability
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    const paintMs = Math.round(performance.now() - navStart);
    const windowStart = navStart;
    const segment = allNetwork.filter((n) => n.startMs >= windowStart - 50);

    const dupMap = new Map<string, number>();
    for (const n of segment) dupMap.set(n.isDuplicateKey, (dupMap.get(n.isDuplicateKey) ?? 0) + 1);
    const duplicates = [...dupMap.values()].filter((c) => c > 1).reduce((a, c) => a + (c - 1), 0);

    const perf = await page.evaluate(() => {
      const p = (window as unknown as { __PERF__?: { longTasks: { duration: number }[] } }).__PERF__;
      const tasks = p?.longTasks ?? [];
      return {
        longTaskCount: tasks.length,
        longTasksMs: Math.round(tasks.reduce((s, t) => s + t.duration, 0)),
      };
    });

    routeTransitions.push({
      from: prevPath,
      to: `${BASE}${path}`,
      clickToPaintMs: paintMs,
      networkRequests: segment.length,
      supabaseRequests: segment.filter((n) => n.isSupabase).length,
      rpcRequests: segment.filter((n) => n.isRpc).length,
      duplicateRequests: duplicates,
      jsChunksLoaded: segment.filter((n) => n.resourceType === "script" && n.url.includes("/assets/")).length,
      longTasksMs: perf.longTasksMs,
      longTaskCount: perf.longTaskCount,
    });

    prevPath = `${BASE}${path}`;
    console.log(`Route ${path}: ${paintMs}ms | net=${segment.length} supabase=${segment.filter((n) => n.isSupabase).length} dup=${duplicates}`);
  }

  // React Query cache probe via console
  const queryProbe = await page.evaluate(async () => {
    const perf = (window as unknown as { __VALUEOR_AUTH_PERF__?: { snapshot: () => Record<string, unknown> } }).__VALUEOR_AUTH_PERF__;
    return perf?.snapshot?.() ?? null;
  });

  // CDP Performance profile sample on one navigation
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(`${BASE}/dashboard/customers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const metrics = await cdp.send("Performance.getMetrics");
  await cdp.send("Performance.disable");

  const rpcTimings = await measureRpcTimings();
  const bundles = analyzeBundleSizes();

  const supabaseCalls = allNetwork.filter((n) => n.isSupabase);
  const slowestNetwork = [...allNetwork].sort((a, b) => b.durationMs - a.durationMs).slice(0, 25);
  const slowestSupabase = [...supabaseCalls].sort((a, b) => b.durationMs - a.durationMs).slice(0, 25);

  const dupAll = new Map<string, number>();
  for (const n of allNetwork) dupAll.set(n.isDuplicateKey, (dupAll.get(n.isDuplicateKey) ?? 0) + 1);
  const topDuplicates = [...dupAll.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => ({ key, count }));

  const report = {
    capturedAt: new Date().toISOString(),
    loginMs,
    initialNavigation: initialNav
      ? {
          domContentLoaded: Math.round(initialNav.domContentLoadedEventEnd - initialNav.startTime),
          loadComplete: Math.round(initialNav.loadEventEnd - initialNav.startTime),
          ttfb: Math.round(initialNav.responseStart - initialNav.startTime),
        }
      : null,
    routeTransitions,
    queryProbe,
    cdpMetrics: metrics.metrics.filter((m) =>
      ["JSHeapUsedSize", "ScriptDuration", "LayoutDuration", "TaskDuration", "JSEventListeners"].includes(m.name),
    ),
    rpcAndQueryTimings: rpcTimings,
    bundleTop30: bundles,
    slowestNetwork,
    slowestSupabase,
    topDuplicates,
    totalNetworkRequests: allNetwork.length,
    totalSupabaseRequests: supabaseCalls.length,
  };

  writeFileSync(resolve(outDir, "profile-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${resolve(outDir, "profile-report.json")}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
