import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapMetaEmbeddedSignupGraphError,
  mapMetaEmbeddedSignupSessionEvent,
  META_ERROR_NUMBER_ALREADY_CLOUD_API,
} from "./whatsapp-embedded-signup-meta-errors.js";

describe("whatsapp-embedded-signup-meta-errors", () => {
  it("maps Meta 2655122 to ES_META_NUMBER_ALREADY_CLOUD_API without inventing migration steps", () => {
    const mapped = mapMetaEmbeddedSignupGraphError({
      error: {
        code: META_ERROR_NUMBER_ALREADY_CLOUD_API,
        message: "Phone number already registered",
      },
    });
    assert.equal(mapped.code, "ES_META_NUMBER_ALREADY_CLOUD_API");
    assert.equal(mapped.metaErrorCode, 2655122);
    assert.match(mapped.message, /2655122/);
    assert.match(mapped.message, /Cloud API/i);
    assert.doesNotMatch(mapped.message, /delete the WABA|remove the WABA/i);
  });

  it("maps 2655093 as partner/credit-line association without claiming a ValueOR fix", () => {
    const mapped = mapMetaEmbeddedSignupGraphError({
      error: { code: 2655093, message: "Already shared" },
    });
    assert.equal(mapped.code, "ES_META_ALREADY_SHARED_WITH_PARTNER");
    assert.match(mapped.message, /2655093/);
    assert.match(mapped.message, /cannot release/i);
  });

  it("maps Meta 3441067 to other Business Portfolio without inventing a ValueOR migration", () => {
    const mapped = mapMetaEmbeddedSignupGraphError({
      error: {
        code: 3441067,
        message:
          "This number is already on a WhatsApp Business account in a business portfolio you don't manage.",
      },
    });
    assert.equal(mapped.code, "ES_META_NUMBER_OTHER_BUSINESS_PORTFOLIO");
    assert.equal(mapped.metaErrorCode, 3441067);
    assert.match(mapped.message, /Business Portfolio/i);
    assert.doesNotMatch(mapped.message, /ValueOR will delete|auto-migrate/i);
  });

  it("maps Meta 3441090 to other WABA in the same portfolio", () => {
    const mapped = mapMetaEmbeddedSignupGraphError({
      error: { code: 3441090, message: "Already on another WABA" },
    });
    assert.equal(mapped.code, "ES_META_NUMBER_OTHER_WABA_SAME_PORTFOLIO");
    assert.match(mapped.message, /3441090/);
  });

  it("keeps unknown Meta codes generic with the numeric id", () => {
    const mapped = mapMetaEmbeddedSignupGraphError({
      error: { code: 999001, message: "Something obscure" },
    });
    assert.equal(mapped.code, "ES_META_GRAPH_ERROR");
    assert.match(mapped.message, /999001/);
    assert.match(mapped.message, /Something obscure/);
  });

  it("maps session postMessage error fields for 2655122", () => {
    const mapped = mapMetaEmbeddedSignupSessionEvent({
      event: "FINISH",
      errorCode: "2655122",
      errorMessage: "already registered",
    });
    assert.ok(mapped);
    assert.equal(mapped?.code, "ES_META_NUMBER_ALREADY_CLOUD_API");
  });
});
