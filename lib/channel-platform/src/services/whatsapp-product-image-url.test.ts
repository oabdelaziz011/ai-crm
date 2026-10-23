import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companyBrandingObjectPath,
  sanitizeCompanyBrandingObjectPath,
  toWhatsAppFetchableProductImageUrl,
} from "./whatsapp-product-image-url.js";

describe("whatsapp product image urls", () => {
  it("keeps public https catalog urls", () => {
    const url = "https://cdn.example/co/a.jpg";
    assert.equal(toWhatsAppFetchableProductImageUrl(url, {}), url);
  });

  it("rewrites local supabase branding urls through the public webhook base", () => {
    const local =
      "http://127.0.0.1:54321/storage/v1/object/public/company-branding/2d27f7fb-c15e-4d60-84e9-1793f36f2172/product-gallery/a.jpg";
    const out = toWhatsAppFetchableProductImageUrl(local, {
      PUBLIC_WEBHOOK_BASE_URL: "https://webhook-windows.valueor.org",
    });
    assert.equal(
      out,
      "https://webhook-windows.valueor.org/api/public/company-branding/2d27f7fb-c15e-4d60-84e9-1793f36f2172/product-gallery/a.jpg",
    );
  });

  it("drops local urls when no public webhook base is configured", () => {
    const local =
      "http://127.0.0.1:54321/storage/v1/object/public/company-branding/2d27f7fb-c15e-4d60-84e9-1793f36f2172/product-gallery/a.jpg";
    assert.equal(toWhatsAppFetchableProductImageUrl(local, {}), null);
  });

  it("rejects path traversal in branding object paths", () => {
    assert.equal(sanitizeCompanyBrandingObjectPath("2d27f7fb-c15e-4d60-84e9-1793f36f2172/../secret"), null);
    assert.equal(
      companyBrandingObjectPath(
        "http://127.0.0.1:54321/storage/v1/object/public/company-branding/2d27f7fb-c15e-4d60-84e9-1793f36f2172/product-gallery/a.jpg",
      ),
      "2d27f7fb-c15e-4d60-84e9-1793f36f2172/product-gallery/a.jpg",
    );
  });
});
