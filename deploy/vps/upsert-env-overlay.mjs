#!/usr/bin/env node
/**
 * Upsert KEY=value lines from an overlay file into a production dotenv file.
 * Never prints secret values — only key names and counts.
 *
 *   node deploy/vps/upsert-env-overlay.mjs --env /opt/valueor/.env --overlay /path/overlay \
 *     --allow-prefix META_INSTAGRAM_LOGIN_
 *   node deploy/vps/upsert-env-overlay.mjs --env /opt/valueor/.env --overlay /path/overlay \
 *     --allow-prefix META_MESSENGER_OAUTH_
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

/** Default keep Instagram-only for backward compatibility with existing callers. */
const DEFAULT_ALLOW_PREFIXES = ["META_INSTAGRAM_LOGIN_"];

function parseArgs(argv) {
  let envPath = "";
  let overlayPath = "";
  /** @type {string[]} */
  const allowPrefixes = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env") envPath = argv[++i] ?? "";
    else if (a === "--overlay") overlayPath = argv[++i] ?? "";
    else if (a === "--allow-prefix") {
      const prefix = String(argv[++i] ?? "").trim();
      if (prefix) allowPrefixes.push(prefix);
    }
  }
  return {
    envPath,
    overlayPath,
    allowPrefixes: allowPrefixes.length > 0 ? allowPrefixes : DEFAULT_ALLOW_PREFIXES,
  };
}

function parseOverlay(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) throw new Error("overlay line is not KEY=value: refused");
    map.set(m[1], m[2]);
  }
  return map;
}

function keyAllowed(key, allowPrefixes) {
  return allowPrefixes.some((prefix) => key.startsWith(prefix));
}

const { envPath, overlayPath, allowPrefixes } = parseArgs(process.argv.slice(2));
if (!envPath || !overlayPath) {
  console.error(
    "Usage: upsert-env-overlay.mjs --env <file> --overlay <file> [--allow-prefix PREFIX ...]",
  );
  process.exit(2);
}

const absEnv = resolve(envPath);
const absOverlay = resolve(overlayPath);
const overlay = parseOverlay(readFileSync(absOverlay, "utf8"));
if (overlay.size === 0) {
  console.error("overlay is empty");
  process.exit(2);
}

for (const key of overlay.keys()) {
  if (!keyAllowed(key, allowPrefixes)) {
    console.error(
      `refusing overlay key outside allowed prefixes (${allowPrefixes.join(", ")}): ${key}`,
    );
    process.exit(2);
  }
}

const original = readFileSync(absEnv, "utf8");
const lines = original.split(/\r?\n/);
const seen = new Set();
const changed = [];
const out = [];

for (const raw of lines) {
  const line = raw.replace(/\r$/, "");
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    out.push(line);
    continue;
  }
  const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) {
    out.push(line);
    continue;
  }
  const key = m[1];
  if (overlay.has(key)) {
    const next = `${key}=${overlay.get(key)}`;
    out.push(next);
    seen.add(key);
    if (m[2] !== overlay.get(key)) changed.push(key);
  } else {
    out.push(line);
  }
}

for (const [key, value] of overlay.entries()) {
  if (seen.has(key)) continue;
  out.push(`${key}=${value}`);
  changed.push(key);
}

while (out.length > 0 && out[out.length - 1] === "") out.pop();
const body = `${out.join("\n")}\n`;

const stamp = Date.now();
const bak = `${absEnv}.bak-env-overlay-${stamp}`;
copyFileSync(absEnv, bak);
const tmp = `${absEnv}.tmp-env-overlay`;
writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
renameSync(tmp, absEnv);

console.log(
  JSON.stringify({
    ok: true,
    env: absEnv,
    backup: bak,
    allow_prefixes: allowPrefixes,
    keys_upserted: [...overlay.keys()].sort(),
    keys_changed: changed.sort(),
  }),
);
