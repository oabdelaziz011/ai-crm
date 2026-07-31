import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv, extractSupabaseProjectRef } from "./load-project-env.mjs";

export { loadProjectEnv, extractSupabaseProjectRef };

export function resolveScriptsRoot(fromModuleUrl) {
  return resolve(dirname(fileURLToPath(fromModuleUrl)), "..");
}

export function loadDevScriptEnv(fromModuleUrl) {
  const root = resolveScriptsRoot(fromModuleUrl);
  return { root, env: loadProjectEnv(root, { mergeProcessEnv: true }) };
}

export function requireEnvValue(env, names, label) {
  for (const name of names) {
    const value = env[name] ?? process.env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  console.error(`Missing required ${label}. Set one of: ${names.join(", ")}`);
  process.exit(1);
}

export function resolveArgOrEnv(argv, argIndex, envNames, env, label) {
  const fromArg = argv[argIndex];
  if (typeof fromArg === "string" && fromArg.trim() && !fromArg.startsWith("-")) {
    return fromArg.trim();
  }
  return requireEnvValue(env, envNames, label);
}

export function resolveLoginCredentials(env) {
  return {
    email: requireEnvValue(
      env,
      ["VERIFY_EMAIL", "SMOKE_EMAIL", "DEV_LOGIN_EMAIL"],
      "login email (VERIFY_EMAIL or SMOKE_EMAIL)",
    ),
    password: requireEnvValue(
      env,
      ["VERIFY_PASSWORD", "SMOKE_PASSWORD", "DEV_LOGIN_PASSWORD"],
      "login password (VERIFY_PASSWORD or SMOKE_PASSWORD)",
    ),
  };
}

export function resolveLoginAppBaseUrl(env) {
  const base =
    env.LOGIN_APP_URL ??
    env.VITE_DEV_SERVER_URL ??
    process.env.LOGIN_APP_URL ??
    process.env.VITE_DEV_SERVER_URL ??
    "http://localhost:5173";
  return base.replace(/\/$/, "");
}

export function resolveBrowserSessionPath(root, env) {
  const relative =
    env.BROWSER_SESSION_FILE ??
    process.env.BROWSER_SESSION_FILE ??
    "artifacts/inbox-session.json";
  return resolve(root, relative);
}

export function resolveCommaSeparatedEnv(env, names, label) {
  const raw = requireEnvValue(env, names, label);
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveChannelId(argv, env) {
  return resolveArgOrEnv(argv, 0, ["CHANNEL_ID", "COMPANY_CHANNEL_ID"], env, "company channel id");
}

export function resolveWhatsAppTestRecipient(argv, env, argIndex = 1) {
  return resolveArgOrEnv(
    argv,
    argIndex,
    ["WHATSAPP_TEST_TO", "WHATSAPP_TEST_USER_ID", "WHATSAPP_EXTERNAL_USER_ID"],
    env,
    "WhatsApp test recipient",
  );
}

export function createServiceRoleSupabaseClient(env, createClient) {
  return createClient(
    requireEnvValue(env, ["SUPABASE_URL", "VITE_SUPABASE_URL"], "Supabase URL"),
    requireEnvValue(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], "Supabase service role key"),
    { auth: { persistSession: false } },
  );
}
