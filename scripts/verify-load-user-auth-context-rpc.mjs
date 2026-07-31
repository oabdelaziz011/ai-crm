/** Verify RPC profile fields using fresh sign-in. */
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveLoginCredentials,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const { email, password } = resolveLoginCredentials(env);

const { createClient } = await import(
  "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
);

const sb = createClient(
  requireEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
  { auth: { persistSession: false } },
);

const { data: signIn, error: signInError } = await sb.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error("signIn error:", signInError.message);
  process.exit(1);
}

const userId = signIn.user?.id;
const { data, error } = await sb.rpc("load_user_auth_context", { p_user_id: userId });
if (error) {
  console.error("RPC error:", error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      profileKeys: Object.keys(data.profile ?? {}),
      profile: data.profile,
    },
    null,
    2,
  ),
);
