import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deliveryZoneMatchesInput,
  findAllMatchingDeliveryZones,
  findMatchingDeliveryZone,
} from "./delivery-zone-match.js";

describe("delivery-zone-match", () => {
  const nasr = {
    id: "1",
    governorate: "Cairo",
    zoneName: "Nasr City",
    aliases: ["مدينة نصر"],
  };
  const maadi = {
    id: "2",
    governorate: "Cairo",
    zoneName: "Maadi",
    aliases: ["المعادي"],
  };

  it("matches English customer input to English zone", () => {
    assert.equal(
      deliveryZoneMatchesInput(nasr, { governorate: "Cairo", zoneName: "Nasr City" }),
      true,
    );
  });

  it("matches Arabic and Madinet Nasr / El Maadi variants", () => {
    assert.equal(
      deliveryZoneMatchesInput(nasr, { governorate: "القاهرة", zoneName: "مدينة نصر" }),
      true,
    );
    assert.equal(
      deliveryZoneMatchesInput(nasr, { governorate: "Cairo", zoneName: "Madinet Nasr" }),
      true,
    );
    assert.equal(
      deliveryZoneMatchesInput(maadi, { governorate: "القاهره", zoneName: "المعادي" }),
      true,
    );
    assert.equal(
      deliveryZoneMatchesInput(maadi, { governorate: "Cairo", zoneName: "El Maadi" }),
      true,
    );
  });

  it("returns null for ambiguous multi-match via findMatchingDeliveryZone", () => {
    const overlapping = [
      nasr,
      { id: "3", governorate: "Cairo", zoneName: "Nasr City East", aliases: ["مدينة نصر"] },
    ];
    const single = findMatchingDeliveryZone(overlapping, {
      governorate: "Cairo",
      zoneName: "مدينة نصر",
    });
    assert.equal(single, null);
    const all = findAllMatchingDeliveryZones(overlapping, {
      governorate: "Cairo",
      zoneName: "مدينة نصر",
    });
    assert.equal(all.length, 2);
  });

  it("findMatchingDeliveryZone returns the right row for unique match", () => {
    const hit = findMatchingDeliveryZone([nasr, maadi], {
      governorate: "القاهرة",
      zoneName: "المعادي",
    });
    assert.equal(hit?.id, "2");
  });

  it("does not match unrelated zones", () => {
    assert.equal(
      deliveryZoneMatchesInput(nasr, { governorate: "Cairo", zoneName: "Maadi" }),
      false,
    );
  });
});
