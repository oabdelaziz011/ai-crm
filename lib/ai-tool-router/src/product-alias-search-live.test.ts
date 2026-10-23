/**
 * LOCAL-ONLY live check for PRD-GSHF alias search.
 * Skips automatically when local Supabase is unreachable.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseProductAgentToolPorts } from "./adapters/supabase-product-agent-tool-ports.js";
import {
  createProductAgentTools,
  productSearchTerms,
  withProductPriceVisibility,
} from "./tools/product-agent-tools.js";
import type { ToolExecutionContext } from "./tools/tool-contract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const SKU = "PRD-GSHF";
/** Full alias phrase saved on PRD-GSHF (not present in name/description). */
const ALIAS_QUERY = "Accounts Payable Tool";
/** Lowercase token also stored in aliases[] for this product (not in name/description). */
const ALIAS_TOKEN = "Billing";

function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  return env;
}

function ctx(companyId: string): ToolExecutionContext {
  return {
    companyId,
    conversationId: "local-alias-search-test",
    conversationState: "waiting_user",
    userId: null,
  };
}

async function canReachLocalSupabase(url: string, key: string): Promise<boolean> {
  if (!/127\.0\.0\.1|localhost/.test(url)) return false;
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.from("catalog_products").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

describe("live local alias search (PRD-GSHF)", async () => {
  const local = loadEnvFile(resolve(root, ".env.localstack"));
  const url = local.SUPABASE_URL || "http://127.0.0.1:54321";
  const key = local.SUPABASE_SERVICE_ROLE_KEY || "";
  const live = key ? await canReachLocalSupabase(url, key) : false;

  it("flag on finds PRD-GSHF by alias-only phrase; flag off does not", async (t) => {
    if (!live) {
      t.skip("local Supabase unavailable");
      return;
    }

    const previous = process.env.VALUEOR_PRODUCT_ALIAS_SEARCH;
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: row, error } = await client
        .from("catalog_products")
        .select("name, sku, description, aliases")
        .eq("sku", SKU)
        .is("deleted_at", null)
        .maybeSingle();
      assert.ifError(error);
      assert.ok(row, "PRD-GSHF must exist");

      const blob = `${row.name}\n${row.description ?? ""}`.toLowerCase();
      assert.equal(blob.includes("payable"), false);
      assert.equal(blob.includes("billing"), false);
      assert.ok(
        Array.isArray(row.aliases) &&
          row.aliases.some((alias) => String(alias) === "Accounts Payable Tool"),
      );
      assert.ok(
        Array.isArray(row.aliases) &&
          row.aliases.some((alias) => String(alias).toLowerCase() === "billing"),
      );

      assert.ok(productSearchTerms(ALIAS_QUERY).length >= 2);
      assert.ok(productSearchTerms(ALIAS_TOKEN).includes("billing"));

      async function search(flag: string | undefined, query: string, companyId = COMPANY_ID) {
        if (flag === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_SEARCH;
        else process.env.VALUEOR_PRODUCT_ALIAS_SEARCH = flag;
        const ports = withProductPriceVisibility(createSupabaseProductAgentToolPorts(client), () => false);
        const tool = createProductAgentTools(ports).search_products!;
        tool.validate({ query, limit: 10 });
        return (await tool.execute(ctx(companyId), { query, limit: 10 })) as {
          products: Array<Record<string, unknown>>;
        };
      }

      const onPhrase = await search("true", ALIAS_QUERY);
      const onHit = onPhrase.products.find((p) => p.sku === SKU);
      assert.ok(onHit, `flag ON should find ${SKU} via "${ALIAS_QUERY}"`);
      assert.equal(onHit.price && (onHit.price as { status?: string }).status, "not_listed");
      assert.equal(Object.prototype.hasOwnProperty.call(onHit, "cost"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(onHit, "margin_percent"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(onHit, "marginPercent"), false);

      const offPhrase = await search("", ALIAS_QUERY);
      assert.equal(
        offPhrase.products.some((p) => p.sku === SKU),
        false,
        `flag OFF must not find ${SKU} via alias-only phrase`,
      );

      const onToken = await search("true", ALIAS_TOKEN);
      assert.ok(
        onToken.products.some((p) => p.sku === SKU),
        `flag ON should find ${SKU} via token "${ALIAS_TOKEN}"`,
      );

      const offToken = await search("", ALIAS_TOKEN);
      assert.equal(
        offToken.products.some((p) => p.sku === SKU),
        false,
        `flag OFF must not find ${SKU} via alias-only token`,
      );

      const isolated = await search("true", ALIAS_QUERY, "00000000-0000-0000-0000-000000000099");
      assert.equal(isolated.products.length, 0, "other company must see zero results");
    } finally {
      if (previous === undefined) delete process.env.VALUEOR_PRODUCT_ALIAS_SEARCH;
      else process.env.VALUEOR_PRODUCT_ALIAS_SEARCH = previous;
    }
  });
});
