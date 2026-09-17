import { createClient } from "@supabase/supabase-js";
import { requireClientEnv } from "@/lib/runtime-env";

const supabaseUrl = requireClientEnv("VITE_SUPABASE_URL");
const supabaseKey = requireClientEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

// Local Supabase (127.0.0.1:54321) is the default developer target under VALUEOR_ENV=local.

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Callback route performs explicit code/hash exchange to avoid races with AuthProvider init.
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
  },
});
