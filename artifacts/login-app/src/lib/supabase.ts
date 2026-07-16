import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log("[Supabase] Initializing client:", {
  url: supabaseUrl,
  keyPrefix: supabaseKey?.substring(0, 10),
  keyLength: supabaseKey?.length,
});

export const supabase = createClient(supabaseUrl, supabaseKey);
