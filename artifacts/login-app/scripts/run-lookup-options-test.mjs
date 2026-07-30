import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(__dirname, "..");
const testFile = resolve(loginAppRoot, "src/lib/lookups/lookup-options-service.integration.test.ts");

const result = spawnSync("npx", ["tsx", "--test", testFile], {
  cwd: loginAppRoot,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "test-publishable-key",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
