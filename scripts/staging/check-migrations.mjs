import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directory = resolve(root, "supabase/migrations");
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const versions = new Map();
const duplicates = [];
for (const name of files) {
  const version = name.split("_")[0];
  const previous = versions.get(version);
  if (previous) duplicates.push(`${version}: ${previous}, ${name}`);
  versions.set(version, name);
}
if (duplicates.length > 0) {
  console.error("Duplicate migration versions:");
  for (const item of duplicates) console.error(`  ${item}`);
  process.exit(1);
}
console.log(`migrations ${files.length}`);
console.log(`first ${files[0]}`);
console.log(`last ${files[files.length - 1]}`);
