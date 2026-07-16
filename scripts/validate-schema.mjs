#!/usr/bin/env node
/**
 * Complete project validation: React Supabase queries vs migration schema.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const REACT_SRC = path.join(ROOT, "artifacts", "login-app", "src");

/** Primary modules requested for validation */
const TARGET_MODULES = [
  "context/auth-context.tsx",
  "hooks/use-rbac.ts",
  "hooks/use-companies.ts",
  "hooks/use-users-management.ts",
  "hooks/use-notifications.ts",
  "hooks/use-audit-logs.ts",
  "pages/dashboard.tsx",
  "pages/companies.tsx",
  "pages/subscriptions.tsx",
  "pages/users.tsx",
  "components/dashboard/notifications-bell.tsx",
];

/** Transitive hooks used by dashboard and related pages */
const TRANSITIVE_MODULES = [
  "hooks/use-plans.ts",
  "hooks/use-customers.ts",
  "hooks/use-bookings.ts",
  "hooks/use-invoices.ts",
  "hooks/use-profiles.ts",
  "pages/audit-logs.tsx",
  "components/dashboard/company-modal.tsx",
];

const ALL_MODULES = [...new Set([...TARGET_MODULES, ...TRANSITIVE_MODULES])];

/** Expected FK joins used by PostgREST embed syntax */
const EXPECTED_FKS = [
  { from: "companies", column: "plan_id", to: "plans", toColumn: "id" },
  { from: "bookings", column: "customer_id", to: "customers", toColumn: "id" },
  { from: "invoices", column: "customer_id", to: "customers", toColumn: "id" },
  { from: "profiles", column: "company_id", to: "companies", toColumn: "id" },
];

function readFile(relativePath) {
  return fs.readFileSync(path.join(REACT_SRC, relativePath), "utf8");
}

function parseMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const schema = {
    tables: new Map(),
    fks: [],
  };

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    const createTableRe =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRe.exec(sql)) !== null) {
      const table = match[1];
      const body = match[2];
      if (!schema.tables.has(table)) schema.tables.set(table, new Set());
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("--")) continue;
        const colMatch = trimmed.match(/^(\w+)\s+/);
        if (
          colMatch &&
          !["constraint", "check", "unique", "primary", "foreign"].includes(colMatch[1].toLowerCase())
        ) {
          schema.tables.get(table).add(colMatch[1]);
        }
        const inlineFk = trimmed.match(/^(\w+)\s+uuid\s+references\s+public\.(\w+)\((\w+)\)/i);
        if (inlineFk) {
          schema.fks.push({
            from: table,
            column: inlineFk[1],
            to: inlineFk[2],
            toColumn: inlineFk[3],
          });
        }
      }
    }

    const addColRe =
      /alter\s+table\s+public\.(\w+)\s+add\s+column\s+if\s+not\s+exists\s+(\w+)\s+uuid\s+references\s+public\.(\w+)\((\w+)\)/gi;
    while ((match = addColRe.exec(sql)) !== null) {
      if (!schema.tables.has(match[1])) schema.tables.set(match[1], new Set());
      schema.tables.get(match[1]).add(match[2]);
      schema.fks.push({
        from: match[1],
        column: match[2],
        to: match[3],
        toColumn: match[4],
      });
    }

    const addColSimpleRe = /alter\s+table\s+public\.(\w+)\s+add\s+column\s+if\s+not\s+exists\s+(\w+)/gi;
    while ((match = addColSimpleRe.exec(sql)) !== null) {
      if (!schema.tables.has(match[1])) schema.tables.set(match[1], new Set());
      schema.tables.get(match[1]).add(match[2]);
    }

    const fkConstraintRe =
      /alter\s+table\s+public\.(\w+)\s+add\s+constraint\s+\w+\s+foreign\s+key\s+\((\w+)\)\s+references\s+public\.(\w+)\((\w+)\)/gi;
    while ((match = fkConstraintRe.exec(sql)) !== null) {
      schema.fks.push({
        from: match[1],
        column: match[2],
        to: match[3],
        toColumn: match[4],
      });
    }
  }

  return { files, schema };
}

function resolveSelectColumns(raw, content) {
  const trimmed = raw.trim();
  if (trimmed === "*" || trimmed === '"*"' || trimmed === "'*'") return ["*"];

  // Resolve local const string variables like profileColumns
  const varMatch = trimmed.match(/^([A-Za-z_]\w*)$/);
  if (varMatch) {
    const constRe = new RegExp(
      `(?:const|let|var)\\s+${varMatch[1]}\\s*=\\s*["']([^"']+)["']`,
    );
    const constMatch = content.match(constRe);
    if (constMatch) return constMatch[1].split(",").map((c) => c.trim());
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).split(",").map((c) => c.trim());
  }

  return trimmed
    .replace(/\w+:\w+\([^)]*\)/g, "")
    .split(",")
    .map((c) => c.trim().replace(/["']/g, ""))
    .filter(Boolean);
}

function extractQueriesFromFile(relativePath, content) {
  const queries = [];
  const fromRe = /\.from\(\s*["'](\w+)["']\s*\)/g;
  let fromMatch;

  while ((fromMatch = fromRe.exec(content)) !== null) {
    const table = fromMatch[1];
    const afterFrom = content.slice(fromMatch.index + fromMatch[0].length);
    const nextFromIdx = afterFrom.search(/\.from\(\s*["']\w+["']\s*\)/);
    const chain = nextFromIdx === -1 ? afterFrom : afterFrom.slice(0, nextFromIdx);

    const selectMatch = chain.match(/\.select\(\s*([^)]+?)\s*(?:,\s*\{[\s\S]*?\})?\s*\)/);
    if (selectMatch) {
      const raw = selectMatch[1].trim();
      const columns = resolveSelectColumns(raw, content);
      queries.push({ file: relativePath, table, op: "select", columns });

      const embedRe = /(\w+):(\w+)\(([^)]*)\)/g;
      let embedMatch;
      while ((embedMatch = embedRe.exec(raw)) !== null) {
        const embedTable = embedMatch[2];
        const embedCols =
          embedMatch[3] === "*"
            ? ["*"]
            : embedMatch[3].split(",").map((c) => c.trim());
        queries.push({
          file: relativePath,
          table: embedTable,
          op: "select (embed)",
          columns: embedCols,
          via: `${table}.${embedMatch[1]}`,
        });
      }
    }

    const insertMatch = chain.match(/\.insert\(\s*(\{[\s\S]*?\}|[^)]+?)\s*\)/);
    if (insertMatch) {
      const body = insertMatch[1].trim();
      const keys =
        body.startsWith("{")
          ? [...body.matchAll(/(\w+)\s*:/g)].map((m) => m[1])
          : body.includes("...")
            ? ["...spread"]
            : [];
      queries.push({ file: relativePath, table, op: "insert", columns: keys });
    }

    const updateMatch = chain.match(/\.update\(\s*(\{[\s\S]*?\}|[^)]+?)\s*\)/);
    if (updateMatch) {
      const body = updateMatch[1].trim();
      const keys = body.startsWith("{")
        ? [...body.matchAll(/(\w+)\s*:/g)].map((m) => m[1])
        : body.includes("...")
          ? ["...spread"]
          : [];
      queries.push({ file: relativePath, table, op: "update", columns: keys });
    }

    if (/\.delete\(\)/.test(chain)) {
      queries.push({ file: relativePath, table, op: "delete", columns: [] });
    }
  }

  return queries;
}

function hasFk(schema, { from, column, to, toColumn }) {
  return schema.fks.some(
    (fk) => fk.from === from && fk.column === column && fk.to === to && fk.toColumn === toColumn,
  );
}

function validateModule(relativePath, schema) {
  const content = readFile(relativePath);
  const queries = extractQueriesFromFile(relativePath, content);
  const issues = [];

  for (const q of queries) {
    if (!schema.tables.has(q.table)) {
      issues.push({ ...q, type: "missing_table" });
      continue;
    }
    if (q.columns.includes("*") || q.columns.length === 0 || q.columns.includes("...spread")) continue;
    const cols = schema.tables.get(q.table);
    for (const col of q.columns) {
      if (!cols.has(col)) {
        issues.push({ ...q, type: "missing_column", column: col });
      }
    }
  }

  return { relativePath, queries, issues };
}

function validateAll() {
  const { files, schema } = parseMigrations();
  const moduleResults = [];
  const allIssues = [];

  for (const modulePath of ALL_MODULES) {
    const result = validateModule(modulePath, schema);
    moduleResults.push(result);
    allIssues.push(...result.issues);
  }

  const fkIssues = [];
  for (const fk of EXPECTED_FKS) {
    if (!hasFk(schema, fk)) {
      fkIssues.push({
        type: "missing_fk",
        ...fk,
      });
    }
  }

  return { files, schema, moduleResults, allIssues, fkIssues };
}

function printReport(result) {
  console.log("=== COMPLETE PROJECT VALIDATION ===\n");

  console.log("Modules checked:");
  for (const mod of ALL_MODULES) {
    console.log(`  - ${mod}`);
  }
  console.log();

  console.log("--- Per-module query audit ---");
  for (const { relativePath, queries, issues } of result.moduleResults) {
    const status = issues.length === 0 ? "PASS" : "FAIL";
    console.log(`\n[${status}] ${relativePath} (${queries.length} queries)`);
    for (const q of queries) {
      const cols = q.columns.length ? q.columns.join(", ") : "(none)";
      console.log(`    ${q.op.padEnd(14)} ${q.table.padEnd(18)} ${cols}${q.via ? ` via ${q.via}` : ""}`);
    }
    for (const issue of issues) {
      if (issue.type === "missing_table") {
        console.log(`    !! missing table: ${issue.table} (${issue.op})`);
      } else {
        console.log(`    !! missing column: ${issue.table}.${issue.column} (${issue.op})`);
      }
    }
  }

  console.log("\n--- FK join validation ---");
  if (result.fkIssues.length === 0) {
    console.log("  PASS — all PostgREST embed FKs exist");
  } else {
    for (const fk of result.fkIssues) {
      console.log(`  FAIL — ${fk.from}.${fk.column} -> ${fk.to}.${fk.toColumn}`);
    }
  }

  console.log("\n--- Summary ---");
  const totalQueries = result.moduleResults.reduce((n, m) => n + m.queries.length, 0);
  const totalIssues = result.allIssues.length + result.fkIssues.length;
  console.log(`  Migrations: ${result.files.length}`);
  console.log(`  Tables: ${result.schema.tables.size}`);
  console.log(`  Queries validated: ${totalQueries}`);
  console.log(`  Issues: ${totalIssues}`);

  if (totalIssues === 0) {
    console.log("\n  RESULT: 100% ALIGNED — React app matches database schema.");
  } else {
    console.log("\n  RESULT: MISALIGNMENT DETECTED — fix migrations before deploy.");
  }

  return totalIssues;
}

const issueCount = printReport(validateAll());
process.exit(issueCount > 0 ? 1 : 0);
