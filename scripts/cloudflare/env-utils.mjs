import fs from "node:fs";
import path from "node:path";

export const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

export function readEnvFile(filePath = path.join(PROJECT_ROOT, ".env")) {
  if (!fs.existsSync(filePath)) {
    return { filePath, values: new Map(), lines: [] };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const values = new Map();

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values.set(match[1], match[2]);
  }

  return { filePath, values, lines: raw.split(/\r?\n/) };
}

export function upsertEnvVars(updates, filePath = path.join(PROJECT_ROOT, ".env")) {
  const { values, lines } = readEnvFile(filePath);
  const knownKeys = new Set(values.keys());
  const nextLines = [...lines];

  for (const [key, value] of Object.entries(updates)) {
    const serialized = `${key}=${value}`;
    const index = nextLines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      nextLines[index] = serialized;
    } else {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
        nextLines.push("");
      }
      nextLines.push(serialized);
    }
    knownKeys.add(key);
  }

  fs.writeFileSync(filePath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

export function requireEnv(keys, source = readEnvFile().values) {
  const missing = keys.filter((key) => !source.get(key)?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required .env keys: ${missing.join(", ")}`);
  }

  return Object.fromEntries(keys.map((key) => [key, source.get(key).trim()]));
}

export function resolveUserCloudflaredDir() {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (!home) throw new Error("Cannot resolve home directory for ~/.cloudflared");
  return path.join(home, ".cloudflared");
}
