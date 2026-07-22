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

function extractFailedChecks(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("✗"))
    .map((line) => line.replace(/^✗\s*/, ""));
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
    const checkFailures = extractFailedChecks(`${stdout}\n${stderr}`);
    if (checkFailures.length > 0) {
      for (const detail of checkFailures) {
        failures.push({ step, detail });
      }
    } else {
      failures.push({
        step,
        detail: exitCode === null ? "Process terminated by signal" : `Exit code ${exitCode}`,
      });
    }
    return false;
  }

  return true;
}

console.log("\nVaultOS Production Release Gate — D5.4.1 Enterprise AI Runtime Integration\n");
console.log(
  "Pipeline: typecheck → platform tests → browser build → workflow builder → billing/runtime probes → blocker summary\n",
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
console.log("Enterprise AI Runtime Integration is Production Ready.\n");
process.exit(0);
