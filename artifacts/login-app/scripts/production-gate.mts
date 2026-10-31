/**
 * VaultOS Production Release Gate — Enterprise AI Runtime Integration (D5.4.1)
 * Run: pnpm --dir artifacts/login-app production:gate
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(__dirname, "..");
const projectRoot = resolve(loginAppRoot, "../..");

type GateFailure = {
  step: string;
  detail: string;
};

const failures: GateFailure[] = [];

const SECRET_RE =
  /(?:sb_[a-z0-9_]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|https?:\/\/[a-z0-9-]+\.supabase\.co)/gi;

function redact(text: string): string {
  return text.replace(SECRET_RE, "[redacted]");
}

function extractFailedChecks(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("✗"))
    .map((line) => line.replace(/^✗\s*/, ""));
}

/** Last actionable lines when a child exits without ✗ markers (build/test noise). */
function extractActionableTail(output: string, limit = 12): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/chunk size|circular chunk|dynamically imported|vite:reporter|externalized for browser/i.test(line));
  return lines.slice(-limit).map(redact);
}

function runCommand(
  step: string,
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
) {
  console.log(`\n▶ ${step}\n`);

  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    const combined = `${stdout}\n${stderr}`;
    const checkFailures = extractFailedChecks(combined);
    const signalDetail = exitCode === null ? "Process terminated by signal" : `Exit code ${exitCode}`;
    if (checkFailures.length > 0) {
      for (const detail of checkFailures) {
        failures.push({ step, detail });
      }
    } else {
      failures.push({ step, detail: signalDetail });
    }

    // Print immediately so CI log tails show the real failure, not only later warnings.
    console.error(`\n✗ GATE STEP FAILED: ${step}`);
    console.error(`  reason: ${checkFailures[0] ?? signalDetail}`);
    const tail = extractActionableTail(combined);
    if (tail.length > 0) {
      console.error("  last output:");
      for (const line of tail) console.error(`    ${line}`);
    }
    console.error("");
    return false;
  }

  return true;
}

console.log("\nVaultOS Production Release Gate — Sprint 7.5.0 Go-Live Readiness\n");
console.log(
  "Pipeline: typecheck → platform tests → browser build → workflow builder → billing/runtime probes → Sprint 7 enterprise → blocker summary\n",
);

runCommand("0. Root typecheck", "pnpm", ["typecheck"], projectRoot);

runCommand("1. AI workflow platform tests", "pnpm", ["test:ai-workflow-platform"], projectRoot);

runCommand("2. Automation platform tests (AI integration)", "pnpm", ["test:automation-platform"], projectRoot);

runCommand("3. Production build (browser bundle)", "pnpm", ["build"], loginAppRoot);

runCommand("4. Workflow builder core tests", "npm", ["run", "test:workflow-builder-core"], loginAppRoot, {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "test-publishable-key",
});

runCommand("5. Workflow builder stability tests (canvas sync regressions)", "npm", ["run", "test:workflow-builder-stability"], loginAppRoot, {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "test-publishable-key",
});

runCommand("6. Verify billing health", "npm", ["run", "billing-health-probe"], loginAppRoot);

runCommand(
  "7. Run runtime probe",
  "node",
  [resolve(projectRoot, "scripts/subscription-detail-runtime-probe.mjs")],
  projectRoot,
  { VAULTOS_PRODUCTION_GATE: "1" },
);

runCommand(
  "8. Subscription Detail regression tests",
  "npm",
  ["run", "test:subscription-detail"],
  loginAppRoot,
);

console.log("\n▶ 9. Verify no production blockers remain\n");

if (failures.length > 0) {
  console.log("FAIL\n");
  console.log("Failed checks:");
  for (const failure of failures) {
    console.log(`  - [${failure.step}] ${failure.detail}`);
  }
  console.log("");
  process.exit(1);
}

console.log("PASS\n");
console.log("Sprint 7.5.0 Go-Live Readiness gate passed.\n");
process.exit(0);
