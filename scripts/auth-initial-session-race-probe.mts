/**
 * Simulate AuthProvider INITIAL_SESSION vs getSession race.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
function loadEnv() {
  const env: Record<string, string> = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}
const env = loadEnv();

async function simulateAuthProviderFlow(label: string) {
  console.log(`\n=== ${label} ===`);
  const events: string[] = [];
  let permissionsLoaded = false;

  const client = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await client.auth.signInWithPassword({
    email: "demo-employee@vaultos.local",
    password: "DemoVault2026!",
  });

  const loadAuthContext = async (userId: string) => {
    const { data: ur } = await client.from("user_roles").select("role_id").eq("user_id", userId);
    const roleIds = (ur ?? []).map((r) => r.role_id);
    const { data: roles } = await client.from("roles").select("id").in("id", roleIds);
    const ids = (roles ?? []).map((r) => r.id);
    if (!ids.length) {
      events.push(`loadAuthContext: 0 roleIds from roles table`);
      return 0;
    }
    const { data: rp } = await client.from("role_permissions").select("permission_id").in("role_id", ids);
    const pids = [...new Set((rp ?? []).map((r) => r.permission_id))];
    const { data: perms } = await client.from("permissions").select("code").in("id", pids);
    const count = perms?.length ?? 0;
    permissionsLoaded = count > 0;
    events.push(`loadAuthContext: ${count} permission codes`);
    return count;
  };

  const handleAuthStateChange = async (event: string, session: { user?: { id: string } } | null) => {
    events.push(`onAuthStateChange: ${event} session=${session?.user?.id ? "yes" : "no"}`);
    if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      events.push("  → SKIPPED loadAuthContext (auth-context L231-232)");
      return;
    }
    if (event === "SIGNED_IN" && session?.user) {
      events.push("  → clearAuthContext + loadAuthContext");
      await loadAuthContext(session.user.id);
    }
  };

  const initializeSession = async () => {
    events.push("initializeSession: start getSession()");
    const { data: { session } } = await client.auth.getSession();
    events.push(`initializeSession: getSession user=${session?.user?.id ? "yes" : "no"}`);
    if (session?.user) {
      await loadAuthContext(session.user.id);
    } else {
      events.push("initializeSession: clearAuthContext (no session)");
    }
  };

  client.auth.onAuthStateChange((event, session) => {
    void handleAuthStateChange(event, session);
  });

  await initializeSession();
  await new Promise((r) => setTimeout(r, 500));

  for (const e of events) console.log(e);
  console.log(`Final permissions loaded: ${permissionsLoaded}`);
}

await simulateAuthProviderFlow("Fresh client after signIn (mimics page reload while logged in)");
