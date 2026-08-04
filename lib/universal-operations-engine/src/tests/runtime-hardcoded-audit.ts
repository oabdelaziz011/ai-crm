import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type RuntimeHardcodedAuditIssue = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

const RUNTIME_FORBIDDEN_PATTERNS = [
  /DEFAULT_CUSTOMER360_SECTIONS/,
  /DEFAULT_INTELLIGENCE_BLOCKS/,
  /JOURNEY_BY_TEMPLATE/,
  /BUSINESS_CONTEXT_BY_TEMPLATE/,
  /CURRENT_STEP_BY_TEMPLATE/,
  /CLINIC_WORKFLOW/,
  /buildMockCustomer360Workspace/,
  /getMockWorkspaceConfig/,
  /MOCK_WIDGET_DATA/,
  /DEFAULT_WIDGETS/,
] as const;

const ALLOWED_PATH_SEGMENTS = [
  "/config/seed/",
  "/mock/",
  "/tests/",
  ".test.ts",
  "operations-seed-data.ts",
  "default-operations-workspace-config.ts",
  "runtime-hardcoded-audit.ts",
];

function isAllowedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return ALLOWED_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

function scanFile(filePath: string): RuntimeHardcodedAuditIssue[] {
  if (isAllowedPath(filePath)) return [];
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const issues: RuntimeHardcodedAuditIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RUNTIME_FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          file: filePath,
          line: i + 1,
          pattern: pattern.source,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }

  return issues;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Scans runtime packages for forbidden hardcoded operational patterns. Test/dev-only — uses node:fs. */
export function auditRuntimeHardcodedPatterns(rootDirs: string[]): RuntimeHardcodedAuditIssue[] {
  const files = rootDirs.flatMap((dir) => walk(dir));
  return files.flatMap((file) => scanFile(file));
}

export function assertZeroRuntimeHardcodedPatterns(rootDirs: string[]): void {
  const issues = auditRuntimeHardcodedPatterns(rootDirs);
  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.file}:${i.line} [${i.pattern}] ${i.snippet}`).join("\n");
    throw new Error(`Runtime hardcoded pattern audit failed:\n${summary}`);
  }
}
