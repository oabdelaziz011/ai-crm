import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDataDeletionMailtoHref,
  DEFAULT_PRIVACY_CONTACT_EMAIL,
  getPrivacyContactEmail,
} from "./privacy-contact.ts";

describe("privacy contact", () => {
  it("returns a public inbox and never a secret-bearing value", () => {
    const email = getPrivacyContactEmail();
    assert.equal(email.includes("@"), true);
    assert.doesNotMatch(email, /service.role|access.token|secret/i);
    assert.equal(DEFAULT_PRIVACY_CONTACT_EMAIL, "privacy@valueor.org");
  });

  it("builds a mailto deletion request without a backend API", () => {
    const href = buildDataDeletionMailtoHref(
      "privacy@valueor.org",
      "ValueOR data deletion request",
    );
    assert.equal(
      href,
      "mailto:privacy@valueor.org?subject=ValueOR%20data%20deletion%20request",
    );
  });
});
