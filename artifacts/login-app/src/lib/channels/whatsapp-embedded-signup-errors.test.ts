import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEmbeddedSignupErrorPresentation } from "./whatsapp-embedded-signup-errors";

describe("whatsapp-embedded-signup-errors", () => {
  it("maps 2655122 / ES_META_NUMBER_ALREADY_CLOUD_API to a dedicated i18n key", () => {
    assert.deepEqual(
      resolveEmbeddedSignupErrorPresentation({
        code: "ES_META_NUMBER_ALREADY_CLOUD_API",
        metaErrorCode: 2655122,
      }),
      {
        titleKey: "failed",
        descriptionKey: "metaNumberAlreadyCloudApi",
      },
    );
  });

  it("maps company allowlist denial separately from generic server disabled", () => {
    assert.equal(
      resolveEmbeddedSignupErrorPresentation({ code: "ES_COMPANY_NOT_ALLOWED" }).descriptionKey,
      "companyNotAllowed",
    );
  });

  it("falls back to raw message for unknown codes", () => {
    const presentation = resolveEmbeddedSignupErrorPresentation({
      code: "ES_UNKNOWN_THING",
      message: "opaque upstream",
    });
    assert.equal(presentation.titleKey, "failed");
    assert.equal(presentation.fallbackDescription, "opaque upstream");
  });
});
