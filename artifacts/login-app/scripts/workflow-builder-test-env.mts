const meta = import.meta as ImportMeta & { env?: Record<string, string | boolean> };

meta.env = {
  ...meta.env,
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  MODE: "test",
  DEV: false,
  PROD: false,
};
