import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDocumentTitle } from "./format-document-title.ts";
import {
  resolveDocumentDescription,
  resolveDocumentPageName,
  resolveDocumentTitle,
} from "./resolve-document-title.ts";

const LABELS: Record<string, string> = {
  "documentTitle.login": "Login",
  "documentTitle.register": "Register",
  "documentTitle.forgotPassword": "Forgot Password",
  "documentTitle.resetPassword": "Reset Password",
  "documentTitle.authCallback": "Signing In",
  "documentTitle.dashboard": "Dashboard",
  "documentTitle.notFound": "Page Not Found",
  "documentTitle.booking": "Book Appointment",
  "documentTitle.bookingFlow": "Booking",
  "documentTitle.portal": "Customer Portal",
  "documentTitle.portalLogin": "Portal Login",
  "documentTitle.checkIn": "Check In",
  "documentTitle.workflowDebug": "Workflow Builder",
  "documentTitle.privacyPolicy": "ValueOR Privacy Policy",
  "documentTitle.dataDeletion": "Data Deletion",
  "documentTitle.terms": "Terms of Service",
  "documentMeta.default": "ValueOR — AI-powered CRM and operations platform.",
  "documentMeta.privacyPolicy":
    "ValueOR Privacy Policy: how we collect, use, and protect personal data, including WhatsApp and Instagram messaging data.",
  "documentMeta.dataDeletion":
    "Request deletion of your ValueOR personal data, including data processed through WhatsApp and Instagram integrations.",
  "documentMeta.terms": "ValueOR Terms of Service for the CRM, automation, and messaging platform.",
  "navigation.customers": "Customers",
  "navigation.tickets": "Tickets",
  "navigation.bookings": "Bookings",
  "navigation.aiEmployees": "AI Employees",
  "navigation.settings": "Settings",
  "navigation.home": "Home",
  "dashboard.breadcrumbs.root": "Dashboard",
  "common.notifications": "Notifications",
  "appShell.breadcrumbs.detail": "Details",
};

function t(key: string, options?: { defaultValue?: string }): string {
  return LABELS[key] ?? options?.defaultValue ?? key;
}

describe("formatDocumentTitle", () => {
  it("formats page name with ValueOR brand", () => {
    assert.equal(formatDocumentTitle("Login"), "Login | ValueOR");
    assert.equal(formatDocumentTitle("Customers"), "Customers | ValueOR");
  });

  it("returns brand alone when page name is empty", () => {
    assert.equal(formatDocumentTitle(""), "ValueOR");
    assert.equal(formatDocumentTitle("ValueOR"), "ValueOR");
  });
});

describe("resolveDocumentTitle", () => {
  it("resolves auth routes", () => {
    assert.equal(resolveDocumentTitle("/login", t), "Login | ValueOR");
    assert.equal(resolveDocumentTitle("/register", t), "Register | ValueOR");
    assert.equal(resolveDocumentTitle("/forgot-password", t), "Forgot Password | ValueOR");
    assert.equal(resolveDocumentTitle("/reset-password", t), "Reset Password | ValueOR");
  });

  it("resolves dashboard home as Dashboard", () => {
    assert.equal(resolveDocumentTitle("/dashboard", t), "Dashboard | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/", t), "Dashboard | ValueOR");
  });

  it("resolves known dashboard sections", () => {
    assert.equal(resolveDocumentTitle("/dashboard/customers", t), "Customers | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/tickets", t), "Tickets | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/bookings", t), "Bookings | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/agents", t), "AI Employees | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/settings", t), "Settings | ValueOR");
  });

  it("resolves notification detail outside section registry", () => {
    assert.equal(
      resolveDocumentTitle("/dashboard/notifications/abc", t),
      "Notifications | ValueOR",
    );
  });

  it("resolves public legal routes without requiring authentication", () => {
    assert.equal(resolveDocumentTitle("/privacy-policy", t), "ValueOR Privacy Policy");
    assert.equal(resolveDocumentTitle("/data-deletion", t), "Data Deletion | ValueOR");
    assert.equal(resolveDocumentTitle("/terms", t), "Terms of Service | ValueOR");
  });

  it("resolves legal meta descriptions", () => {
    assert.match(resolveDocumentDescription("/privacy-policy", t), /WhatsApp and Instagram/);
    assert.match(resolveDocumentDescription("/data-deletion", t), /deletion/);
    assert.match(resolveDocumentDescription("/terms", t), /Terms of Service/);
  });

  it("resolves portal and booking routes", () => {
    assert.equal(resolveDocumentTitle("/book/acme", t), "Book Appointment | ValueOR");
    assert.equal(resolveDocumentTitle("/portal/acme/login", t), "Portal Login | ValueOR");
    assert.equal(resolveDocumentTitle("/check-in/token-1", t), "Check In | ValueOR");
  });

  it("uses page-not-found for unknown routes", () => {
    assert.equal(resolveDocumentTitle("/nope", t), "Page Not Found | ValueOR");
    assert.equal(resolveDocumentTitle("/dashboard/not-a-real-section", t), "Page Not Found | ValueOR");
  });

  it("exposes page name without brand via resolveDocumentPageName", () => {
    assert.equal(resolveDocumentPageName("/login", t), "Login");
  });
});
