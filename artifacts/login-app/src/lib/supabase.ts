import { createClient } from "@supabase/supabase-js";

const runtimeEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : (process.env as ImportMetaEnv);

const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
const supabaseKey = runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables are missing.");
}

if (
  typeof import.meta !== "undefined" &&
  import.meta.env?.DEV &&
  /localhost:54321|127\.0\.0\.1:54321/.test(supabaseUrl)
) {
  throw new Error(
    "VITE_SUPABASE_URL points to local Supabase (localhost:54321) but no local instance is reachable. " +
      "Run `node scripts/sync-vite-env.mjs` from artifacts/login-app and restart the dev server.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Callback route performs explicit code/hash exchange to avoid races with AuthProvider init.
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
  },
});
