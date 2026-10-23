import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireCompanyScope, requireSupabaseAuth } from "./supabase-auth.js";

function fakeRequest(init: Partial<Request> & { authorization?: string; body?: unknown }): Request {
  const headers: Record<string, string> = {};
  if (init.authorization) headers.authorization = init.authorization;
  return {
    method: "POST",
    originalUrl: "/api/omnichannel/conversations",
    path: "/omnichannel/conversations",
    header: (name: string) => headers[name.toLowerCase()],
    ...init,
  } as unknown as Request;
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<unknown> {
  return new Promise((resolve) => {
    void middleware(req, {} as Response, (error?: unknown) => resolve(error ?? null));
  });
}

describe("supabase auth middleware per-request reuse", () => {
  it("skips re-verification when the same bearer token was already verified on this request", async () => {
    const req = fakeRequest({
      authorization: "Bearer token-a",
      supabaseUser: { id: "user-1" } as Request["supabaseUser"],
      supabaseAuthToken: "token-a",
      supabaseCompanyId: "company-1",
    });
    assert.equal(await runMiddleware(requireSupabaseAuth, req), null);
    assert.equal(req.supabaseUser?.id, "user-1");
  });

  it("still rejects a missing bearer token even if a user was attached earlier", async () => {
    const req = fakeRequest({
      supabaseUser: { id: "user-1" } as Request["supabaseUser"],
      supabaseAuthToken: "token-a",
    });
    const error = (await runMiddleware(requireSupabaseAuth, req)) as { statusCode?: number } | null;
    assert.equal(error?.statusCode, 401);
  });

  it("reuses a company scope already verified on this request", async () => {
    const req = fakeRequest({
      body: { companyId: "company-1" },
      supabaseUser: { id: "user-1" } as Request["supabaseUser"],
      supabaseCompanyId: "company-1",
      supabaseIsSuperAdmin: false,
      supabaseScopedCompanyIds: new Set(["company-1"]),
    });
    assert.equal(await runMiddleware(requireCompanyScope(), req), null);
  });

  it("still blocks a different company even when another company was verified", async () => {
    const req = fakeRequest({
      body: { companyId: "company-2" },
      supabaseUser: { id: "user-1" } as Request["supabaseUser"],
      supabaseCompanyId: "company-1",
      supabaseIsSuperAdmin: false,
      supabaseScopedCompanyIds: new Set(["company-1"]),
    });
    const error = (await runMiddleware(requireCompanyScope(), req)) as { statusCode?: number } | null;
    assert.equal(error?.statusCode, 403);
  });
});
