import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companyOrderConfigState,
  companyOrderSettingsToRow,
  DEFAULT_COMPANY_ORDER_SETTINGS,
  normalizeCompanyOrderSettings,
  validateCompanyOrderSettings,
} from "./company-order-settings.js";
import {
  DEFAULT_DELIVERY_ZONE_FORM,
  deliveryZoneToInsert,
  normalizeDeliveryZone,
  validateDeliveryZone,
} from "./company-delivery-zones.js";

describe("company order settings", () => {
  it("defaults AI collection off and human approval on for missing rows", () => {
    const form = normalizeCompanyOrderSettings(null);
    assert.equal(form.aiOrderCollectionEnabled, false);
    assert.equal(form.requireHumanApproval, true);
    assert.equal(form.notifyOnPendingApproval, true);
    assert.deepEqual(form.paymentMethods, ["cash_on_delivery"]);
    assert.equal(form.requiredFields.customerName, true);
    assert.equal(form.requiredFields.deliveryNotes, false);
    assert.equal(form.requiredFields.deliveryLocation, false);
    assert.equal(form.requiredFields.secondaryPhone, true);
    assert.equal(companyOrderConfigState(null), "unconfigured");
  });

  it("never invents unsupported payment methods", () => {
    const form = normalizeCompanyOrderSettings({
      payment_methods: ["cash_on_delivery", "card", "paypal"],
      require_human_approval: false,
      ai_order_collection_enabled: true,
    });
    assert.deepEqual(form.paymentMethods, ["cash_on_delivery"]);
    assert.equal(form.requireHumanApproval, false);
    assert.equal(form.aiOrderCollectionEnabled, true);
  });

  it("scopes upsert payload to the provided company id", () => {
    const row = companyOrderSettingsToRow("company-a", {
      ...DEFAULT_COMPANY_ORDER_SETTINGS,
      aiOrderCollectionEnabled: true,
      defaultReviewerProfileId: " reviewer-1 ",
    });
    assert.equal(row.company_id, "company-a");
    assert.equal(row.ai_order_collection_enabled, true);
    assert.equal(row.require_human_approval, true);
    assert.equal(row.default_reviewer_profile_id, "reviewer-1");
    assert.deepEqual(row.payment_methods, ["cash_on_delivery"]);
  });

  it("rejects empty payment methods", () => {
    assert.equal(
      validateCompanyOrderSettings({
        ...DEFAULT_COMPANY_ORDER_SETTINGS,
        paymentMethods: [],
      }),
      "payment_methods_required",
    );
  });

  it("defaults delivery assignment mode to manual and persists ai", () => {
    const form = normalizeCompanyOrderSettings(null);
    assert.equal(form.deliveryAssignmentMode, "manual");
    const row = companyOrderSettingsToRow("company-a", {
      ...DEFAULT_COMPANY_ORDER_SETTINGS,
      deliveryAssignmentMode: "ai",
    });
    assert.equal(row.delivery_assignment_mode, "ai");
  });
});

describe("company delivery zones", () => {
  it("rejects missing governorate/zone and eta_min > eta_max", () => {
    assert.equal(validateDeliveryZone({ ...DEFAULT_DELIVERY_ZONE_FORM, governorate: "" }), "governorate_required");
    assert.equal(
      validateDeliveryZone({ ...DEFAULT_DELIVERY_ZONE_FORM, governorate: "Cairo", zoneName: "" }),
      "zone_name_required",
    );
    assert.equal(
      validateDeliveryZone({
        ...DEFAULT_DELIVERY_ZONE_FORM,
        governorate: "Cairo",
        zoneName: "Nasr City",
        etaMin: 5,
        etaMax: 2,
      }),
      "eta_min_exceeds_max",
    );
  });

  it("rejects negative delivery fees", () => {
    assert.equal(
      validateDeliveryZone({
        ...DEFAULT_DELIVERY_ZONE_FORM,
        governorate: "Cairo",
        zoneName: "Maadi",
        deliveryFee: -1,
      }),
      "delivery_fee_invalid",
    );
  });

  it("scopes inserts to company and normalizes ETA range", () => {
    const insert = deliveryZoneToInsert("company-b", {
      governorate: " Giza ",
      zoneName: " Dokki ",
      aliasesText: "الدقي، الدقى",
      enabled: true,
      deliveryFee: 25,
      etaMin: 2,
      etaMax: 1,
      etaUnit: "hours",
    });
    assert.equal(insert.company_id, "company-b");
    assert.equal(insert.governorate, "Giza");
    assert.equal(insert.zone_name, "Dokki");
    assert.deepEqual(insert.aliases, ["الدقي", "الدقى"]);
    assert.equal(insert.eta_min, 2);
    assert.equal(insert.eta_max, 2);
    assert.equal(insert.eta_unit, "hours");
    assert.equal(insert.delivery_fee, 25);
  });

  it("normalizes rows without inventing governorates", () => {
    const zone = normalizeDeliveryZone({
      id: "z1",
      company_id: "company-b",
      governorate: "Alexandria",
      zone_name: "Smouha",
      aliases: ["سموحه"],
      enabled: true,
      delivery_fee: "15.50",
      eta_min: 1,
      eta_max: 2,
      eta_unit: "days",
    });
    assert.equal(zone.governorate, "Alexandria");
    assert.equal(zone.zoneName, "Smouha");
    assert.equal(zone.aliasesText, "سموحه");
    assert.equal(zone.deliveryFee, 15.5);
    assert.equal(zone.etaUnit, "days");
  });
});
