#!/usr/bin/env node
/**
 * Static migration dependency audit — no database required.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => {
    const va = a.match(/^(\d+)/)?.[1] ?? a;
    const vb = b.match(/^(\d+)/)?.[1] ?? b;
    const na = /^\d+$/.test(va) ? Number(va) : va;
    const nb = /^\d+$/.test(vb) ? Number(vb) : vb;
    if (typeof na === "number" && typeof nb === "number") return na - nb;
    return String(na).localeCompare(String(nb));
  });

function versionOf(filename) {
  const m = filename.match(/^(\d+)/);
  return m ? m[1] : filename.replace(/\.sql$/, "");
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const BUILTIN_FUNCS = new Set([
  "now", "gen_random_uuid", "coalesce", "nullif", "greatest", "least", "count", "sum", "avg", "min", "max",
  "lower", "upper", "trim", "substring", "length", "exists", "date_trunc", "extract", "round", "abs",
  "jsonb_build_object", "jsonb_agg", "jsonb_object_agg", "jsonb_array_elements", "to_jsonb", "array_agg",
  "row_number", "rank", "dense_rank", "lag", "lead", "unnest", "format", "quote_ident", "quote_literal",
  "pg_catalog", "auth", "extensions", "vault", "storage", "realtime", "graphql", "cron",
]);

const EXTENSION_OBJECTS = new Set(["uuid-ossp", "pgcrypto", "vector", "pg_trgm"]);

function extractCreates(sql) {
  const clean = stripComments(sql);
  const tables = new Set();
  const functions = new Set();
  const types = new Set();
  const views = new Set();

  for (const m of clean.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    tables.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    functions.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/create\s+type\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    types.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    views.add(m[1].toLowerCase());
  }
  return { tables: [...tables], functions: [...functions], types: [...types], views: [...views] };
}

function extractReferences(sql) {
  const clean = stripComments(sql);
  const refs = {
    tables: new Set(),
    functions: new Set(),
    types: new Set(),
    views: new Set(),
  };

  // table references
  for (const m of clean.matchAll(/\b(?:from|join|into|update|table|only)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    refs.tables.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    refs.tables.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/references\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    refs.tables.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/on\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:for|to)\s+/gi)) {
    refs.tables.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/policy\s+[a-z0-9_"']+\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    refs.tables.add(m[1].toLowerCase());
  }

  // function calls public.foo(
  for (const m of clean.matchAll(/public\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
    refs.functions.add(m[1].toLowerCase());
  }

  // types in column definitions
  for (const m of clean.matchAll(/\b([a-z_][a-z0-9_]*)\s+not\s+null/gi)) {
    /* skip */
  }

  return {
    tables: [...refs.tables],
    functions: [...refs.functions],
    types: [...refs.types],
    views: [...refs.views],
  };
}

const created = {
  tables: new Map(),
  functions: new Map(),
  types: new Map(),
  views: new Map(),
};

const migrations = [];
const violations = [];
const dependencyGraph = [];

// version collisions
const byVersion = new Map();
for (const f of files) {
  const v = versionOf(f);
  const list = byVersion.get(v) ?? [];
  list.push(f);
  byVersion.set(v, list);
}
const versionCollisions = [...byVersion.entries()].filter(([, list]) => list.length > 1);

const SQL_KEYWORDS = new Set([
  "select", "where", "and", "or", "not", "null", "true", "false", "case", "when", "then", "else", "end",
  "with", "as", "on", "using", "check", "default", "constraint", "primary", "foreign", "unique", "index",
  "if", "exists", "replace", "returns", "language", "plpgsql", "sql", "stable", "immutable", "security",
  "definer", "invoker", "set", "search_path", "begin", "return", "declare", "raise", "exception",
  "perform", "insert", "update", "delete", "values", "do", "for", "all", "to", "authenticated",
  "service_role", "anon", "grant", "revoke", "execute", "enable", "disable", "row", "level", "policy",
  "publication", "trigger", "function", "table", "view", "type", "schema", "cascade", "restrict",
  "comment", "alter", "create", "drop", "add", "column", "only", "before", "after", "each", "row",
  "new", "old", "tg", "op", "when", "called", "instead", "of", "transition", "tables", "from", "in",
  "is", "distinct", "order", "by", "group", "having", "limit", "offset", "union", "inner", "left",
  "right", "outer", "cross", "join", "lateral", "over", "partition", "window", "filter", "within",
  "without", "time", "zone", "interval", "text", "uuid", "jsonb", "json", "int", "integer", "bigint",
  "boolean", "timestamptz", "bytea", "numeric", "real", "double", "precision", "varchar", "char",
  "serial", "bigserial", "smallint", "date", "array", "any", "some", "all", "like", "ilike", "between",
  "similar", "escape", "cast", "collate", "at", "local", "current", "session", "user", "current_user",
  "localtime", "localtimestamp", "current_timestamp", "current_date", "current_time", "now", "coalesce",
  "nullif", "exists", "inherited", "including", "excluding", "storage", "logged", "unlogged",
  "temporary", "temp", "if", "not", "extends", "including", "nothing", "conflict", "nothing", "excluded",
  "overriding", "system", "value", "identity", "generated", "always", "stored", "virtual", "nulls",
  "first", "last", "asc", "desc", "nulls", "match", "simple", "partial", "full", "copy", "truncate",
  "vacuum", "analyze", "refresh", "materialized", "concurrently", "owned", "none", "action", "initially",
  "deferred", "immediate", "deferrable", "not", "valid", "no", "inherit", "replica", "identity",
  "generated", "stored", "virtual", "statistics", "attach", "detach", "inherit", "of", "nothing",
]);

for (const file of files) {
  const version = versionOf(file);
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const creates = extractCreates(sql);
  const refs = extractReferences(sql);

  const dependsOnVersions = new Set();

  const checkRef = (kind, name, createdMap) => {
    if (BUILTIN_FUNCS.has(name)) return;
    if (SQL_KEYWORDS.has(name)) return;
    if (EXTENSION_OBJECTS.has(name)) return;

    const origin = createdMap.get(name);
    if (!origin) {
      violations.push({
        severity: "error",
        file,
        version,
        kind,
        name,
        issue: "referenced_before_create",
        message: `${kind} public.${name} referenced but not created in prior migrations`,
      });
      return;
    }
    if (origin.version !== version) {
      dependsOnVersions.add(origin.version);
    }
  };

  // Check references BEFORE registering creates in this file (intra-file order is harder; flag function refs in same file after create block separately)
  for (const t of refs.tables) {
    if (creates.tables.includes(t)) continue; // may be same migration
    checkRef("table", t, created.tables);
  }
  for (const fn of refs.functions) {
    if (creates.functions.includes(fn)) continue;
    checkRef("function", fn, created.functions);
  }
  for (const ty of refs.types) {
    if (creates.types.includes(ty)) continue;
    checkRef("type", ty, created.types);
  }
  for (const v of refs.views) {
    if (creates.views.includes(v)) continue;
    checkRef("view", v, created.views);
  }

  // Register creates
  for (const t of creates.tables) {
    if (!created.tables.has(t)) created.tables.set(t, { version, file });
  }
  for (const fn of creates.functions) {
    if (!created.functions.has(fn)) created.functions.set(fn, { version, file });
  }
  for (const ty of creates.types) {
    if (!created.types.has(ty)) created.types.set(ty, { version, file });
  }
  for (const v of creates.views) {
    if (!created.views.has(v)) created.views.set(v, { version, file });
  }

  migrations.push({ file, version, creates, refs, dependsOnVersions: [...dependsOnVersions].sort() });
  dependencyGraph.push({
    version,
    file,
    creates,
    dependsOnVersions: [...dependsOnVersions].sort(),
  });
}

// Known collision: prod 214 vs repo 214/226
const versionCollision214 = {
  version: "214",
  repoFile214: "214_ai_employee_ticket_management_sprint6_9_1.sql",
  repoFile226: "226_omnichannel_realtime_publication.sql",
  issue: "Production/dev may have omnichannel_realtime_publication recorded as version 214 while repo assigns tickets to 214 and realtime to 226",
};

// Dedupe violations and group by file
const violationsByFile = new Map();
for (const v of violations) {
  const key = `${v.file}|${v.kind}|${v.name}`;
  if (!violationsByFile.has(key)) violationsByFile.set(key, v);
}
const uniqueViolations = [...violationsByFile.values()].sort((a, b) => {
  const na = Number(a.version) || a.version;
  const nb = Number(b.version) || b.version;
  if (typeof na === "number" && typeof nb === "number") return na - nb;
  return String(a.version).localeCompare(String(b.version));
});

// Migrations that fail on empty DB = any migration with ordering violations where referenced object is created later
const laterCreates = uniqueViolations.filter((v) => {
  const origin = v.kind === "table" ? created.tables.get(v.name)
    : v.kind === "function" ? created.functions.get(v.name)
    : v.kind === "type" ? created.types.get(v.name)
    : created.views.get(v.name);
  if (!origin) return true;
  const ov = Number(origin.version) || origin.version;
  const vv = Number(v.version) || v.version;
  return ov > vv || (typeof ov === "number" && typeof vv === "number" && ov > vv);
});

const blockingMigrations = [...new Set(laterCreates.map((v) => v.file))];

const report = {
  auditedAt: new Date().toISOString(),
  migrationCount: files.length,
  versionCollisions,
  versionCollision214,
  violationCount: uniqueViolations.length,
  violations: uniqueViolations,
  blockingMigrationsOnEmptyDb: blockingMigrations.sort(),
  firstBlockingMigration: blockingMigrations.sort()[0] ?? null,
  dependencyGraph,
};

writeFileSync(join(root, "_migration_dependency_audit.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  migrationCount: report.migrationCount,
  versionCollisions: versionCollisions.length,
  violationCount: uniqueViolations.length,
  blockingCount: blockingMigrations.length,
  firstBlocking: report.firstBlockingMigration,
  topViolations: uniqueViolations.slice(0, 30).map((v) => ({
    version: v.version,
    file: v.file,
    kind: v.kind,
    name: v.name,
    createdIn: (v.kind === "function" ? created.functions : created.tables).get(v.name)?.file,
  })),
}, null, 2));
