import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { createProductPlatformServices } = await import("@workspace/product-platform");
const { createSupabaseOpportunityRepository } = await import("@workspace/opportunity-platform");

const companyId = process.argv[2] ?? "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const oppId = process.argv[3] ?? "919b1f5c-9208-4bd8-8c4e-5b65883cb2ec";
const lineId = process.argv[4] ?? "28d76e8d-0a53-44b1-977d-70f23438aecc";
const actorUserId = "d0000001-0001-4001-8001-000000000001";

const oppRepo = createSupabaseOpportunityRepository(sb);
const platform = createProductPlatformServices(sb, {
  events: {
    async publishCreated() {},
    async publishUpdated() {},
    async publishArchived() {},
    async publishPriceChanged() {},
    async publishCategoryChanged() {},
    async publishOpportunityProductsAdded() {},
  },
  opportunityHistory: {
    addHistory: async (input) => {
      await oppRepo.addHistory(input);
    },
  },
});

const ctx = {
  userId: actorUserId,
  companyId,
  isSuperAdmin: true,
  hasPermission: () => true,
};

const qtyResult = await platform.commands.updateOpportunityLine(ctx, {
  companyId,
  opportunityId: oppId,
  lineId,
  quantity: 3,
});

const priceResult = await platform.commands.updateOpportunityLine(ctx, {
  companyId,
  opportunityId: oppId,
  lineId,
  unitPrice: 2000,
});

const history = await sb
  .from("opportunity_history")
  .select("event_type,field_name,previous_value,new_value,summary,created_at")
  .eq("company_id", companyId)
  .eq("opportunity_id", oppId)
  .order("created_at", { ascending: false })
  .limit(8);

console.log(
  JSON.stringify(
    {
      lineAfter: priceResult.line,
      history: history.data,
      historyError: history.error,
    },
    null,
    2,
  ),
);
