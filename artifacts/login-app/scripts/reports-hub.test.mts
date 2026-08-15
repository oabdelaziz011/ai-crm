/**
 * Reports workspace — catalog access, dropdown selection, filters.
 * Run: npx --yes tsx --test scripts/reports-hub.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { REPORT_CATALOG } from "../src/lib/reports/report-catalog.ts";
import {
  filterAvailableReports,
  isReportAccessible,
  resolveSelectedReportId,
} from "../src/lib/reports/report-access.ts";
import { isDateInRange } from "../src/lib/reports/reports-filters.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("report catalog access", () => {
  it("hides bookings report without bookings module", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (p: string) => p === "reports.view" || p === "bookings.view",
      isModuleEnabled: (code: string) => (code === "bookings" ? false : true),
      canViewReportsHub: true,
    };
    assert.equal(
      isReportAccessible(REPORT_CATALOG.find((r) => r.id === "bookings")!, ctx),
      false,
    );
  });

  it("allows report via dedicated report permission", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (p: string) => p === "reports.view" || p === "reports.bookings",
      isModuleEnabled: () => true,
      canViewReportsHub: true,
    };
    assert.equal(
      isReportAccessible(REPORT_CATALOG.find((r) => r.id === "bookings")!, ctx),
      true,
    );
  });

  it("hides advanced-only reports when entitlement missing", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: () => true,
      isModuleEnabled: (code: string) => code !== "advanced_reports",
      canViewReportsHub: true,
    };
    const advanced = REPORT_CATALOG.filter((r) => r.requiresAdvancedReports);
    for (const report of advanced) {
      assert.equal(isReportAccessible(report, ctx), false, report.id);
    }
  });

  it("includes ai consumption and unlocks executive/ai ops inline", () => {
    const ids = REPORT_CATALOG.map((r) => r.id);
    assert.ok(ids.includes("ai_consumption"));
    assert.ok(!ids.includes("ai_operations" as never));
    assert.ok(ids.includes("executive"));
    assert.equal(REPORT_CATALOG.find((r) => r.id === "executive")?.requiresAdvancedReports, false);
  });

  it("aliases legacy ai_operations to ai_consumption", () => {
    const available = REPORT_CATALOG.filter((r) => r.id === "overview" || r.id === "ai_consumption");
    assert.equal(resolveSelectedReportId("ai_operations", available), "ai_consumption");
  });

  it("dropdown defaults to overview, never invents bookings", () => {
    const available = REPORT_CATALOG.filter((r) => r.id === "overview" || r.id === "bookings");
    assert.equal(resolveSelectedReportId(null, available), "overview");
    assert.equal(resolveSelectedReportId("bookings", available), "bookings");
    assert.equal(resolveSelectedReportId("missing", available), "overview");
  });

  it("catalog covers core system modules including companies revenue", () => {
    const ids = REPORT_CATALOG.map((r) => r.id);
    for (const id of [
      "overview",
      "bookings",
      "customers",
      "leads",
      "opportunities",
      "tickets",
      "invoices",
      "financial",
      "operations",
      "companies",
      "company_revenue",
      "subscriptions",
    ]) {
      assert.ok(ids.includes(id as never), id);
    }
  });

  it("catalog has no deep-link route fields", () => {
    for (const report of REPORT_CATALOG) {
      assert.equal(
        "deepLinkRouteId" in report,
        false,
        `${report.id} must render inline without deep links`,
      );
    }
  });
});

describe("date filter", () => {
  it("filters dates inclusively", () => {
    assert.equal(isDateInRange("2026-03-15", { from: "2026-03-01", to: "2026-03-31" }), true);
    assert.equal(isDateInRange("2026-02-28", { from: "2026-03-01", to: "2026-03-31" }), false);
  });
});

describe("reports hub wiring", () => {
  it("uses report dropdown + branch + date filters", () => {
    const hub = readFileSync(join(root, "src/components/reports/reports-hub.tsx"), "utf8");
    assert.match(hub, /SelectItem/);
    assert.match(hub, /reportType/);
    assert.match(hub, /BranchSelector/);
    assert.match(hub, /dateFrom|type=\"date\"/);
    assert.match(hub, /saveReportView|Save view/);
    assert.match(hub, /saveReportSchedule|Schedule/);
    assert.match(hub, /exportReportPdf|PDF/);
    assert.doesNotMatch(hub, /1,250,000|92%/);
  });

  it("report viewer never navigates to other modules", () => {
    const viewer = readFileSync(join(root, "src/components/reports/report-viewer.tsx"), "utf8");
    assert.doesNotMatch(viewer, /DeepLinkCard/);
    assert.doesNotMatch(viewer, /setLocation/);
    assert.doesNotMatch(viewer, /openFull|openModuleHint/);
    assert.match(viewer, /ReportDataTable|ReportKpiStrip/);
    assert.match(viewer, /companies|company_revenue|subscriptions/);
  });

  it("select viewport is scrollable (not locked to trigger height)", () => {
    const select = readFileSync(join(root, "src/components/ui/select.tsx"), "utf8");
    assert.doesNotMatch(select, /h-\[var\(--radix-select-trigger-height\)\]/);
    assert.match(select, /overflow-y-auto/);
    assert.match(select, /max-h-\[min\(320px/);
  });

  it("EN/AR keys for new workspace features exist", () => {
    const en = readFileSync(join(root, "src/locales/en/common.json"), "utf8");
    const ar = readFileSync(join(root, "src/locales/ar/common.json"), "utf8");
    for (const key of [
      "dateFrom",
      "dateTo",
      "saveView",
      "schedule",
      "opportunitiesDesc",
      "ticketsDesc",
      "operations",
      "companies",
      "companyRevenue",
      "subscriptions",
      "centerSubtitleStrong",
      "aiConsumption",
      "consumptionRate",
      "todayRevenue",
    ]) {
      assert.match(en, new RegExp(key));
      assert.match(ar, new RegExp(key));
    }
  });

  it("migration 277 seeds report permissions and schedule tables", () => {
    const sql = readFileSync(
      join(root, "../../supabase/migrations/277_reports_workspace_foundation.sql"),
      "utf8",
    );
    assert.match(sql, /reports\.bookings/);
    assert.match(sql, /report_saved_views/);
    assert.match(sql, /report_schedules/);
  });

  it("migration 278 seeds companies revenue permissions", () => {
    const sql = readFileSync(
      join(root, "../../supabase/migrations/278_reports_companies_revenue_permissions.sql"),
      "utf8",
    );
    assert.match(sql, /reports\.companies/);
    assert.match(sql, /reports\.company_revenue/);
    assert.match(sql, /reports\.subscriptions/);
  });
});
