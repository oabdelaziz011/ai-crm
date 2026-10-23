import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recommendFromCatalog, type RecommendationCandidate } from "./product-recommendation.js";

const camera: RecommendationCandidate = {
  productId: "p-camera",
  name: "Travel Camera",
  sku: "CAM-1",
  brand: "ValueOR",
  summary: "Compact camera for travel",
  price: { status: "listed", amount: 400, currency: "EGP" },
  active: true,
  imageUrls: ["https://cdn.example/cam.jpg", "http://insecure.example/cam.jpg", "not-a-url"],
};

const printer: RecommendationCandidate = {
  productId: "p-printer",
  name: "Office Printer",
  sku: "PRN-1",
  summary: "Printer for documents",
  price: { status: "listed", amount: 900, currency: "EGP" },
  active: true,
};

const unpriced: RecommendationCandidate = {
  productId: "p-unpriced",
  name: "Travel Camera Mini",
  sku: "CAM-0",
  summary: "camera",
  price: { status: "not_listed" },
  active: true,
};

const inactive: RecommendationCandidate = {
  productId: "p-old",
  name: "Travel Camera Old",
  sku: "CAM-X",
  summary: "camera travel",
  active: false,
  price: { status: "listed", amount: 100, currency: "EGP" },
};

describe("recommendFromCatalog", () => {
  it("ranks a need without a product name using catalog text only", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need something for travel" }],
      products: [printer, camera],
      showPrices: true,
    });
    assert.equal(decision.action, "recommend");
    assert.equal(decision.products[0]?.productId, "p-camera");
    assert.match(decision.customerText, /Travel Camera/);
    assert.doesNotMatch(decision.customerText, /warranty|discount|delivery|free/i);
    assert.deepEqual(decision.products[0]?.imageUrls, ["https://cdn.example/cam.jpg"]);
  });

  it("puts a named product first", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I want the Office Printer" }],
      products: [camera, printer],
      showPrices: true,
    });
    assert.equal(decision.products[0]?.productId, "p-printer");
    assert.match(decision.products[0]?.reasons[0] ?? "", /name/i);
  });

  it("asks for clarification when the request has no usable need", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "recommend" }],
      products: [camera],
      showPrices: true,
    });
    assert.equal(decision.action, "clarify");
    assert.equal(decision.products.length, 0);
  });

  it("filters by budget and does not treat a missing price as free", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need a camera budget 500" }],
      products: [printer, camera, unpriced],
      showPrices: true,
    });
    assert.equal(decision.action, "recommend");
    assert.deepEqual(decision.products.map((product) => product.productId), ["p-camera"]);
  });

  it("hides prices when the company price gate is closed", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need a camera for travel" }],
      products: [camera],
      showPrices: false,
    });
    assert.equal(decision.products[0]?.price.status, "not_listed");
    assert.doesNotMatch(decision.customerText, /400/);
  });

  it("does not treat the customer's phone number as a second budget", () => {
    const decision = recommendFromCatalog({
      messages: [
        {
          role: "customer",
          text: "عايز أشتري منتج عيادة. اسمي سارة اختبار. الإيميل sara.remediation@example.test والموبايل 01000000991. الميزانية 5000 جنيه.",
        },
      ],
      products: [camera],
      showPrices: true,
    });
    assert.notEqual(decision.action, "contradictory");
    assert.doesNotMatch(decision.customerText, /اتجاهين مختلفين/);
  });

  it("treats contradictory requirements as a clarification", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need a cheap luxury camera" }],
      products: [camera],
      showPrices: true,
    });
    assert.equal(decision.action, "contradictory");
    assert.equal(decision.products.length, 0);
  });

  it("uses the later requirement after the customer changes their mind", () => {
    const decision = recommendFromCatalog({
      messages: [
        { role: "customer", text: "I need a camera for travel" },
        { role: "customer", text: "instead I need a printer" },
      ],
      products: [camera, printer],
      showPrices: true,
    });
    assert.equal(decision.products[0]?.productId, "p-printer");
    assert.equal(decision.products.some((product) => product.productId === "p-camera"), false);
  });

  it("returns no match, skips inactive products, and never invents a catalog row", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need a telescope" }],
      products: [camera, inactive],
      showPrices: true,
    });
    assert.equal(decision.action, "no_match");
    assert.equal(decision.products.length, 0);
    assert.doesNotMatch(decision.customerText, /Travel Camera/);
  });

  it("does not repeat a recommendation that was already presented", () => {
    const decision = recommendFromCatalog({
      messages: [{ role: "customer", text: "I need a camera for travel" }],
      products: [camera],
      showPrices: true,
      previouslyRecommendedIds: ["p-camera"],
    });
    assert.equal(decision.action, "already_presented");
    assert.equal(decision.products.length, 0);
  });

  it("stops after a decline or an explicit opt-out", () => {
    const declined = recommendFromCatalog({
      messages: [
        { role: "customer", text: "I need a camera for travel" },
        { role: "assistant", text: "Travel Camera" },
        { role: "customer", text: "no thanks" },
      ],
      products: [camera],
      showPrices: true,
    });
    const optedOut = recommendFromCatalog({
      messages: [{ role: "customer", text: "don't recommend products" }],
      products: [camera],
      showPrices: true,
    });
    assert.equal(declined.action, "declined");
    assert.equal(optedOut.action, "opt_out");
    assert.equal(declined.products.length, 0);
    assert.equal(optedOut.products.length, 0);
  });

  it("keeps Arabic, English, and German replies in the last clear customer language", () => {
    const arabic = recommendFromCatalog({
      messages: [
        { role: "customer", text: "I need a camera" },
        { role: "customer", text: "كاميرا" },
      ],
      products: [],
      showPrices: false,
    });
    const german = recommendFromCatalog({
      messages: [{ role: "customer", text: "Ich brauche bitte eine Empfehlung" }],
      products: [],
      showPrices: false,
    });
    assert.equal(arabic.language, "ar");
    assert.match(arabic.customerText, /كتالوج|استخدام|منتج/);
    assert.equal(german.language, "de");
    assert.match(german.customerText, /Katalog|Budget|Produkt/);
  });
});
