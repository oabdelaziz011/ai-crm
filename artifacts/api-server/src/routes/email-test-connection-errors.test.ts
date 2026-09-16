import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpError } from "../middleware/error-handler.js";
import {
  mapEmailTestConnectionError,
  sanitizeEmailTestErrorMessage,
} from "./email-test-connection-errors.js";

describe("sanitizeEmailTestErrorMessage", () => {
  it("redacts password and authorization material", () => {
    const sanitized = sanitizeEmailTestErrorMessage(
      "Invalid login password=super-secret-app-pass Authorization: Bearer abc.def api_key=sk-live",
    );
    assert.doesNotMatch(sanitized, /super-secret|abc\.def|sk-live/i);
    assert.match(sanitized, /\[redacted\]/);
  });
});

describe("mapEmailTestConnectionError", () => {
  it("keeps HttpError instances", () => {
    const original = new HttpError(403, "No company context.", "forbidden");
    const mapped = mapEmailTestConnectionError(original);
    assert.equal(mapped.statusCode, 403);
    assert.equal(mapped.code, "forbidden");
  });

  it("maps missing configuration to 400", () => {
    const mapped = mapEmailTestConnectionError(new Error("Outbound email is not configured"));
    assert.equal(mapped.statusCode, 400);
    assert.equal(mapped.code, "email_not_configured");
  });

  it("maps commercial denial to 403", () => {
    const mapped = mapEmailTestConnectionError(new Error("Email channel is not entitled."));
    assert.equal(mapped.statusCode, 403);
    assert.equal(mapped.code, "FEATURE_NOT_ENTITLED");
  });

  it("maps invalid SMTP credentials to 502 smtp_auth_failed", () => {
    const mapped = mapEmailTestConnectionError(
      new Error("Invalid login: 535-5.7.8 Username and Password not accepted"),
    );
    assert.equal(mapped.statusCode, 502);
    assert.equal(mapped.code, "smtp_auth_failed");
  });

  it("maps SMTP unavailable to 502", () => {
    const mapped = mapEmailTestConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:1"));
    assert.equal(mapped.statusCode, 502);
    assert.equal(mapped.code, "smtp_unavailable");
  });

  it("does not leak secrets in mapped messages", () => {
    const mapped = mapEmailTestConnectionError(
      new Error("SMTP failed password=gmail-app-password-16"),
    );
    assert.doesNotMatch(mapped.message, /gmail-app-password-16/);
  });
});
