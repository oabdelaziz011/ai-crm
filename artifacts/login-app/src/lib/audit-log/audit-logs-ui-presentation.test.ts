/**
 * Audit Logs UI presentation — entity labels + fallback key resolution.
 * No DB / WhatsApp / cancel behavior.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getEntityLabelKey } from "./mapping.ts";
import { buildActivitySummary } from "./activity-summary.ts";
import type { LookupContext } from "./presenter.ts";
import type { EnrichedAuditLog } from "../types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(
  readFileSync(join(__dirname, "../../locales/en/common.json"), "utf8"),
) as Record<string, unknown>;
const ar = JSON.parse(
  readFileSync(join(__dirname, "../../locales/ar/common.json"), "utf8"),
) as Record<string, unknown>;

function dig(root: Record<string, unknown>, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function makeT(locale: "en" | "ar") {
  const tree = locale === "en" ? en : ar;
  return ((key: string, opts?: Record<string, unknown>) => {
    const value = dig(tree, key);
    if (typeof value !== "string") {
      // Mirror i18next missing-key behavior used in production before the fix.
      return key;
    }
    if (!opts) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
      opts[name] == null ? "" : String(opts[name]),
    );
  }) as never;
}

const emptyContext: LookupContext = {
  userNames: new Map(),
  companyNames: new Map(),
  roleNames: new Map(),
  permissionCodes: new Map(),
};

function log(partial: Partial<EnrichedAuditLog>): EnrichedAuditLog {
  return {
    id: "a1",
    user_id: "u1",
    company_id: "co-1",
    action: "CREATE",
    entity: "customers",
    entity_id: "x",
    ip_address: null,
    metadata: {},
    created_at: "2026-08-29T12:00:00.000Z",
    profile: { id: "u1", full_name: "Ada Admin", email: "ada@example.com" },
    company: null,
    actorRoleName: null,
    entityDisplayName: null,
    resolvedReferences: {
      companyNames: {},
      roleNames: {},
      userNames: {},
      permissionCodes: {},
    },
    ...partial,
  } as EnrichedAuditLog;
}

describe("auditLogs.fallbacks.unknown locale key", () => {
  it("exists in English and Arabic", () => {
    assert.equal(dig(en, "auditLogs.fallbacks.unknown"), "Unknown");
    assert.equal(dig(ar, "auditLogs.fallbacks.unknown"), "غير معروف");
  });

  it("resolves via t() instead of returning the raw key", () => {
    const tEn = makeT("en");
    const tAr = makeT("ar");
    assert.equal(tEn("auditLogs.fallbacks.unknown"), "Unknown");
    assert.equal(tAr("auditLogs.fallbacks.unknown"), "غير معروف");
    assert.notEqual(tEn("auditLogs.fallbacks.unknown"), "auditLogs.fallbacks.unknown");
  });
});

describe("entity label registry", () => {
  it("maps business_appointment_exceptions to a human-readable EN/AR label", () => {
    const key = getEntityLabelKey("business_appointment_exceptions");
    assert.equal(key, "auditLogs.entities.businessAppointmentExceptions");
    assert.equal(makeT("en")(key), "Business Appointment Exception");
    assert.equal(makeT("ar")(key), "استثناء مواعيد العمل");
  });

  it("maps business_appointment_exception_items correctly", () => {
    const key = getEntityLabelKey("business_appointment_exception_items");
    assert.equal(makeT("en")(key), "Exception Item");
    assert.equal(makeT("ar")(key), "عنصر استثناء");
  });

  it("maps scheduling_bookings correctly", () => {
    const key = getEntityLabelKey("scheduling_bookings");
    assert.equal(makeT("en")(key), "Booking");
    assert.equal(makeT("ar")(key), "حجز");
  });

  it("keeps existing known entities resolving", () => {
    assert.equal(makeT("en")(getEntityLabelKey("customers")), "Customers");
    assert.equal(makeT("en")(getEntityLabelKey("profiles")), "Users");
    assert.equal(makeT("ar")(getEntityLabelKey("customers")), "العملاء");
  });

  it("unknown entities safely use the record fallback", () => {
    const key = getEntityLabelKey("totally_unknown_entity_xyz");
    assert.equal(key, "auditLogs.entities.record");
    assert.equal(makeT("en")(key), "Record");
  });
});

describe("activity summaries without raw fallback keys", () => {
  it("does not emit auditLogs.fallbacks.unknown for sparse exception CREATE", () => {
    const summary = buildActivitySummary(
      log({
        action: "CREATE",
        entity: "business_appointment_exceptions",
        metadata: {},
      }),
      emptyContext,
      makeT("en"),
    );
    assert.doesNotMatch(summary, /auditLogs\.fallbacks\.unknown/);
    assert.match(summary, /Business Appointment Exception/);
  });

  it("uses rich exception metadata when present (EN)", () => {
    const summary = buildActivitySummary(
      log({
        action: "CREATE",
        entity: "business_appointment_exceptions",
        metadata: {
          scope: "full_day",
          exception_date: "2026-08-05",
        },
      }),
      emptyContext,
      makeT("en"),
    );
    assert.match(summary, /full_day/);
    assert.match(summary, /2026-08-05/);
    assert.doesNotMatch(summary, /auditLogs\./);
  });

  it("summarizes exception items without raw keys when metadata sparse", () => {
    const summary = buildActivitySummary(
      log({
        action: "UPDATE",
        entity: "business_appointment_exception_items",
        metadata: {},
      }),
      emptyContext,
      makeT("en"),
    );
    assert.doesNotMatch(summary, /auditLogs\.fallbacks\.unknown/);
    assert.match(summary, /Exception Item/);
  });

  it("summarizes scheduling_bookings with Booking label when metadata sparse", () => {
    const summary = buildActivitySummary(
      log({
        action: "UPDATE",
        entity: "scheduling_bookings",
        metadata: {},
      }),
      emptyContext,
      makeT("en"),
    );
    assert.doesNotMatch(summary, /auditLogs\.fallbacks\.unknown/);
    assert.match(summary, /Booking/);
  });

  it("Arabic sparse exception CREATE uses localized entity label", () => {
    const summary = buildActivitySummary(
      log({
        action: "CREATE",
        entity: "business_appointment_exceptions",
        metadata: {},
      }),
      emptyContext,
      makeT("ar"),
    );
    assert.doesNotMatch(summary, /auditLogs\.fallbacks\.unknown/);
    assert.match(summary, /استثناء مواعيد العمل/);
  });
});
