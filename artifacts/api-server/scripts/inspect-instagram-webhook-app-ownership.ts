import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseInstagramCredentialsLoader,
  inspectInstagramWebhookAppOwnership,
} from "@workspace/channel-platform";
import "../src/load-env.js";

const companyId = (process.argv[2] ?? process.env.COMPANY_ID ?? "").trim();
const companyChannelId = (process.argv[3] ?? process.env.COMPANY_CHANNEL_ID ?? "").trim() || null;

if (!companyId) {
  console.error("Usage: tsx scripts/inspect-instagram-webhook-app-ownership.ts <companyId> [companyChannelId]");
  process.exit(1);
}

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  ""
).trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const credentials = await createSupabaseInstagramCredentialsLoader(client).loadByCompanyId(companyId);
if (!credentials?.accessToken.trim()) {
  console.error("instagram_credentials_not_found");
  process.exit(1);
}

const report = await inspectInstagramWebhookAppOwnership({
  companyId,
  companyChannelId,
  instagramBusinessAccountId: credentials.instagramBusinessAccountId,
  accessToken: credentials.accessToken,
  apiVersion: credentials.apiVersion,
});

const serialized = JSON.stringify(report, null, 2);
if (/(app_secret=|access_token=|verify_token=|x-hub-signature|EAA[A-Z]{2}|IGQW|IGAA)/i.test(serialized)) {
  console.error("Refusing to print report because it looks like it contains a secret.");
  process.exit(2);
}

console.log(serialized);
