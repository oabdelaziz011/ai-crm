/**
 * Local/unit-test client env only. Never points at hosted production.
 * Loaded before api-server tests that transitively import login-app client modules.
 */
const local = {
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key-not-a-secret",
  VITE_API_SERVER_URL: "http://127.0.0.1:3001",
};

for (const [key, value] of Object.entries(local)) {
  if (!process.env[key]?.trim()) process.env[key] = value;
}
