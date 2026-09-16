import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerAvatarObjectPath,
  extractCustomerAvatarStoragePath,
  isOwnedCustomerAvatarUrl,
  validateCustomerAvatarImage,
} from "./customer-avatar-path.ts";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MAX_BYTES = 512 * 1024;

describe("customer avatar path helpers", () => {
  it("builds tenant-scoped object paths without path traversal", () => {
    const path = buildCustomerAvatarObjectPath({
      companyId: COMPANY_A,
      customerId: CUSTOMER_A,
      mimeType: "image/png",
      now: 1700000000000,
    });
    assert.equal(path, `${COMPANY_A}/customers/${CUSTOMER_A}/avatar-1700000000000.png`);
  });

  it("rejects path traversal in company/customer ids", () => {
    assert.throws(
      () =>
        buildCustomerAvatarObjectPath({
          companyId: "../evil",
          customerId: CUSTOMER_A,
          mimeType: "image/png",
        }),
      /Invalid company/i,
    );
    assert.throws(
      () =>
        buildCustomerAvatarObjectPath({
          companyId: COMPANY_A,
          customerId: "cust/../../x",
          mimeType: "image/jpeg",
        }),
      /Invalid customer/i,
    );
  });

  it("validates supported image types and size", () => {
    const ok = validateCustomerAvatarImage(
      { name: "a.png", type: "image/png", size: 12 },
      MAX_BYTES,
    );
    assert.equal(ok.ok, true);

    const badType = validateCustomerAvatarImage(
      { name: "a.svg", type: "image/svg+xml", size: 12 },
      MAX_BYTES,
    );
    assert.equal(badType.ok, false);
    if (!badType.ok) assert.equal(badType.code, "unsupported_type");

    const tooLarge = validateCustomerAvatarImage(
      { name: "big.jpg", type: "image/jpeg", size: 600 * 1024 },
      MAX_BYTES,
    );
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.code, "too_large");
  });

  it("accepts only owned customer-avatars URLs for the same company/customer", () => {
    const ownedUrl = `https://proj.supabase.co/storage/v1/object/public/customer-avatars/${COMPANY_A}/customers/${CUSTOMER_A}/avatar-1.jpg`;
    assert.equal(
      isOwnedCustomerAvatarUrl({
        companyId: COMPANY_A,
        customerId: CUSTOMER_A,
        avatarUrl: ownedUrl,
      }),
      true,
    );

    assert.equal(
      isOwnedCustomerAvatarUrl({
        companyId: COMPANY_B,
        customerId: CUSTOMER_A,
        avatarUrl: ownedUrl,
      }),
      false,
    );

    assert.equal(
      isOwnedCustomerAvatarUrl({
        companyId: COMPANY_A,
        customerId: CUSTOMER_B,
        avatarUrl: ownedUrl,
      }),
      false,
    );

    assert.equal(
      isOwnedCustomerAvatarUrl({
        companyId: COMPANY_A,
        customerId: CUSTOMER_A,
        avatarUrl: "https://evil.example/photo.jpg",
      }),
      false,
    );

    assert.equal(
      isOwnedCustomerAvatarUrl({
        companyId: COMPANY_A,
        customerId: CUSTOMER_A,
        avatarUrl: null,
      }),
      true,
    );
  });

  it("extracts storage paths from public URLs and strips cache-bust query", () => {
    const path = `${COMPANY_A}/customers/${CUSTOMER_A}/avatar-9.webp`;
    const url = `https://proj.supabase.co/storage/v1/object/public/customer-avatars/${path}?v=123`;
    assert.equal(extractCustomerAvatarStoragePath(url), path);
    assert.equal(extractCustomerAvatarStoragePath(path), path);
    assert.equal(extractCustomerAvatarStoragePath("https://evil.example/x.png"), null);
  });
});
