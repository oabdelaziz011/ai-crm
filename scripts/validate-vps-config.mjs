#!/usr/bin/env node
/**
 * Validate the VPS deployment files. --env checks a server env file and prints key names only.
 *
 *   node scripts/validate-vps-config.mjs
 *   node scripts/validate-vps-config.mjs --env deploy/vps/production.env
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDevSecretPlaceholder } from "./lib/production-runtime.mjs";
import { vpsProcessProblems } from "./lib/vps-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const deployDir = resolve(root, "deploy/vps");

const SECRET_KEYS = [
  "SESSION_SECRET",
  "INTERNAL_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "DATABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYMOB_API_KEY",
  "PAYMOB_HMAC_SECRET",
  "FAWRY_SECURITY_KEY",
  "META_EMBEDDED_SIGNUP_APP_SECRET",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "ALERT_WEBHOOK_URL",
];

const REQUIRED_RUNTIME_SECRETS = [
  "SESSION_SECRET",
  "INTERNAL_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function read(name) {
  return readFileSync(resolve(deployDir, name), "utf8");
}

export function deploymentFileProblems() {
  const problems = [];
  const compose = read("compose.yml");
  const caddy = read("Caddyfile");
  const cloudflare = read("Caddyfile.cloudflare");
  const example = parseEnvFile(read("production.env.example"));
  const systemd = read("systemd/valueor-api.service");
  const nginxFrontend = read("nginx/valueor-frontend.conf");
  const nginxApi = read("nginx/valueor-api.conf");

  if (!systemd.includes("deploy/vps/start-api.mjs") || !systemd.includes("EnvironmentFile=/opt/valueor/.env")) {
    problems.push("systemd/valueor-api.service must start start-api.mjs with the server EnvironmentFile.");
  }
  if (!systemd.includes("PORT=3001")) {
    problems.push("systemd/valueor-api.service must keep PORT=3001 for the Nginx upstream.");
  }
  if (!systemd.includes('EMAIL_POLL_WORKER_ENABLED=false') || !systemd.includes('SESSION_IDLE_TIMEOUT_WORKER_ENABLED=false')) {
    problems.push("systemd/valueor-api.service must keep email/session workers off until exclusive ownership.");
  }
  if (!nginxApi.includes("127.0.0.1:3001") || !nginxApi.includes("api.valueor.org") || !nginxApi.includes("webhook.valueor.org")) {
    problems.push("nginx/valueor-api.conf must proxy api and webhook hostnames to 127.0.0.1:3001.");
  }
  if (!nginxApi.includes("server_tokens off") || !nginxFrontend.includes("server_tokens off")) {
    problems.push("Nginx templates must set server_tokens off.");
  }
  if (!nginxFrontend.includes("/var/www/valueor") || !nginxFrontend.includes("origin-cert.pem")) {
    problems.push("nginx/valueor-frontend.conf must serve /var/www/valueor with the Origin Certificate.");
  }
  if (!nginxFrontend.includes("www.valueor.org")) {
    problems.push("nginx/valueor-frontend.conf must serve www.valueor.org.");
  }
  if (nginxFrontend.includes("app.valueor.org")) {
    problems.push("nginx/valueor-frontend.conf must not claim app.valueor.org while it remains on Vercel.");
  }

  for (const service of ["caddy:", "frontend:", "api:", "platform-worker:"]) {
    if (!compose.includes(service)) problems.push(`compose.yml is missing ${service}`);
  }
  if (/image:\s*postgres/i.test(compose) || /5432:5432/.test(compose) || /3000:3000/.test(compose)) {
    problems.push("compose.yml publishes a database port or the API port.");
  }
  const published = [...compose.matchAll(/^\s+-\s+"(\d+):/gm)].map((match) => match[1]);
  for (const port of published) {
    if (port !== "80" && port !== "443") problems.push(`compose.yml publishes unexpected port ${port}.`);
  }
  if (!caddy.includes("app.valueor.org") || !caddy.includes("api.valueor.org") || !caddy.includes("webhook.valueor.org")) {
    problems.push("Caddyfile is missing a required hostname.");
  }
  if (!caddy.includes("reverse_proxy frontend:8080") || !caddy.includes("reverse_proxy api:3000")) {
    problems.push("Caddyfile does not proxy the frontend and API on the internal network.");
  }
  if (!cloudflare.includes("origin.pem") || !cloudflare.includes("api.valueor.org")) {
    problems.push("Caddyfile.cloudflare is missing the origin certificate or API host.");
  }
  if (example.VITE_API_SERVER_URL !== "https://api.valueor.org") {
    problems.push("production.env.example must set VITE_API_SERVER_URL to https://api.valueor.org.");
  }
  if (example.WEBHOOK_BASE_URL !== "https://webhook.valueor.org") {
    problems.push("production.env.example must set WEBHOOK_BASE_URL to https://webhook.valueor.org.");
  }
  if (example.VITE_APP_ORIGIN !== "https://app.valueor.org") {
    problems.push("production.env.example must set VITE_APP_ORIGIN to https://app.valueor.org.");
  }
  for (const [key, value] of Object.entries(example)) {
    if (/localhost|127\.0\.0\.1|sk_live|sk_test|eyJ|postgres(?:ql)?:\/\//i.test(value)) {
      problems.push(`${key} in production.env.example contains a local or secret-like value.`);
    }
  }
  for (const key of SECRET_KEYS) {
    if (example[key]) problems.push(`${key} must stay empty in production.env.example.`);
  }
  return problems;
}

export function serverEnvProblems(env) {
  const problems = vpsProcessProblems(env);
  for (const key of REQUIRED_RUNTIME_SECRETS) {
    if (!String(env[key] ?? "").trim()) problems.push(`${key} must be set on the server.`);
    else if (isDevSecretPlaceholder(env[key])) problems.push(`${key} is a development placeholder.`);
  }
  if (!String(env.SUPABASE_URL ?? "").includes(".supabase.co")) {
    problems.push("SUPABASE_URL must be the hosted project.");
  }
  if (!String(env.VITE_SUPABASE_URL ?? "").includes(".supabase.co")) {
    problems.push("VITE_SUPABASE_URL must be the hosted project.");
  }
  if (!String(env.SUPABASE_DB_PASSWORD ?? "").trim() && !String(env.DATABASE_URL ?? "").trim()) {
    problems.push("SUPABASE_DB_PASSWORD or DATABASE_URL must be set on the server.");
  }
  if (!String(env.ACME_EMAIL ?? "").includes("@")) problems.push("ACME_EMAIL must be set.");
  if (!String(env.ALERT_WEBHOOK_URL ?? "").trim()) problems.push("ALERT_WEBHOOK_URL must be set before the worker starts.");
  for (const [key, value] of Object.entries(env)) {
    if (/localhost|127\.0\.0\.1/i.test(String(value))) problems.push(`${key} contains a loopback address.`);
  }
  return problems;
}

function printProblems(problems) {
  if (!problems.length) {
    console.log("VPS deployment configuration passed.");
    return 0;
  }
  console.error(["VPS deployment configuration failed.", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
  return 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const envFlag = process.argv.indexOf("--env");
  if (envFlag === -1) {
    process.exit(printProblems(deploymentFileProblems()));
  }
  const envPath = process.argv[envFlag + 1];
  if (!envPath) {
    console.error("--env requires a file path.");
    process.exit(2);
  }
  const env = parseEnvFile(readFileSync(resolve(envPath), "utf8"));
  process.exit(printProblems(serverEnvProblems(env)));
}
