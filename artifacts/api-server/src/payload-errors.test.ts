import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { describe, it } from "node:test";
import { errorHandler } from "./middleware/error-handler.js";

function invoke(err: unknown): { status?: number; body?: { error?: string; message?: string } } {
  const captured: { status?: number; body?: { error?: string; message?: string } } = {};
  const req = {
    method: "POST",
    path: "/api/notes",
    originalUrl: "/api/notes",
    header: () => undefined,
  } as unknown as Request;
  const res = {
    headersSent: false,
    setHeader() {
      return this;
    },
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: { error?: string; message?: string }) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;
  errorHandler(err, req, res, () => undefined);
  return captured;
}

describe("oversized and invalid JSON bodies", () => {
  it("returns 413 without treating the body parser error as an internal failure", () => {
    const result = invoke(
      Object.assign(new Error("request entity too large"), { status: 413, type: "entity.too.large" }),
    );
    assert.equal(result.status, 413);
    assert.equal(result.body?.error, "payload_too_large");
  });

  it("returns 400 for a JSON parse failure", () => {
    const result = invoke(
      Object.assign(new SyntaxError("Unexpected token"), { status: 400, type: "entity.parse.failed" }),
    );
    assert.equal(result.status, 400);
    assert.equal(result.body?.error, "invalid_json");
  });
});
