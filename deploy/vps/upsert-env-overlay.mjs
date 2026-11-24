#!/usr/bin/env node
/**
 * Upsert KEY=value lines from an overlay file into a production dotenv file.
 * Never prints secret values — only key names and counts.
 *
 *   node deploy/vps/upsert-env-overlay.mjs --env /opt/valueor/.env --overlay /path/overlay
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  let envPath = "";
  let overlayPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env") envPath = argv[++i] ?? "";
    else if (a === "--overlay") overlayPath = argv[++i] ?? "";
  }
  return { envPath, overlayPath };
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

const { envPath, overlayPath } = parseArgs(process.argv.slice(2));
if (!envPath || !overlayPath) {
  console.error("Usage: upsert-env-overlay.mjs --env <file> --overlay <file>");
  process.exit(2);
}

const absEnv = resolve(envPath);
const absOverlay = resolve(overlayPath);
const overlay = parseOverlay(readFileSync(absOverlay, "utf8"));
if (overlay.size === 0) {
  console.error("overlay is empty");
  process.exit(2);
}

const allowedPrefix = "META_INSTAGRAM_LOGIN_";
for (const key of overlay.keys()) {
  if (!key.startsWith(allowedPrefix)) {
    console.error(`refusing overlay key outside ${allowedPrefix}*: ${key}`);
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

const bak = `${absEnv}.bak-instagram-login-${Date.now()}`;
copyFileSync(absEnv, bak);
const tmp = `${absEnv}.tmp-instagram-login`;
writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
renameSync(tmp, absEnv);

console.log(
  JSON.stringify({
    ok: true,
    env: absEnv,
    backup: bak,
    keys_upserted: [...overlay.keys()].sort(),
    keys_changed: changed.sort(),
  }),
);
