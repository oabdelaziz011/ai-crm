/**
 * Sustained local load of the production API process.
 * Loopback database only. Does not record or apply migration 443.
 * Drops the temporary api_runtime schema when finished.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const host = new URL(databaseUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error("Load test refuses a non-loopback database.");
}

const require = createRequire(resolve(root, "lib/db/package.json"));
const pg = require("pg");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const port = 3196;
const paced = process.argv.includes("--paced");
const durationMs = paced ? 60_000 : 75_000;
const concurrency = paced ? 4 : 20;

const migrationApplied = await pool.query(
  "select count(*)::int as n from supabase_migrations.schema_migrations where version like '%443%'",
);
if (migrationApplied.rows[0].n !== 0) {
  throw new Error("Refusing to run because migration 443 is already recorded locally.");
}

const migrationSql = readFileSync(
  resolve(root, "supabase/migrations/443_api_runtime_express_sessions.sql"),
  "utf8",
).replace(/^--.*$/gm, "");
await pool.query(migrationSql);

const childEnv = {
  ...process.env,
  VALUEOR_ENV: "local",
  NODE_ENV: "production",
  PORT: String(port),
  DATABASE_URL: databaseUrl,
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  SESSION_SECRET: "synthetic-session-value",
  INTERNAL_API_KEY: "synthetic-internal-value",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
  EMBEDDING_WORKER_ENABLED: "false",
  BILLING_LIFECYCLE_WORKER_ENABLED: "false",
  BILLING_LIFECYCLE_WORKER_CONFIRMED: "false",
  SALES_FOLLOW_UP_WORKER_ENABLED: "false",
  SALES_FOLLOW_UP_WORKER_ALLOW_SEND: "false",
  EMAIL_POLL_WORKER_ENABLED: "true",
  EMAIL_POLL_WORKER_EXECUTE_AI: "false",
  EMAIL_POLL_WORKER_INTERVAL_MS: "15000",
  SESSION_IDLE_TIMEOUT_WORKER_ENABLED: "true",
  SESSION_IDLE_TIMEOUT_WORKER_INTERVAL_MS: "15000",
  WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "false",
  WEBHOOK_REQUIRE_SIGNATURE: "true",
  WEBHOOK_EXECUTE_AI: "false",
  VALUEOR_MEMORY_PROBE: "1",
};

let output = "";
await pool.query(migrationSql);
const child = spawn(process.execPath, [resolve(root, "artifacts/api-server/dist/main.mjs")], {
  cwd: root,
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (response.status === 200) return;
    } catch {
      // still starting
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
  }
  throw new Error("API did not become healthy.");
}

const routes = [
  { name: "health", weight: 12, expected: new Set([200]), run: () => fetch(`http://127.0.0.1:${port}/api/healthz`) },
  {
    name: "login",
    weight: 2,
    expected: new Set([400, 401]),
    run: () =>
      fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
        body: JSON.stringify({ username: "load-probe", password: "not-a-real-password" }),
      }),
  },
  {
    name: "webhook-verify",
    weight: 2,
    expected: new Set([403]),
    run: () =>
      fetch(
        `http://127.0.0.1:${port}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=load-test-not-a-token&hub.challenge=ping`,
      ),
  },
  {
    name: "sms-webhook",
    weight: 1,
    expected: new Set([404]),
    run: () =>
      fetch(`http://127.0.0.1:${port}/api/webhooks/sms`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "To=%2B10000000000&Body=load-test",
      }),
  },
  {
    name: "customer-import",
    weight: 1,
    expected: new Set([401]),
    run: () =>
      fetch(`http://127.0.0.1:${port}/api/customers/import/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: "probe.csv", fileBase64: Buffer.from("name,email\nA,a@example.com\n").toString("base64") }),
      }),
  },
  {
    name: "oversized",
    weight: 1,
    expected: new Set([413]),
    run: () =>
      fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "x".repeat(1_200_000), password: "x" }),
      }),
  },
];

const bag = [];
for (const route of routes) {
  for (let i = 0; i < route.weight; i += 1) bag.push(route);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const stats = new Map(routes.map((route) => [route.name, { count: 0, errors: 0, statuses: {}, times: [] }]));

async function oneRequest() {
  const route = bag[Math.floor(Math.random() * bag.length)];
  const started = performance.now();
  let status = 0;
  try {
    const response = await route.run();
    status = response.status;
    await response.arrayBuffer();
  } catch {
    status = 0;
  }
  const elapsed = performance.now() - started;
  const bucket = stats.get(route.name);
  bucket.count += 1;
  bucket.times.push(elapsed);
  bucket.statuses[status] = (bucket.statuses[status] ?? 0) + 1;
  if (!route.expected.has(status)) bucket.errors += 1;
}

try {
  await waitForHealth();
  const deadline = Date.now() + durationMs;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < deadline) {
        await oneRequest();
        if (paced) await new Promise((resolveSleep) => setTimeout(resolveSleep, 1000));
      }
    }),
  );
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 2500));
} finally {
  if (child) child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 8000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
  await pool.query("drop schema if exists api_runtime cascade");
  const stillApplied = await pool.query(
    "select count(*)::int as n from supabase_migrations.schema_migrations where version like '%443%'",
  );
  const schemaLeft = await pool.query(
    "select count(*)::int as n from pg_namespace where nspname = 'api_runtime'",
  );
  await pool.end();

  const samples = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("memory.sample")) continue;
    try {
      samples.push(JSON.parse(line));
    } catch {
      // ignore
    }
  }
  const rss = samples.map((sample) => Number(sample.rss ?? 0));
  const heap = samples.map((sample) => Number(sample.heapUsed ?? 0));
  const toMiB = (bytes) => Math.round((bytes / 1048576) * 10) / 10;
  const report = {
    durationMs,
    concurrency,
    paced,
    requests: Object.fromEntries(
      [...stats.entries()].map(([name, bucket]) => {
        const sorted = [...bucket.times].sort((a, b) => a - b);
        return [
          name,
          {
            count: bucket.count,
            errors: bucket.errors,
            statuses: bucket.statuses,
            p50ms: Math.round(percentile(sorted, 50) ?? 0),
            p95ms: Math.round(percentile(sorted, 95) ?? 0),
            maxMs: Math.round(sorted.at(-1) ?? 0),
          },
        ];
      }),
    ),
    memory: {
      samples: samples.length,
      rssStartMiB: toMiB(rss[0] ?? 0),
      rssEndMiB: toMiB(rss.at(-1) ?? 0),
      rssPeakMiB: toMiB(Math.max(0, ...rss)),
      heapStartMiB: toMiB(heap[0] ?? 0),
      heapEndMiB: toMiB(heap.at(-1) ?? 0),
      heapPeakMiB: toMiB(Math.max(0, ...heap)),
    },
    memoryStoreWarning: output.includes("MemoryStore"),
    emailPollStarted: output.includes("email.poll.worker.start"),
    sessionIdleStarted: output.includes("Session idle timeout worker started"),
    emailPollTicks: (output.match(/email\.poll\.worker\.error|email\.poll\.worker/g) ?? []).length,
    sessionIdleTicks: (output.match(/Session idle timeout tick failed|Session idle timeout worker started/g) ?? []).length,
    shutdownLogged: output.includes("Shutting down"),
    migration443Recorded: stillApplied.rows[0].n,
    apiRuntimeSchemaLeft: schemaLeft.rows[0].n,
  };
  console.log(JSON.stringify(report, null, 2));
}
