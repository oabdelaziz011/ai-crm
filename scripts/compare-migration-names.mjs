import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remote = JSON.parse(process.argv[2] ?? "[]");
const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

const repoByVersion = new Map();
for (const f of files) {
  const version = f.match(/^(\d+)/)?.[1] ?? f.replace(/\.sql$/, "");
  const name = f.replace(/^\d+_/, "").replace(/\.sql$/, "");
  repoByVersion.set(version, { file: f, name });
}

const remoteByVersion = new Map(remote.map((r) => [String(r.version), r.name]));

const nameMismatches = [];
for (const [version, repo] of repoByVersion) {
  const remoteName = remoteByVersion.get(version);
  if (!remoteName) continue;
  if (remoteName !== repo.name) {
    nameMismatches.push({ version, repoFile: repo.file, repoName: repo.name, remoteName });
  }
}

const missingInRemote = [...repoByVersion.entries()]
  .filter(([v]) => !remoteByVersion.has(v))
  .map(([v, r]) => ({ version: v, file: r.file }));

const extraInRemote = [...remoteByVersion.entries()]
  .filter(([v]) => !repoByVersion.has(v))
  .map(([v, name]) => ({ version: v, name }));

writeFileSync(
  join(root, "_migration_compare.json"),
  JSON.stringify({ nameMismatches, missingInRemote, extraInRemote }, null, 2),
);
console.log(JSON.stringify({ nameMismatches: nameMismatches.length, missingInRemote: missingInRemote.length }, null, 2));
