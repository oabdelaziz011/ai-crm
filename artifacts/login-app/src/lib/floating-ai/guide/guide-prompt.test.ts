import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuideSystemPrompt, enrichGuidePageContext } from "./guide-prompt";
import type { GuideEffectiveAuth } from "./guide-auth";

const baseAuth: GuideEffectiveAuth = {
  userId: "u1",
  companyId: "c1",
  isSuperAdmin: false,
  permissionCodes: ["customers.view"],
  permissionsAvailable: true,
};

describe("Phase 1 Guide prompt assembly", () => {
  it("embeds effective permissions and denies create without inventing access", () => {
    const prompt = buildGuideSystemPrompt({
      auth: baseAuth,
      page: {
        route: "/customers",
        page: "customers",
        language: "en",
        companyId: "c1",
        userId: "u1",
      },
    });
    assert.match(prompt, /customers\.create: DENIED/);
    assert.match(prompt, /customers\.view: ALLOWED/);
    assert.match(prompt, /permittedRouteIds:.*customers/);
    assert.match(prompt, /Respond in English/);
    assert.match(prompt, /cannot execute business operations/);
  });

  it("switches response language for AR and DE", () => {
    assert.match(
      buildGuideSystemPrompt({
        auth: baseAuth,
        page: { language: "ar", page: "home" },
      }),
      /Respond in Arabic/,
    );
    assert.match(
      buildGuideSystemPrompt({
        auth: baseAuth,
        page: { language: "de", page: "home" },
      }),
      /Respond in German/,
    );
  });

  it("enrichGuidePageContext injects systemPrompt and permission snapshot", () => {
    const enriched = enrichGuidePageContext({
      base: { module: "customers", route: "/customers", company: { id: "c1" }, user: { id: "u1" } },
      auth: baseAuth,
      language: "en",
    });
    assert.equal(enriched.guideMode, true);
    assert.equal(enriched.assistantSurface, "guide");
    assert.equal(typeof enriched.systemPrompt, "string");
    assert.ok((enriched.systemPrompt as string).includes("ValueOR AI Guide"));
    const snap = enriched.guidePermissionSnapshot as { permissionCodes: string[] };
    assert.deepEqual(snap.permissionCodes, ["customers.view"]);
  });

  it("fail-closed prompt notes unavailable permissions", () => {
    const prompt = buildGuideSystemPrompt({
      auth: { ...baseAuth, permissionsAvailable: false },
      page: { language: "en", page: "customers" },
    });
    assert.match(prompt, /permissionsAvailable: false/);
    assert.match(prompt, /customers\.view: DENIED \(missing_context/);
  });
});
