import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { valueorEnv: "local" });
const url = env.SUPABASE_URL || "http://127.0.0.1:54321";
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!key) throw new Error("missing service role");
const admin = createClient(url, key, { auth: { persistSession: false } });

const emails = ["oabdelaziz011@gmail.com", "nhossam@ntgclarity.com"];
for (const email of emails) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://localhost:5173/auth/callback" },
  });
  if (error) {
    console.log(JSON.stringify({ email, error: error.message }));
    continue;
  }
  const link = data.properties?.action_link;
  const file = resolve(
    root,
    "artifacts/.local-dev-clone",
    `magic-${email.replace(/[@.]/g, "_")}.txt`,
  );
  writeFileSync(file, link || "");
  console.log(JSON.stringify({ email, saved: Boolean(link), file }));
}
