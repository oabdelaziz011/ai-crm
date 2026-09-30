/**
 * POST /tickets/ai/resolution-message — commercial/RBAC gates + never-send shape.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TICKET_RESOLUTION_AI_CLOSE_PERMISSION,
  TICKET_RESOLUTION_AI_FEATURE_CODE,
  TICKET_RESOLUTION_AI_PERMISSION,
} from "../services/ticket-resolution-ai-draft.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ticket-resolution-ai-draft route security", () => {
  it("requires ai.conversations.reply permission", () => {
    assert.equal(TICKET_RESOLUTION_AI_PERMISSION, "ai.conversations.reply");
  });

  it("requires tickets.close permission for close workflow", () => {
    assert.equal(TICKET_RESOLUTION_AI_CLOSE_PERMISSION, "tickets.close");
  });

  it("requires ai_assistant commercial feature", () => {
    assert.equal(TICKET_RESOLUTION_AI_FEATURE_CODE, "ai_assistant");
  });

  it("route wires auth, company scope, commercial feature, and AI permission", () => {
    const src = readFileSync(join(__dirname, "ticket-resolution-ai-draft.ts"), "utf8");
    assert.match(src, /requireSupabaseAuth/);
    assert.match(src, /requireCompanyScope/);
    assert.match(src, /assertRouteCommercialFeature/);
    assert.match(src, /TICKET_RESOLUTION_AI_PERMISSION/);
    assert.match(src, /\/tickets\/ai\/resolution-message/);
    assert.match(src, /neverSend:\s*true/);
  });
});
