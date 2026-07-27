import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PaymentProviderRegistry } from "../src/lib/billing/providers/payment-provider-registry.ts";
import { buildMinimalPdf, MinimalInvoicePdfGenerator } from "../src/lib/billing/invoices/pdf-generator.ts";
import { verifyWebhookSignature } from "../src/lib/billing/security/webhook-signature.ts";
import { bookingEventToBusType } from "../src/lib/integration/events/enterprise-event-publisher.ts";
import { PortalPaymentService } from "../src/lib/customer-portal/payments/portal-payment-service.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");

console.log("Sprint 7.5.0 — Go-Live Readiness Tests\n");

// ── Migration files 157–163 ──────────────────────────────────

const migrations = [
  "157_customer_experience_platform.sql",
  "158_enterprise_financial_platform.sql",
  "159_executive_intelligence_platform.sql",
  "160_organization_hierarchy_platform.sql",
  "161_integration_hub_platform.sql",
  "162_plugin_marketplace_platform.sql",
  "163_production_hardening.sql",
];

for (const file of migrations) {
  const path = resolve(projectRoot, "supabase/migrations", file);
  assert.ok(existsSync(path), `Migration missing: ${file}`);
  const sql = readFileSync(path, "utf8");
  assert.ok(sql.length > 100, `Migration empty: ${file}`);
}

console.log("✓ Migrations 157–163 present");

// ── Payment provider registry ────────────────────────────────

{
  const registry = PaymentProviderRegistry.createDefault();
  const codes = registry.list();
  assert.ok(codes.includes("stripe"), "Stripe provider registered");
  assert.ok(codes.includes("paymob"), "Paymob provider registered");
  assert.ok(codes.includes("fawry"), "Fawry provider registered");
  assert.ok(codes.includes("sandbox"), "Sandbox provider registered");
}

console.log("✓ Payment providers registered (Stripe, Paymob, Fawry, Sandbox)");

// ── Portal payment delegation ────────────────────────────────

{
  const portal = PortalPaymentService.createDefault();
  assert.ok(portal.getProvider("stripe"), "Portal Stripe adapter");
  assert.ok(portal.getProvider("paymob"), "Portal Paymob adapter");
  assert.ok(portal.getProvider("fawry"), "Portal Fawry adapter");
}

console.log("✓ Portal payments delegate to billing registry");

// ── Invoice PDF generation ───────────────────────────────────

{
  const bytes = buildMinimalPdf("Invoice TEST-001");
  assert.ok(bytes.length > 100, "PDF bytes generated");
  assert.ok(new TextDecoder().decode(bytes).includes("%PDF-1.4"), "Valid PDF header");

  const gen = new MinimalInvoicePdfGenerator();
  const result = await gen.generate({
    id: "inv-1",
    companyId: "co-1",
    customerId: "cust-1",
    bookingId: null,
    invoiceNumber: "INV-001",
    status: "issued",
    currency: "USD",
    subtotalCents: 10000,
    taxCents: 0,
    discountCents: 0,
    totalCents: 10000,
    paidCents: 0,
    version: 1,
    taxMode: "exclusive",
    branchId: null,
    notes: null,
    issuedAt: new Date().toISOString(),
    dueAt: null,
    paidAt: null,
    cancelledAt: null,
    lineItems: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.ok(result.blob instanceof Blob, "PDF blob created");
}

console.log("✓ Invoice PDF generator produces valid PDF");

// ── Webhook signature ────────────────────────────────────────

{
  assert.equal(verifyWebhookSignature("", "sig", "secret"), false);
  assert.equal(verifyWebhookSignature("payload", "", "secret"), false);
  assert.equal(
    verifyWebhookSignature("payload", "a".repeat(64), "s".repeat(16)),
    true,
  );
}

console.log("✓ Webhook signature validation");

// ── Event bus mapping ────────────────────────────────────────

{
  assert.equal(bookingEventToBusType("BookingCreated"), "booking.created");
  assert.equal(bookingEventToBusType("BookingCancelled"), "booking.cancelled");
  assert.equal(bookingEventToBusType("BookingCompleted"), "booking.completed");
  assert.equal(bookingEventToBusType("Unknown"), null);
}

console.log("✓ Booking → integration event mapping");

// ── Production hardening migration content ───────────────────

{
  const sql = readFileSync(
    resolve(projectRoot, "supabase/migrations/163_production_hardening.sql"),
    "utf8",
  );
  assert.ok(sql.includes("portal_start_auth_challenge"), "Portal OTP hardening");
  assert.ok(sql.includes("platform_health_check_v1"), "Health check RPC");
  assert.ok(sql.includes("integration_retry_dead_letter"), "Dead letter retry RPC");
  assert.ok(sql.includes("pdf_storage_path"), "Invoice PDF storage path");
  assert.ok(sql.includes("v_is_dev"), "Portal OTP dev mode gate");
}

console.log("✓ Production hardening migration verified");

console.log("\nPASS — Go-Live readiness checks complete\n");
