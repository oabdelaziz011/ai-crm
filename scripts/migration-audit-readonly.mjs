/**
 * Read-only migration audit: compare supabase/migrations with schema_migrations.
 * Does NOT modify the database.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadProjectEnv(root);

const migrationsDir = join(root, "supabase", "migrations");
const repoFiles = readdirSync(migrationsDir)
  .filter((n) => n.endsWith(".sql"))
  .sort();

function versionKey(filename) {
  const m = filename.match(/^(\d+)/);
  return m ? m[1] : filename.replace(/\.sql$/, "");
}

const repoVersions = repoFiles.map((file) => ({ file, version: versionKey(file) }));

function extractDependencies(sql) {
  const deps = new Set();
  const patterns = [
    /references\s+(?:public\.)?([a-z0-9_]+)/gi,
    /from\s+(?:public\.)?([a-z0-9_]+)/gi,
    /join\s+(?:public\.)?([a-z0-9_]+)/gi,
    /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    /create\s+(?:or\s+replace\s+)?function[\s\S]*?\bon\s+(?:public\.)?([a-z0-9_]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) {
      if (match[1]) deps.add(match[1].toLowerCase());
    }
  }
  return [...deps];
}

function extractCreates(sql) {
  const tables = new Set();
  const types = new Set();
  const functions = new Set();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)) {
    tables.add(m[1].toLowerCase());
  }
  for (const m of sql.matchAll(/create\s+type\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)) {
    types.add(m[1].toLowerCase());
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi)) {
    functions.add(m[1].toLowerCase());
  }
  return { tables: [...tables], types: [...types], functions: [...functions] };
}

const migrationMeta = repoFiles.map((file) => {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const creates = extractCreates(sql);
  return {
    file,
    version: versionKey(file),
    creates,
    deps: extractDependencies(sql),
  };
});

const tableToMigration = new Map();
for (const m of migrationMeta) {
  for (const t of m.creates.tables) {
    if (!tableToMigration.has(t)) tableToMigration.set(t, m.version);
  }
}

const dependencyGraph = migrationMeta.map((m) => ({
  version: m.version,
  file: m.file,
  creates: m.creates,
  dependsOnVersions: [
    ...new Set(
      m.deps
        .map((dep) => tableToMigration.get(dep))
        .filter(Boolean)
        .filter((v) => v !== m.version),
    ),
  ].sort(),
}));

if (!env.DATABASE_URL) {
  const out = { error: "DATABASE_URL not configured", repoCount: repoFiles.length, dependencyGraph };
  writeFileSync(join(root, "_migration_audit_output.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const pg = await import("pg");
const client = new pg.default.Client({ connectionString: env.DATABASE_URL });
await client.connect();

const { rows: appliedRows } = await client.query(
  "select version, name from supabase_migrations.schema_migrations order by version",
);
const applied = appliedRows.map((r) => ({ version: String(r.version), name: r.name ?? null }));

const repoVersionSet = new Set(repoVersions.map((r) => r.version));
const appliedVersionSet = new Set(applied.map((r) => r.version));

const missingInDb = repoVersions.filter((r) => !appliedVersionSet.has(r.version));
const extraInDb = applied.filter((r) => !repoVersionSet.has(r.version));

const byVersion = new Map();
for (const r of repoVersions) {
  const arr = byVersion.get(r.version) ?? [];
  arr.push(r.file);
  byVersion.set(r.version, arr);
}
const duplicatePrefixes = [...byVersion.entries()].filter(([, files]) => files.length > 1);

const numericVersions = repoVersions
  .map((r) => r.version)
  .filter((v) => /^\d+$/.test(v))
  .map(Number)
  .sort((a, b) => a - b);
const repoGaps = [];
for (let i = 1; i < numericVersions.length; i++) {
  const prev = numericVersions[i - 1];
  const cur = numericVersions[i];
  for (let g = prev + 1; g < cur; g++) repoGaps.push(String(g).padStart(3, "0"));
}

async function objectExists(kind, name) {
  if (kind === "table") {
    const q = await client.query("select to_regclass($1) as reg", [`public.${name}`]);
    return q.rows[0]?.reg != null;
  }
  if (kind === "type") {
    const q = await client.query(
      "select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname=$1",
      [name],
    );
    return q.rowCount > 0;
  }
  if (kind === "function") {
    const q = await client.query(
      "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1 limit 1",
      [name],
    );
    return q.rowCount > 0;
  }
  return null;
}

const priorityTables = [
  "support_tickets",
  "platform_company_licenses",
  "platform_feature_flags",
  "platform_plans",
];
const priorityTableChecks = {};
for (const t of priorityTables) {
  priorityTableChecks[t] = {
    exists: await objectExists("table", t),
    introducedInVersion: tableToMigration.get(t) ?? null,
    recordedApplied: appliedVersionSet.has(tableToMigration.get(t) ?? "__none__"),
  };
}

const m214_227 = migrationMeta.filter((m) => /^(21[4-9]|22[0-7])$/.test(m.version));
const m214_227Checks = {};
for (const m of m214_227) {
  const objects = {};
  for (const t of m.creates.tables) objects[`table:${t}`] = await objectExists("table", t);
  for (const t of m.creates.types) objects[`type:${t}`] = await objectExists("type", t);
  m214_227Checks[m.file] = {
    version: m.version,
    recordedApplied: appliedVersionSet.has(m.version),
    objects,
    missingObjects: Object.entries(objects)
      .filter(([, ok]) => !ok)
      .map(([k]) => k),
  };
}

const recordedButMissingObjects = [];
for (const m of migrationMeta) {
  if (!appliedVersionSet.has(m.version)) continue;
  for (const t of m.creates.tables) {
    if (!(await objectExists("table", t))) {
      recordedButMissingObjects.push({ version: m.version, file: m.file, object: `table:${t}` });
    }
  }
}

const objectsWithoutRecordedMigration = [];
for (const m of migrationMeta) {
  for (const t of m.creates.tables) {
    if (await objectExists("table", t)) {
      if (!appliedVersionSet.has(m.version)) {
        objectsWithoutRecordedMigration.push({ version: m.version, file: m.file, object: `table:${t}` });
      }
    }
  }
}

const dependencyFailures = [];
for (const m of migrationMeta) {
  if (!appliedVersionSet.has(m.version)) continue;
  for (const depVersion of m.dependsOnVersions) {
    if (!appliedVersionSet.has(depVersion)) {
      dependencyFailures.push({
        version: m.version,
        file: m.file,
        missingDependencyVersion: depVersion,
      });
    }
  }
}

// Possible renamed migrations: same name column in schema_migrations
const nameMismatches = [];
for (const r of repoVersions) {
  const dbRow = applied.find((a) => a.version === r.version);
  if (dbRow?.name && dbRow.name !== r.file.replace(/\.sql$/, "")) {
    nameMismatches.push({ version: r.version, repoFile: r.file, dbName: dbRow.name });
  }
}

await client.end();

const out = {
  checkedAt: new Date().toISOString(),
  repoCount: repoFiles.length,
  appliedCount: applied.length,
  missingInDb,
  extraInDb,
  duplicatePrefixes,
  repoGaps,
  nameMismatches,
  priorityTableChecks,
  m214_227Checks,
  recordedButMissingObjects,
  objectsWithoutRecordedMigration,
  dependencyFailures,
  dependencyGraph,
  appliedVersions: applied.map((r) => r.version),
};

writeFileSync(join(root, "_migration_audit_output.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  repoCount: out.repoCount,
  appliedCount: out.appliedCount,
  missingCount: out.missingInDb.length,
  extraCount: out.extraInDb.length,
  dependencyFailureCount: out.dependencyFailures.length,
  recordedButMissingCount: out.recordedButMissingObjects.length,
  objectsWithoutRecordCount: out.objectsWithoutRecordedMigration.length,
}, null, 2));
