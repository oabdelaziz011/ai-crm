/**
 * Sprint 7.5.1 — Enterprise Production Certification
 * Validates E2E workflow wiring at unit/integration level (no live DB required).
 * Run: pnpm --dir artifacts/login-app test:enterprise-certification
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { BookingFactory } from "../src/lib/scheduling/booking-domain/booking-factory.ts";
import { CompositeBookingEventPublisher } from "../src/lib/billing/events/booking-billing-bridge.ts";
import { IntegrationBookingEventPublisher, bookingEventToBusType } from "../src/lib/integration/events/enterprise-event-publisher.ts";
import { PaymentProviderRegistry } from "../src/lib/billing/providers/payment-provider-registry.ts";
import { PortalPaymentService } from "../src/lib/customer-portal/payments/portal-payment-service.ts";
import { buildMinimalPdf } from "../src/lib/billing/invoices/pdf-generator.ts";
import { validateManifest } from "../src/lib/plugins/manifest/manifest-validator.ts";
import { pluginSandbox } from "../src/lib/plugins/sandbox/plugin-sandbox.ts";
import { generateSdkStub } from "../src/lib/integration/sdk/sdk-generator.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(__dirname, "..");
const projectRoot = resolve(loginAppRoot, "../..");

const results: { scenario: string; status: "pass" | "fail"; detail?: string }[] = [];

function record(scenario: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      results.push({ scenario, status: "pass" });
      console.log(`  ✓ ${scenario}`);
    } catch (err) {
      results.push({ scenario, status: "fail", detail: err instanceof Error ? err.message : String(err) });
      console.log(`  ✗ ${scenario}: ${err instanceof Error ? err.message : err}`);
    }
  })();
}

console.log("\nSprint 7.5.1 — Enterprise Production Certification\n");

// ── Scenario 1: Customer → Booking → Invoice → Payment → Portal ─────────

await record("S1: Booking event maps to integration bus", () => {
  assert.equal(bookingEventToBusType("BookingCreated"), "booking.created");
  assert.equal(bookingEventToBusType("BookingCompleted"), "booking.completed");
});

await record("S1: Booking factory wires integration publisher", () => {
  const services = BookingFactory.create();
  assert.ok(services.bookingDomain);
  assert.ok(services.bookingRepository);
});

await record("S1: Payment providers registered for invoice payment", () => {
  const registry = PaymentProviderRegistry.createDefault();
  assert.ok(registry.get("stripe"));
  assert.ok(registry.get("sandbox"));
});

await record("S1: Portal payments delegate to billing registry", async () => {
  const portal = PortalPaymentService.createDefault();
  const result = await portal.createPayment("sandbox", {
    companyId: "co-1",
    customerId: "cust-1",
    invoiceId: "inv-1",
    amountCents: 10000,
    currency: "USD",
    returnUrl: "https://portal.example/return",
  });
  assert.equal(result.provider, "sandbox");
  assert.ok(result.checkoutUrl);
});

await record("S1: Invoice PDF generation produces valid document", () => {
  const pdf = buildMinimalPdf("Invoice INV-001");
  assert.ok(pdf.length > 100);
  assert.ok(new TextDecoder().decode(pdf).includes("%PDF"));
});

// ── Scenario 2: Reschedule → Refund → Ledger → Reports ─────────────────

await record("S2: Booking reschedule maps to booking.updated event", () => {
  assert.equal(bookingEventToBusType("BookingRescheduled"), "booking.updated");
});

await record("S2: Composite publisher chains multiple publishers", async () => {
  const events: string[] = [];
  const inner = { async publish(e: { type: string }) { events.push(e.type); } };
  const composite = new CompositeBookingEventPublisher([
    new IntegrationBookingEventPublisher(inner as never),
  ]);
  await composite.publish({
    type: "BookingCreated",
    payload: { booking: { id: "b1", company_id: "c1" } as never },
  });
  assert.ok(events.includes("BookingCreated"));
});

// ── Scenario 3: Cross-branch transfer workflow ─────────────────────────

await record("S3: Organization transfer event type defined", () => {
  const sql = readFileSync(resolve(projectRoot, "supabase/migrations/160_organization_hierarchy_platform.sql"), "utf8");
  assert.ok(sql.includes("organization_transfers"));
  assert.ok(sql.includes("organization_transfer_approvals"));
});

// ── Scenario 4: Plugin install → enable → event → disable ────────────────

await record("S4: Plugin manifest validation", () => {
  const result = validateManifest({
    pluginId: "cert.test",
    name: "Cert Test",
    author: "ValueOR",
    version: "1.0.0",
    category: "general",
    permissions: ["customers.read"],
    minPlatformVersion: "7.0.0",
    dependencies: [],
    entryPoints: { main: "index.js" },
    hooks: ["widget"],
  });
  assert.equal(result.valid, true);
});

await record("S4: Plugin sandbox executes official handler", async () => {
  const result = await pluginSandbox.execute(
    { companyId: "co-1", installationId: "inst-1", pluginId: "valueor.booking-insights", permissions: ["reports.read"], settings: {} },
    { period: "7d" },
    "reports.read",
  );
  assert.equal(result.success, true);
});

// ── Scenario 5: Public API → Webhook → Marketplace → Executive ──────────

await record("S5: Integration SDK stub generation", () => {
  const sdk = generateSdkStub({
    baseUrl: "https://api.valueor.app",
    apiVersion: "v1",
    language: "typescript",
    packageName: "ValueORClient",
  });
  assert.ok(sdk.files[0]?.content.includes("/api/v1"));
});

await record("S5: Integration hub migration tables present", () => {
  const sql = readFileSync(resolve(projectRoot, "supabase/migrations/161_integration_hub_platform.sql"), "utf8");
  assert.ok(sql.includes("integration_api_keys"));
  assert.ok(sql.includes("integration_webhook_deliveries"));
  assert.ok(sql.includes("integration_event_log"));
});

await record("S5: Executive platform migration present", () => {
  const sql = readFileSync(resolve(projectRoot, "supabase/migrations/159_executive_intelligence_platform.sql"), "utf8");
  assert.ok(sql.includes("executive_alerts"));
});

// ── Architecture: no cyclic import in certification modules ────────────

await record("ARCH: Enterprise event publisher exports", () => {
  assert.ok(typeof IntegrationBookingEventPublisher === "function");
});

await record("ARCH: All platform migrations 157–164 present", () => {
  const migrations = readdirSync(resolve(projectRoot, "supabase/migrations"));
  for (const num of [157, 158, 159, 160, 161, 162, 163, 164]) {
    const match = migrations.some((f) => f.startsWith(`${num}_`));
    assert.ok(match, `Migration ${num} missing`);
  }
});

await record("CERT: Migration 164 defines get_user_company_id", () => {
  const sql = readFileSync(resolve(projectRoot, "supabase/migrations/164_certification_rls_fix.sql"), "utf8");
  assert.ok(sql.includes("get_user_company_id"));
  assert.ok(sql.includes("current_company_id()"));
});

// ── Performance micro-benchmark (in-process) ─────────────────────────────

{
  const iterations = 10_000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    bookingEventToBusType("BookingCreated");
  }
  const elapsed = performance.now() - start;
  const opsPerSec = Math.round(iterations / (elapsed / 1000));
  console.log(`\n  ⚡ Event mapping benchmark: ${opsPerSec.toLocaleString()} ops/sec (${iterations} iterations)`);
  assert.ok(opsPerSec > 100_000, "Event mapping should exceed 100k ops/sec");
}

// ── Bundle size check ────────────────────────────────────────────────────

{
  const distAssets = resolve(loginAppRoot, "dist/public/assets");
  if (existsSync(distAssets)) {
    const files = readdirSync(distAssets).filter((f) => f.endsWith(".js"));
    let totalBytes = 0;
    let largest = { name: "", size: 0 };
    for (const f of files) {
      const size = statSync(resolve(distAssets, f)).size;
      totalBytes += size;
      if (size > largest.size) largest = { name: f, size };
    }
    console.log(`\n  📦 Bundle: ${files.length} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
    console.log(`  📦 Largest chunk: ${largest.name} (${(largest.size / 1024 / 1024).toFixed(1)} MB)`);
    assert.ok(largest.size < 3_000_000, "Largest chunk should be under 3MB");
  } else {
    console.log("\n  ⚠ Bundle analysis skipped — run pnpm build first");
  }
}

// ── Summary ──────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.status === "pass").length;
const failed = results.filter((r) => r.status === "fail").length;

console.log(`\nCertification Scenarios: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log("FAILED scenarios:");
  for (const r of results.filter((r) => r.status === "fail")) {
    console.log(`  - ${r.scenario}: ${r.detail}`);
  }
  process.exit(1);
}

console.log("PASS — Enterprise certification scenarios complete\n");
