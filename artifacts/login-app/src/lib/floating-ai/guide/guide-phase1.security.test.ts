/**
 * Phase 1 security + Assist regression guarantees (static + unit).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { GUIDE_ALLOWED_TOOL_KEYS } from "./guide-security";
import { authorizeGuideNavigation } from "./guide-navigation";

const here = dirname(fileURLToPath(import.meta.url));

describe("Phase 1 security and Assist regression", () => {
  it("keeps Guide tool allowlist empty (no Phase 1 tool unlock)", () => {
    assert.deepEqual(GUIDE_ALLOWED_TOOL_KEYS, []);
  });

  it("does not weaken ToolRouter Guide lock enforcement source", () => {
    const router = readFileSync(
      join(here, "../../../../../../lib/ai-tool-router/src/services/tool-router-service.ts"),
      "utf8",
    );
    assert.match(router, /ai_guide_locked === true/);
    assert.match(router, /AiGuideToolBlockedError/);
  });

  it("Guide navigation still cannot invent unauthorized paths", () => {
    const result = authorizeGuideNavigation(
      {
        userId: "u",
        companyId: "c",
        isSuperAdmin: false,
        permissionCodes: [],
        permissionsAvailable: true,
      },
      { kind: "route", routeId: "customers" },
    );
    assert.equal(result.ok, false);
  });

  it("Home Ask AI opens Guide surface; Ctrl/K Assist path remains distinct", () => {
    const home = readFileSync(join(here, "../../../pages/dashboard/home-page.tsx"), "utf8");
    assert.match(home, /requestOpenFloatingAi\(\{\s*surface:\s*"guide"\s*\}\)/);

    const launcher = readFileSync(
      join(here, "../../../components/floating-ai/floating-ai-launcher.tsx"),
      "utf8",
    );
    assert.match(launcher, /setSurface\("assist"\)/);
    assert.match(launcher, /detail\?\.surface === "guide"/);

    const floatingChat = readFileSync(
      join(here, "../../../hooks/floating-ai/use-floating-ai-chat.ts"),
      "utf8",
    );
    assert.match(floatingChat, /surface,/);
    assert.match(floatingChat, /enrichGuidePageContext/);
    assert.match(floatingChat, /refreshAuthContext/);
  });

  it("panel wires tool-less workflow runtime, Assist|Guide toggle, and no write claims", () => {
    const content = readFileSync(
      join(here, "../../../components/floating-ai/floating-ai-panel-content.tsx"),
      "utf8",
    );
    assert.match(content, /createGuideWorkflowRuntime/);
    assert.match(content, /GuideWorkflowPanel/);
    assert.match(content, /action\.type === "workflow"/);
    assert.match(content, /authorizeGuideNavigation\(guideAuth, \{\s*kind: "route"/);
    assert.match(content, /setSurface\(value\)/);
    assert.match(content, /floatingAi\.guide\.surfaceAssist/);
    assert.match(content, /floatingAi\.guide\.surfaceGuide/);

    const panel = readFileSync(
      join(here, "../../../components/floating-ai/guide-workflow-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /floatingAi\.guide\.workflow\.noWriteClaim/);
    assert.match(panel, /floatingAi\.guide\.workflow\.navigateHint/);
    assert.match(panel, /floatingAi\.guide\.workflow\.denied/);

    const runtime = readFileSync(join(here, "guide-workflow-runtime.ts"), "utf8");
    assert.doesNotMatch(runtime, /executeTool|toolRouter|supabase|fetch\(/);
  });

  it("useAiChatWorkspace Guide branch still disables RAG and tools", () => {
    const workspace = readFileSync(
      join(here, "../../../hooks/ai-chat/use-ai-chat-workspace.ts"),
      "utf8",
    );
    assert.match(workspace, /registerGuideToolScope/);
    assert.match(workspace, /applyGuidePageContextRestrictions/);
    assert.match(workspace, /knowledgeRetrieval = undefined/);
  });
});
