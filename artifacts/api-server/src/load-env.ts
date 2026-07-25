import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

function findMonorepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

const repoRoot = findMonorepoRoot(dirname(fileURLToPath(import.meta.url)));

for (const relativePath of [".env", "artifacts/login-app/.env.local"]) {
  const path = resolve(repoRoot, relativePath);
  if (existsSync(path)) {
    loadDotenv({ path, override: false });
  }
}
