#!/usr/bin/env node
/**
 * Ensures every Supabase migration filename uses a unique numeric version prefix.
 * Supabase keys migrations by the leading digits (e.g. 164_foo.sql -> version "164").
 * Duplicate prefixes cause remote push failures when schema_migrations already records the version.
 */
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDir = join(repoRoot, "supabase", "migrations");

const VERSION_PATTERN = /^(\d+)_/;

function collectMigrationVersions() {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const byVersion = new Map();

  for (const filename of files) {
    const match = filename.match(VERSION_PATTERN);
    if (!match) {
      console.error(`[migrations] Invalid filename (expected NNN_name.sql): ${filename}`);
      process.exit(1);
    }

    const version = match[1];
    const entries = byVersion.get(version) ?? [];
    entries.push(filename);
    byVersion.set(version, entries);
  }

  return byVersion;
}

const byVersion = collectMigrationVersions();
const duplicates = [...byVersion.entries()].filter(([, files]) => files.length > 1);

if (duplicates.length > 0) {
  console.error("[migrations] Duplicate version prefixes detected:\n");
  for (const [version, files] of duplicates) {
    console.error(`  version ${version}:`);
    for (const file of files) {
      console.error(`    - supabase/migrations/${file}`);
    }
  }
  console.error(
    "\nEach migration must have a unique numeric prefix. Renumber the newer file to the next available version.",
  );
  process.exit(1);
}

console.log(`[migrations] OK — ${byVersion.size} unique version prefix(es), no duplicates.`);
