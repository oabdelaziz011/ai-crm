/**
 * Bootstrap browser session for Team Inbox live verification.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const EMAIL = "oabdelaziz011@gmail.com";
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users } = await sb.auth.admin.listUsers();
const user = users.users.find((u) => u.email === EMAIL);
if (!user) {
  console.error("User not found");
  process.exit(1);
}

const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
  options: { redirectTo: "http://localhost:5173/auth/callback?next=/dashboard/inbox" },
});

if (linkErr) {
  console.error("generateLink failed:", linkErr.message);
  process.exit(1);
}

const props = linkData.properties;
console.log("user:", user.id);
console.log("profile company check pending");
console.log("magic link action_link:", props.action_link);

// Extract token_hash for verifyOtp flow
console.log("email_otp:", props.email_otp ?? "n/a");
console.log("hashed_token:", props.hashed_token ?? "n/a");

// Create session directly via verifyOtp if email_otp available
if (props.email_otp) {
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
    email: EMAIL,
    token: props.email_otp,
    type: "magiclink",
  });
  if (otpErr) {
    console.error("verifyOtp failed:", otpErr.message);
    process.exit(1);
  }
  console.log("\n=== SESSION TOKENS ===");
  const session = sessionData.session;
  const storageKey = `sb-${new URL(env.SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const storageValue = {
    access_token: session?.access_token,
    refresh_token: session?.refresh_token,
    expires_at: session?.expires_at,
    expires_in: session?.expires_in,
    token_type: session?.token_type,
    user: session?.user,
  };
  const redirectTo = "http://localhost:5173/auth/callback?next=/dashboard/inbox";
  const verifyUrl = `[REDACTED]/auth/v1/verify?token=${props.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;
  writeFileSync(resolve(projectRoot, "artifacts/inbox-login-url.txt"), verifyUrl, "utf8");
  console.log("wrote artifacts/inbox-login-url.txt");
  console.log("verifyUrl:", verifyUrl);

  const { data: profile } = await anon.from("profiles").select("company_id, email, is_super_admin").eq("id", user.id).single();
  console.log("profile:", profile);
}
