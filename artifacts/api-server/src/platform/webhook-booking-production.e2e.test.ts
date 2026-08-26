/**
 * Booking production readiness — live DB + webhook wiring (opt-in).
 * Run: BOOKING_PRODUCTION_E2E=1 pnpm --dir artifacts/api-server test src/platform/webhook-booking-production.e2e.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createToolRouterServices } from "@workspace/ai-tool-router";
import { createWebhookSchedulingToolPorts } from "./webhook-scheduling-tool-ports.js";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";
import { employeeHasSchedulingCatalogTools } from "@login-app/lib/ai-employees/utilities/scheduling-catalog-prompt.js";

const LIVE = process.env.BOOKING_PRODUCTION_E2E === "1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadEnv(): { url: string; key: string; companyId: string } | null {
  const env: Record<string, string> = {};
  for (const rel of [".env", "artifacts/login-app/.env.local"]) {
    const path = resolve(root, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const companyId =
    process.env.BOOKING_E2E_COMPANY_ID ??
    env.BOOKING_E2E_COMPANY_ID ??
    "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
  if (!url || !key) return null;
  return { url, key, companyId };
}

async function resolveLiveActorUserId(client: SupabaseClient, companyId: string): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .select("id, user_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const userId =
    (typeof data?.user_id === "string" && data.user_id.trim()) ||
    (typeof data?.id === "string" && data.id.trim()) ||
    "";
  if (!userId) {
    throw new Error(`No active profile found for company ${companyId}`);
  }
  return userId;
}

describe("webhook booking catalog gating", () => {
  it("does not build scheduling catalog when employee lacks scheduling tools", () => {
    assert.equal(employeeHasSchedulingCatalogTools(["search_ticket", "knowledge_search"]), false);
    assert.equal(employeeHasSchedulingCatalogTools(["create_booking"]), true);
  });
});

const live = loadEnv();
(live ? describe : describe.skip)("webhook booking production e2e (live DB)", () => {
  let client: SupabaseClient;
  let companyId: string;
  let conversationId: string;
  let actorUserId: string;
  let toolRouter: ReturnType<typeof createToolRouterServices>["router"];

  before(async () => {
    assert.ok(live);
    client = createClient(live!.url, live!.key, { auth: { persistSession: false } });
    companyId = live!.companyId;
    actorUserId = await resolveLiveActorUserId(client, companyId);

    const { data: conversation } = await client
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert.ok(conversation?.id, "existing conversation required for live tool router");
    conversationId = conversation.id;

    const integrations = createToolRouterServices(client, {
      schedulingToolPorts: createWebhookSchedulingToolPorts(client),
    });
    toolRouter = integrations.router;
  });

  it("search_availability returns structured result against real scheduling tables", async () => {
    const { data: service } = await client
      .from("scheduling_services")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!service?.id) {
      console.warn("skip: no active scheduling service for company");
      return;
    }

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId,
      userId: actorUserId,
    });
    const result = await toolRouter.route(ctx, {
      toolKey: "search_availability",
      input: { serviceId: service.id, searchWindowDays: 7 },
      triggeredBy: "agent",
      conversationId,
    });

    assert.equal(result.status, "succeeded");
    assert.ok(result.output && typeof result.output === "object");
    const output = result.output as Record<string, unknown>;
    assert.equal(typeof output.success, "boolean");
  });

  it("cross-tenant cancel_booking is rejected", async () => {
    assert.ok(client);
    const { data: foreignBooking } = await client
      .from("scheduling_bookings")
      .select("id, company_id, confirmation_number, customer_id")
      .neq("company_id", companyId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!foreignBooking?.confirmation_number) {
      console.warn("skip: no foreign booking row to test cross-tenant guard");
      return;
    }

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId,
      userId: actorUserId,
    });
    const result = await toolRouter.route(ctx, {
      toolKey: "cancel_booking",
      input: {
        bookingReference: foreignBooking.confirmation_number,
        phone: "201000000001",
      },
      triggeredBy: "agent",
      conversationId,
    });

    assert.equal(result.status, "succeeded");
    const output = result.output as Record<string, unknown>;
    assert.notEqual(output.success, true);
  });

  it("search_bookings stays company-scoped for phone lookup", async () => {
    assert.ok(client);
    const ctx = createWebhookAiEmployeeServiceContext({
      companyId,
      userId: actorUserId,
    });
    const result = await toolRouter.route(ctx, {
      toolKey: "search_bookings",
      input: { phone: "201011404109", purpose: "list" },
      triggeredBy: "agent",
      conversationId,
    });
    assert.equal(result.status, "succeeded");
    const output = result.output as Record<string, unknown>;
    assert.equal(typeof output.success, "boolean");
    if (output.success === true && Array.isArray(output.bookings)) {
      for (const booking of output.bookings as Array<{ companyId?: string }>) {
        if (booking.companyId) assert.equal(booking.companyId, companyId);
      }
    }
  });
});
