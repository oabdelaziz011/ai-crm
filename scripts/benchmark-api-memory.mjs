/**
 * Local-only API memory probe. Refuses any non-loopback database.
 * Does not read Production credentials and does not apply migrations.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const host = new URL(databaseUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error("Memory probe refuses a non-loopback database.");
}

const require = createRequire(resolve(root, "lib/db/package.json"));
const pg = require("pg");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

await pool.query("create schema if not exists api_runtime");
await pool.query(`
  create table if not exists api_runtime.express_sessions (
    sid text primary key,
    sess jsonb not null,
    expire timestamptz not null
  )
`);
await pool.query(`
  create index if not exists express_sessions_expire_idx
  on api_runtime.express_sessions (expire)
`);

const childEnv = {
  ...process.env,
  VALUEOR_ENV: "local",
  NODE_ENV: "production",
  PORT: "3197",
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
  SESSION_IDLE_TIMEOUT_WORKER_ENABLED: "true",
  WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "false",
  VALUEOR_MEMORY_PROBE: "1",
};

function start(sourceMaps) {
  const args = sourceMaps
    ? ["--enable-source-maps", "artifacts/api-server/dist/main.mjs"]
    : ["artifacts/api-server/dist/main.mjs"];
  return spawn(process.execPath, args, {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseSamples(text) {
  const samples = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("memory.sample")) continue;
    try {
      const record = JSON.parse(line);
      samples.push(record);
    } catch {
      // ignore non-json log lines
    }
  }
  return samples;
}

async function waitForHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (response.status === 200) return;
    } catch {
      // server still starting
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
  }
  throw new Error("API did not become healthy.");
}

async function workload(port) {
  const health = await Promise.all(
    Array.from({ length: 40 }, () => fetch(`http://127.0.0.1:${port}/api/healthz`).then((response) => response.status)),
  );
  const logins = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
        body: JSON.stringify({ username: `memory-probe-${index}`, password: "not-a-real-password" }),
      }).then((response) => response.status),
    ),
  );
  const oversized = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "x".repeat(1_200_000), password: "x" }),
  }).then((response) => response.status);
  const file = "y".repeat(6 * 1024 * 1024);
  const imported = await fetch(`http://127.0.0.1:${port}/api/customers/import/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "probe.csv", fileBase64: file }),
  }).then((response) => response.status);
  return {
    health200: health.filter((status) => status === 200).length,
    loginStatuses: [...new Set(logins)].sort(),
    oversized,
    imported,
  };
}

function summarize(label, samples, os, statuses) {
  const peak = (key) => Math.max(...samples.map((sample) => Number(sample[key] ?? 0)));
  const last = samples.at(-1) ?? {};
  return {
    label,
    samples: samples.length,
    rssMiB: Math.round((Number(last.rss ?? 0) / 1048576) * 10) / 10,
    peakRssMiB: Math.round((peak("rss") / 1048576) * 10) / 10,
    heapUsedMiB: Math.round((Number(last.heapUsed ?? 0) / 1048576) * 10) / 10,
    peakHeapUsedMiB: Math.round((peak("heapUsed") / 1048576) * 10) / 10,
    heapTotalMiB: Math.round((Number(last.heapTotal ?? 0) / 1048576) * 10) / 10,
    externalMiB: Math.round((Number(last.external ?? 0) / 1048576) * 10) / 10,
    workingSetMiB: os.workingSetMiB,
    privateMiB: os.privateMiB,
    ...statuses,
  };
}

async function osMemory(pid) {
  if (process.platform !== "win32") return { workingSetMiB: null, privateMiB: null };
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout } = await run(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${pid} | Select-Object WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress)`,
    ],
    { windowsHide: true },
  );
  const parsed = JSON.parse(stdout);
  return {
    workingSetMiB: Math.round((parsed.WorkingSet64 / 1048576) * 10) / 10,
    privateMiB: Math.round((parsed.PrivateMemorySize64 / 1048576) * 10) / 10,
  };
}

async function measure(label, sourceMaps) {
  let output = "";
  const child = start(sourceMaps);
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    await waitForHealth(3197);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 2500));
    const statuses = await workload(3197);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 2500));
    const os = await osMemory(child.pid);
    const samples = parseSamples(output);
    return { ...summarize(label, samples, os, statuses), memoryStoreWarning: output.includes("MemoryStore") };
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolveExit();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
}

try {
  const withoutMaps = await measure("without-source-maps", false);
  const withMaps = await measure("with-source-maps", true);
  console.log(JSON.stringify({ withoutMaps, withMaps }, null, 2));
} finally {
  await pool.query("drop schema if exists api_runtime cascade");
  await pool.end();
}
