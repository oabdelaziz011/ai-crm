#!/usr/bin/env node
/**
 * Classify pending Production migrations. Read-only. Does not connect to a database
 * and does not mark any migration applied.
 *
 * The pending version list is the read-only Production result from 2026-10-31:
 * 361 is missing, 362–372 are applied, 373–440 are not applied.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDir = join(repoRoot, "supabase", "migrations");

const PENDING = [
  "361",
  ...Array.from({ length: 440 - 373 + 1 }, (_, index) => String(373 + index)),
  "441",
];

const PATTERNS = [
  { id: "drop-table", re: /\bdrop\s+table\b/i, severity: "destructive" },
  { id: "drop-column", re: /\bdrop\s+column\b/i, severity: "destructive" },
  { id: "truncate", re: /\btruncate\s+(?:table|only)\b/i, severity: "destructive" },
  { id: "delete", re: /\bdelete\s+from\b/i, severity: "data-write" },
  { id: "update", re: /\bupdate\s+(?:only\s+)?(?:public\.)?[a-z_][a-z0-9_]*\s+set\b/i, severity: "data-write" },
  { id: "alter-type", re: /\balter\s+column\b[\s\S]{0,80}\btype\b/i, severity: "rewrite" },
  { id: "rename", re: /\brename\s+(?:to|column|table)\b/i, severity: "rewrite" },
  { id: "grant-all", re: /\bgrant\s+all\b/i, severity: "privilege" },
];

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function filesByVersion() {
  const map = new Map();
  for (const name of readdirSync(migrationsDir)) {
    const match = name.match(/^(\d+)_.*\.sql$/);
    if (match) map.set(match[1], name);
  }
  return map;
}

function lineFindings(sql) {
  const findings = [];
  for (const line of sql.split(/\n/)) {
    if (/alter\s+publication\b/i.test(line) && /\bdrop\s+table\b/i.test(line)) continue;
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line) && !findings.some((finding) => finding.id === pattern.id)) {
        findings.push({ id: pattern.id, severity: pattern.severity });
      }
    }
  }
  return findings;
}

export function classifyPendingMigrations(root = repoRoot) {
  const dir = join(root, "supabase", "migrations");
  const available = filesByVersion();
  const rows = [];
  for (const version of PENDING) {
    const filename = [...readdirSync(dir)].find((name) => name.startsWith(`${version}_`) && name.endsWith(".sql"));
    if (!filename) {
      rows.push({ version, filename: null, findings: [{ id: "missing-file", severity: "blocker" }] });
      continue;
    }
    const sql = stripComments(readFileSync(join(dir, filename), "utf8"));
    rows.push({ version, filename, findings: lineFindings(sql) });
  }
  return { pendingCount: PENDING.length, available: available.size, rows };
}

function render(report) {
  const lines = [
    "# Pending Production migrations",
    "",
    `Scanned ${report.pendingCount} files. Local migration files seen: ${report.available}.`,
    "This list is the Production gap recorded on 2026-10-31 (latest applied version 372, hole at 361), plus local migration 441, which is not on Production.",
    "Re-read `supabase_migrations.schema_migrations` before applying. Do not mark versions by hand and do not skip any file.",
    "",
    "## Apply order",
    "",
    "361, then 373 through 441. Migration 441 is the privilege repair and must stay last.",
    "",
    "## Findings",
    "",
    "| Version | File | Findings |",
    "|---|---|---|",
  ];
  for (const row of report.rows) {
    const findings = row.findings.length
      ? row.findings.map((finding) => `${finding.severity}:${finding.id}`).join(", ")
      : "none"
    ;
    lines.push(`| ${row.version} | ${row.filename ?? "MISSING"} | ${findings} |`);
  }
  lines.push(
    "",
    "## Rehearsal",
    "",
    "1. Take a Production backup and record its id. Do not restore it over Production.",
    "2. Restore that backup into a disposable database that is not the Production project.",
    "3. Run `node scripts/rehearse-pending-migrations.mjs`. It refuses Production URLs and `--linked`.",
    "4. On that disposable database only, apply the pending files in the order above with the Supabase CLI.",
    "5. Compare `schema_migrations` to the filenames. Then run the privilege checks in `scripts/verify-least-privilege.mjs` against that disposable database, still not Production.",
    "",
  );
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = classifyPendingMigrations();
  const missing = report.rows.filter((row) => row.findings.some((finding) => finding.id === "missing-file"));
  if (missing.length) {
    console.error(`Missing migration files: ${missing.map((row) => row.version).join(", ")}`);
    process.exit(1);
  }
  const markdown = render(report);
  if (process.argv.includes("--write")) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(repoRoot, "docs/operations/pending-migration-risks.md"), markdown, "utf8");
    console.error(`Wrote docs/operations/pending-migration-risks.md (${report.pendingCount} files).`);
  } else {
    process.stdout.write(markdown);
  }
}
