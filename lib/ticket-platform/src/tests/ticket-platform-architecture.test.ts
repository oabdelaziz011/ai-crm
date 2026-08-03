import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const SCAN_ROOTS = [
  path.join(repoRoot, "artifacts/login-app/src"),
  path.join(repoRoot, "artifacts/api-server/src"),
  path.join(repoRoot, "lib/customer-360/src"),
  path.join(repoRoot, "lib/dashboard-engine/src"),
  path.join(repoRoot, "lib/ai-tool-router/src"),
];

const ALLOWED_REPOSITORY_IMPORT = path.join(repoRoot, "lib/ticket-platform/src");

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules") continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("ticket platform architecture boundaries", () => {
  it("does not expose direct repository imports outside ticket-platform package", () => {
    const violations: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        if (file.startsWith(ALLOWED_REPOSITORY_IMPORT)) continue;
        const content = readFileSync(file, "utf8");
        if (content.includes("@workspace/ticket-platform/repositories")) {
          violations.push(path.relative(repoRoot, file));
        }
        if (content.includes("createSupabaseTicketRepository")) {
          violations.push(path.relative(repoRoot, file));
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
