import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEffectiveQuotaPolicy } from "./resolve-effective-quota-policy.js";

type QueryResult = { data: unknown; error: { message: string } | null };

function mockSupabase(handlers: {
  override?: QueryResult;
  featureDef?: QueryResult;
  entitlements?: QueryResult;
}) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: (_col: string, val: string) => {
          chain._eqs = [...(chain._eqs ?? []), val];
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "company_usage_limit_overrides") {
            return handlers.override ?? { data: null, error: null };
          }
          if (table === "feature_definitions") {
            return handlers.featureDef ?? { data: { code: "ai_email_routing" }, error: null };
          }
          return { data: null, error: null };
        },
        _eqs: [] as string[],
      };
      return chain;
    },
    rpc(fn: string) {
      if (fn === "get_company_entitlements") {
        return Promise.resolve(handlers.entitlements ?? { data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

describe("resolveEffectiveQuotaPolicy", () => {
  it("returns company override for matching company_id", async () => {
    const client = mockSupabase({
      override: {
        data: {
          included_quantity: 7,
          is_unlimited: false,
          overage_allowed: true,
          overage_unit_size: 100,
          overage_unit_price: 2,
        },
        error: null,
      },
      entitlements: {
        data: [{ feature_code: "ai_email_routing", limit_value: { monthly: 100 } }],
        error: null,
      },
    });

    const policy = await resolveEffectiveQuotaPolicy(client as never, {
      companyId: "company-a",
      usageMetricCode: "ai_email_routing",
      featureCode: "ai_email_routing",
    });

    assert.equal(policy.source, "company_override");
    assert.equal(policy.included_quantity, 7);
    assert.equal(policy.overage_allowed, true);
  });

  it("does not leak plan limit across companies (tenant-scoped queries)", async () => {
    const seenCompanyIds: string[] = [];
    const client = {
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: (col: string, val: string) => {
            if (table === "company_usage_limit_overrides" && col === "company_id") {
              seenCompanyIds.push(val);
            }
            return chain;
          },
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
      rpc(fn: string, args?: { p_company_id?: string }) {
        if (fn === "get_company_entitlements" && args?.p_company_id) {
          seenCompanyIds.push(args.p_company_id);
        }
        return Promise.resolve({
          data: [{ feature_code: "ai_email_routing", limit_value: { monthly: 50 } }],
          error: null,
        });
      },
    };

    await resolveEffectiveQuotaPolicy(client as never, {
      companyId: "tenant-b",
      usageMetricCode: "ai_email_routing",
      featureCode: "ai_email_routing",
    });

    assert.deepEqual(seenCompanyIds, ["tenant-b", "tenant-b"]);
  });
});
