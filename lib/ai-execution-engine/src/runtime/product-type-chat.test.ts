import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectProductTypeIntent,
  looksLikeCompanyIntroQuestion,
  looksLikeCurrentCatalogFactQuestion,
  looksLikeProductCatalogQuestion,
  looksLikeSoftwareProductDescriptor,
  productTypeChatDef,
} from "./product-type-chat.js";

describe("product type chat lexicon", () => {
  it("treats generic product listing as the whole catalog", () => {
    assert.equal(detectProductTypeIntent("ايه المنتجات اللي عندك"), null);
    assert.equal(looksLikeProductCatalogQuestion("ايه المنتجات اللي عندك"), true);
    assert.equal(looksLikeProductCatalogQuestion("ممكن تقولي منتجاتك ايه"), true);
    assert.equal(looksLikeProductCatalogQuestion("وريني منتجاتكم"), true);
  });

  it("filters real estate and services by type", () => {
    assert.equal(detectProductTypeIntent("وريني العقارات"), "real_estate");
    assert.equal(detectProductTypeIntent("ايه الخدمات اللي عندك"), "service");
    assert.equal(detectProductTypeIntent("عندكم اشتراكات؟"), "subscription");
    assert.equal(productTypeChatDef("real_estate")?.listIntro, "العقارات المتاحة:");
  });

  it("ignores booking intents", () => {
    assert.equal(looksLikeProductCatalogQuestion("عايز احجز خدمة"), false);
  });

  it("does not treat company/services intro phrasing as catalog browse", () => {
    assert.equal(looksLikeCompanyIntroQuestion("ممكن تعرفني اكتر عن شركتكم"), true);
    assert.equal(looksLikeCompanyIntroQuestion("ممكن تعرفني عن خدماتكم"), true);
    assert.equal(looksLikeProductCatalogQuestion("ممكن تعرفني عن خدماتكم"), false);
    assert.equal(looksLikeProductCatalogQuestion("ايه الخدمات اللي عندك"), true);
  });

  it("treats clinic-system phrasing as a catalog product ask", () => {
    assert.equal(looksLikeSoftwareProductDescriptor("سيستم عيادات"), true);
    assert.equal(looksLikeSoftwareProductDescriptor("نظام إدارة العيادات"), true);
    assert.equal(looksLikeProductCatalogQuestion("سيستم عيادات"), true);
    assert.equal(looksLikeProductCatalogQuestion("عندكم سيستم للعيادات؟"), true);
    assert.equal(looksLikeCompanyIntroQuestion("ممكن تعرفني عن سيستم عيادات"), false);
    assert.equal(looksLikeProductCatalogQuestion("ممكن تعرفني عن سيستم عيادات"), true);
  });

  it("requires a catalog lookup for price, spec, and comparison, not for a demo or a greeting", () => {
    assert.equal(looksLikeCurrentCatalogFactQuestion("What is the price of Aurora Buds?"), true);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Does the Aurora Studio have noise cancelling?"), true);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Compare Aurora Buds and Aurora Studio."), true);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Are the Aurora Buds waterproof?"), true);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Hi, I am looking for headphones."), false);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Please book a product demo for tomorrow morning."), false);
    assert.equal(looksLikeCurrentCatalogFactQuestion("Please send me a formal quote."), false);
  });
});
