import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLookupPriceDisplay,
  withSelectionDisplayVariables,
  withServicePriceFields,
} from "./selection-display-fields.js";
import { interpolateTemplateString } from "../logic/expression-engine.js";

describe("selection display fields", () => {
  it("formats price_cents for customer-facing templates", () => {
    assert.equal(formatLookupPriceDisplay(100), "1");
    assert.equal(formatLookupPriceDisplay(15050), "150.50");
    assert.equal(formatLookupPriceDisplay(0), null);
    assert.equal(formatLookupPriceDisplay("25000"), "250");
  });

  it("copies the selected service price onto a doctor record", () => {
    const priced = withServicePriceFields(
      { id: "doc-1", name: "Youssef Kamal" },
      { price_cents: 25000, currency: "EGP" },
    );
    assert.equal(priced.price_display, "250");
    assert.equal(priced.price_cents, 25000);
    assert.equal(priced.currency, "EGP");
    assert.equal(priced.name, "Youssef Kamal");
  });

  it("fills selected_resource.price_display from the selected service", () => {
    const next = withSelectionDisplayVariables({
      selected_service: { id: "svc-1", name: "عياده باطنة", price_cents: 25000, currency: "EGP" },
      selected_resource: { id: "doc-1", name: "Youssef Kamal" },
    });
    const resource = next.selected_resource as Record<string, unknown>;
    const service = next.selected_service as Record<string, unknown>;
    assert.equal(resource.price_display, "250");
    assert.equal(service.price_display, "250");
    assert.equal(resource.name, "Youssef Kamal");

    const text = interpolateTemplateString(
      "سعر الكشف عند د. {{selected_resource.name}}: {{selected_resource.price_display}} ج.م",
      next,
    );
    assert.equal(text, "سعر الكشف عند د. Youssef Kamal: 250 ج.م");
  });
});
