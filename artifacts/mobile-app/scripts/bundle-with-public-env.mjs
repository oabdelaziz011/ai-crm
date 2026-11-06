import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const devFlag = args.indexOf("--dev");
const releaseBundle = devFlag >= 0 && args[devFlag + 1] === "false";
const releaseConfig = String(args[0] ?? "").endsWith("getAppConfig.js") && args.at(-1) === "production";
const env = { ...process.env };

if (releaseBundle || releaseConfig) {
  const filePath = path.join(mobileRoot, ".env.production");
  if (!fs.existsSync(filePath)) {
    console.error("The release bundle is missing its public server configuration.");
    process.exit(1);
  }
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  env.EAS_BUILD_PROFILE = "production";
  env.NODE_ENV = "production";
}

const child = spawnSync(process.execPath, args, { cwd: process.cwd(), env, stdio: "inherit" });
process.exit(child.status ?? 1);
