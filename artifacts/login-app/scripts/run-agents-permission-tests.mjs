import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(__dirname, "..");

const testFiles = [
  "src/lib/platform-ai/agents-access.test.ts",
  "src/lib/platform-ai/agent-ui-gating.test.ts",
  "scripts/agents-ui-permission.integration.test.mts",
  "../../scripts/agents-rls-feature-flag.test.mts",
];

let exitCode = 0;

for (const relativePath of testFiles) {
  const absolutePath = resolve(loginAppRoot, relativePath);
  const command = relativePath.endsWith(".mts")
    ? ["tsx", "--tsconfig", "tsconfig.test.json", absolutePath]
    : ["tsx", "--test", absolutePath];

  const result = spawnSync("npx", command, {
    cwd: loginAppRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if ((result.status ?? 1) !== 0) {
    exitCode = result.status ?? 1;
    break;
  }
}

process.exit(exitCode);
