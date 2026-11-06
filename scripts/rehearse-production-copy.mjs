#!/usr/bin/env node
/**
 * Prepare a disposable local copy for migration rehearsal.
 * Reads Production only to copy it. Applies migrations only to 127.0.0.1.
 * Refuses --linked and refuses to migrate a Production URL.
 *
 *   node scripts/rehearse-production-copy.mjs inspect
 *   node scripts/rehearse-production-copy.mjs dump
 *   node scripts/rehearse-production-copy.mjs restore
 *   node scripts/rehearse-production-copy.mjs migrate
 */
import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dumpPath = resolve(tmpdir(), "valueor-production-copy.dump");
const localHost = "127.0.0.1";
const localPort = "54322";
const localDb = "valueor_rehearsal";
const localUrl = `postgresql://postgres:postgres@${localHost}:${localPort}/${localDb}`;
const maintenanceUrl = `postgresql://postgres:postgres@${localHost}:${localPort}/postgres`;

if (process.argv.includes("--linked")) {
  console.error("Refusing --linked.");
  process.exit(2);
}
if (isProductionDatabaseUrl(localUrl)) {
  console.error("Refusing to treat the rehearsal URL as Production.");
  process.exit(2);
}

function quoteIdent(value) {
  if (!/^[a-z_][a-z0-9_-]*$/.test(value)) {
    throw new Error("Refusing an unexpected SQL identifier.");
  }
  return `"${value}"`;
}

async function installProductionExtensions(rehearsal) {
  const env = productionEnv();
  const remote = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 20000,
  });
  await remote.connect();
  const listed = await remote.query(
    `select e.extname, n.nspname
     from pg_extension e
     join pg_namespace n on n.oid = e.extnamespace
     where e.extname <> 'plpgsql'
     order by 1`,
  );
  await remote.end();
  const local = new pg.Client({ connectionString: maintenanceUrl });
  await local.connect();
  const available = await local.query("select name from pg_available_extensions");
  await local.end();
  const names = new Set(available.rows.map((row) => row.name));
  const unavailable = [];
  for (const row of listed.rows) {
    if (!names.has(row.extname)) {
      unavailable.push(row.extname);
      continue;
    }
    const schema = quoteIdent(row.nspname);
    const extension = quoteIdent(row.extname);
    await rehearsal.query(`create schema if not exists ${schema}`);
    await rehearsal.query(`create extension if not exists ${extension} with schema ${schema}`);
  }
  console.log(JSON.stringify({
    extensions_installed: listed.rows.length - unavailable.length,
    extensions_unavailable_locally: unavailable,
  }));
}

function productionEnv() {
  const env = loadProjectEnv(root, {
    valueorEnv: "production",
    hydrateProcessEnv: false,
    mergeProcessEnv: false,
  });
  if (!isProductionDatabaseUrl(env.DATABASE_URL)) {
    throw new Error("Production DATABASE_URL is not a hosted database.");
  }
  return env;
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

async function inspect() {
  const env = productionEnv();
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 20000,
  });
  await client.connect();
  const result = await client.query(
    `select pg_database_size(current_database())::bigint as bytes,
            (select max(version) from supabase_migrations.schema_migrations) as latest,
            (select count(*)::int from supabase_migrations.schema_migrations) as applied`,
  );
  await client.end();
  const row = result.rows[0];
  console.log(JSON.stringify({
    bytes: Number(row.bytes),
    megabytes: Math.round(Number(row.bytes) / 1024 / 1024),
    latest: row.latest,
    applied: row.applied,
  }));
}

const platformSchemas = new Set([
  "information_schema",
  "extensions",
  "vault",
  "pgbouncer",
  "graphql",
  "graphql_public",
  "realtime",
  "supabase_functions",
  "net",
  "pgsodium",
  "cron",
  "tiger",
  "topology",
]);

async function rehearsalSchemas() {
  const env = productionEnv();
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 20000,
  });
  await client.connect();
  const result = await client.query(
    "select nspname from pg_namespace where nspname not like 'pg_%' order by 1",
  );
  await client.end();
  return result.rows
    .map((row) => row.nspname)
    .filter((name) => !platformSchemas.has(name) && /^[a-z_][a-z0-9_]*$/.test(name));
}

function writePgpass(url) {
  const password = decodeURIComponent(url.password).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  const line = [
    url.hostname,
    url.port || "5432",
    url.pathname.replace(/^\//, "") || "postgres",
    decodeURIComponent(url.username),
    password,
  ].join(":") + "\n";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", "supabase_db_project", "sh", "-c", "umask 077; cat > /tmp/valueor-rehearsal.pgpass"],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`pgpass write exited ${code}`));
    });
    child.stdin.end(line);
  });
}

async function dump() {
  const env = productionEnv();
  const url = new URL(env.DATABASE_URL);
  const schemas = await rehearsalSchemas();
  const remoteFile = "/tmp/valueor-production-copy.dump";
  await writePgpass(url);
  try {
    await run("docker", [
      "exec",
      "-e", "PGPASSFILE=/tmp/valueor-rehearsal.pgpass",
      "-e", "PGSSLMODE=require",
      "supabase_db_project",
      "pg_dump",
      "--no-password",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      ...schemas.flatMap((schema) => ["--schema", schema]),
      "--file",
      remoteFile,
      "--host",
      url.hostname,
      "--port",
      url.port || "5432",
      "--username",
      decodeURIComponent(url.username),
      "--dbname",
      url.pathname.replace(/^\//, "") || "postgres",
    ]);
    await run("docker", ["cp", `supabase_db_project:${remoteFile}`, dumpPath]);
  } finally {
    await run("docker", ["exec", "supabase_db_project", "rm", "-f", remoteFile, "/tmp/valueor-rehearsal.pgpass"]);
  }
  const stat = statSync(dumpPath);
  console.log(JSON.stringify({
    dump_bytes: stat.size,
    dump_outside_repo: true,
    schemas,
  }));
}

async function restore() {
  const admin = new pg.Client({ connectionString: maintenanceUrl });
  await admin.connect();
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [localDb],
  );
  await admin.query(`drop database if exists ${localDb}`);
  await admin.query(`create database ${localDb}`);
  await admin.end();
  const rehearsal = new pg.Client({ connectionString: localUrl });
  await rehearsal.connect();
  await rehearsal.query("drop schema if exists public cascade");
  await installProductionExtensions(rehearsal);
  await rehearsal.end();
  const remoteFile = "/tmp/valueor-production-copy.dump";
  await run("docker", ["cp", dumpPath, `supabase_db_project:${remoteFile}`]);
  try {
    await run("docker", [
      "exec",
      "supabase_db_project",
      "pg_restore",
      "--username",
      "postgres",
      "--dbname",
      localDb,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      remoteFile,
    ]);
  } finally {
    await run("docker", ["exec", "supabase_db_project", "rm", "-f", remoteFile]);
  }
  console.log(JSON.stringify({ restored_database: localDb, host: localHost }));
}

async function migrate() {
  if (isProductionDatabaseUrl(localUrl)) process.exit(2);
  await run("supabase", ["migration", "up", "--db-url", localUrl, "--include-all", "--yes"], {});
  const client = new pg.Client({ connectionString: localUrl });
  await client.connect();
  const result = await client.query(
    "select max(version) as latest, count(*)::int as applied from supabase_migrations.schema_migrations",
  );
  await client.end();
  console.log(JSON.stringify(result.rows[0]));
}

const command = process.argv[2];
try {
  if (command === "inspect") await inspect();
  else if (command === "dump") await dump();
  else if (command === "restore") await restore();
  else if (command === "migrate") await migrate();
  else {
    console.error("Use inspect, dump, restore, or migrate.");
    process.exit(2);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[a-z0-9-]+\.supabase\.co/gi, "[redacted-host]")
    .replace(/[a-z0-9-]+\.pooler\.supabase\.com/gi, "[redacted-host]"));
  process.exit(1);
}
