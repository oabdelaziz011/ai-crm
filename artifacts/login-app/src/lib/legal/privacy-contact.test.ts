import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDataDeletionMailtoHref,
  DEFAULT_PRIVACY_CONTACT_EMAIL,
  DEFAULT_PRIVACY_CONTACT_PHONE,
  getPrivacyContactEmail,
  getPrivacyContactPhone,
} from "./privacy-contact.ts";

describe("privacy contact", () => {
  it("returns a public inbox and never a secret-bearing value", () => {
    const email = getPrivacyContactEmail();
    assert.equal(email.includes("@"), true);
    assert.doesNotMatch(email, /service.role|access.token|secret/i);
    assert.equal(DEFAULT_PRIVACY_CONTACT_EMAIL, "valueor@admin.org");
    assert.equal(getPrivacyContactPhone(), DEFAULT_PRIVACY_CONTACT_PHONE);
    assert.equal(DEFAULT_PRIVACY_CONTACT_PHONE, "+201011404109");
  });

  it("builds a mailto deletion request without a backend API", () => {
    const href = buildDataDeletionMailtoHref(
      "valueor@admin.org",
      "ValueOR data deletion request",
    );
    assert.equal(
      href,
      "mailto:valueor@admin.org?subject=ValueOR%20data%20deletion%20request",
    );
  });
});
