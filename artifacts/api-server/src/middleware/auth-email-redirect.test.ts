import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFrontendAuthCallbackUrl,
  isAuthEmailCallbackQuery,
} from "./auth-email-redirect.js";

describe("auth-email-redirect", () => {
  it("detects PKCE code callbacks", () => {
    assert.equal(isAuthEmailCallbackQuery({ code: "abc" }), true);
    assert.equal(isAuthEmailCallbackQuery({}), false);
  });

  it("forwards query to frontend auth callback with reset-password next", () => {
    const url = buildFrontendAuthCallbackUrl(
      { code: "14adae4d-0c11-4d20-a21e-2424dc8d1efa" },
      "http://localhost:5173",
    );
    assert.equal(
      url,
      "http://localhost:5173/auth/callback?code=14adae4d-0c11-4d20-a21e-2424dc8d1efa&next=%2Freset-password",
    );
  });

  it("forwards auth error callbacks to the frontend", () => {
    const url = buildFrontendAuthCallbackUrl(
      {
        error: "access_denied",
        error_code: "otp_expired",
        error_description: "Email link is invalid or has expired",
      },
      "http://localhost:5173",
    );
    assert.equal(
      url,
      "http://localhost:5173/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
  });
});
