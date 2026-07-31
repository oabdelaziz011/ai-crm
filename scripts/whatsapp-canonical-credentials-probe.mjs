import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const CHANNEL_ID = resolveArgOrEnv(
  process.argv.slice(2),
  0,
  ["CHANNEL_ID", "COMPANY_CHANNEL_ID"],
  env,
  "company channel id",
);

async function loadCanonicalCredentials(client, companyId) {
  const diagnostics = [];
  const diag = (stage, detail = {}) => diagnostics.push({ stage, companyId, ...detail });

  diag("canonical.load.start");

  const { data: decrypted, error: rpcError } = await client.rpc(
    "get_company_whatsapp_settings_decrypted",
    { p_company_id: companyId },
  );

  diag("canonical.load.rpc", {
    rpcError: rpcError?.message ?? null,
    rpcErrorCode: rpcError?.code ?? null,
    lookupResult: decrypted && typeof decrypted === "object" ? "object" : "null",
    accessTokenPresent: Boolean(decrypted?.access_token?.trim()),
  });

  if (!rpcError && decrypted && typeof decrypted === "object" && decrypted.access_token?.trim()) {
    diag("canonical.load.rpc.mapped", { source: "company_whatsapp_settings.rpc" });
    return { credentials: decrypted, diagnostics };
  }

  diag("canonical.load.table.start", { reason: rpcError ? "rpc_failed" : "rpc_missing_access_token" });

  const { data: row, error: tableError } = await client
    .from("company_whatsapp_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  diag("canonical.load.table", {
    tableError: tableError?.message ?? null,
    recordFound: Boolean(row),
    accessTokenPresent: Boolean(row?.access_token?.trim()),
    phoneNumberIdPresent: Boolean(row?.phone_number_id?.trim()),
    businessAccountIdPresent: Boolean(row?.business_account_id?.trim()),
  });

  if (tableError || !row?.access_token?.trim()) {
    return { credentials: null, diagnostics };
  }

  diag("canonical.load.table.mapped", { source: "company_whatsapp_settings.table" });
  return {
    credentials: {
      access_token: row.access_token,
      phone_number_id: row.phone_number_id,
      business_account_id: row.business_account_id,
      webhook_verify_token: row.webhook_verify_token,
    },
    diagnostics,
  };
}

const sb = createClient(
  requireEnvValue(env, ["SUPABASE_URL", "VITE_SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], "Supabase service role key"),
  { auth: { persistSession: false } },
);

const { data: channel } = await sb
  .from("company_channels")
  .select("id, company_id")
  .eq("id", CHANNEL_ID)
  .single();

const companyId = channel.company_id;
const { credentials, diagnostics } = await loadCanonicalCredentials(sb, companyId);

console.log(
  JSON.stringify(
    {
      companyChannelId: CHANNEL_ID,
      companyId,
      outboundCompanyIdMatchesInbound: true,
      credentialsLoaded: Boolean(credentials),
      accessTokenPresent: Boolean(credentials?.access_token?.trim()),
      phoneNumberId: credentials?.phone_number_id ?? null,
      businessAccountId: credentials?.business_account_id ?? null,
      diagnostics,
    },
    null,
    2,
  ),
);
