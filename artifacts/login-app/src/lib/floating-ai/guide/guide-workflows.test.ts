import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceGuideWorkflow,
  findGuideWorkflowById,
  GUIDE_WORKFLOWS,
  matchGuideWorkflow,
} from "./guide-workflows";
import { guideWorkflowTitleKey } from "./guide-workflow-runtime";

describe("Phase 1C interactive guidance workflows", () => {
  it("matches connect whatsapp intent across languages", () => {
    assert.equal(matchGuideWorkflow("How do I connect WhatsApp?")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("أريد ربط واتساب")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("WhatsApp verbinden bitte")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("اذي اقدر اوصل الواتسب")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("ازاي اوصل واتساب على السيستم")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("connect whatsapp to the system")?.id, "connect_whatsapp");
  });

  it("requires confirmation before advancing waiting steps", () => {
    const workflow = findGuideWorkflowById("add_customer");
    assert.ok(workflow);
    const stuck = advanceGuideWorkflow({ workflowId: "add_customer", stepIndex: 0 }, false);
    assert.deepEqual(stuck, { workflowId: "add_customer", stepIndex: 0 });
    const next = advanceGuideWorkflow({ workflowId: "add_customer", stepIndex: 0 }, true);
    assert.deepEqual(next, { workflowId: "add_customer", stepIndex: 1 });
  });

  it("ends when steps are exhausted", () => {
    const last = advanceGuideWorkflow({ workflowId: "create_ticket", stepIndex: 1 }, true);
    assert.equal(last, null);
  });

  it("has en + ar i18n for every workflow title, step instruction and panel string", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const lng of ["en", "ar"]) {
      const json = JSON.parse(
        readFileSync(join(here, `../../../locales/${lng}/common.json`), "utf8"),
      ) as { floatingAi: { guide: Record<string, unknown> } };
      const lookup = (path: string): unknown =>
        path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], json);
      for (const key of ["surfaceAssist", "surfaceGuide"]) {
        assert.equal(typeof json.floatingAi.guide[key], "string", `${lng}:${key}`);
      }
      for (const key of [
        "progress", "confirm", "cancel", "back", "cancelled", "completed", "denied", "navigateHint", "noWriteClaim",
      ]) {
        assert.equal(
          typeof lookup(`floatingAi.guide.workflow.${key}`),
          "string",
          `${lng}:workflow.${key}`,
        );
      }
      for (const workflow of GUIDE_WORKFLOWS) {
        assert.equal(typeof lookup(guideWorkflowTitleKey(workflow.id)), "string", `${lng}:${workflow.id}`);
        for (const step of workflow.steps) {
          assert.equal(typeof lookup(step.instructionKey), "string", `${lng}:${step.instructionKey}`);
        }
      }
    }
  });

  it("only defines NAVIGATE + CONFIRM steps (no tool or write fields)", () => {
    for (const workflow of GUIDE_WORKFLOWS) {
      for (const step of workflow.steps) {
        assert.deepEqual(
          Object.keys(step).filter((k) => !["id", "instructionKey", "navigateRouteId", "awaitUserConfirmation"].includes(k)),
          [],
          `${workflow.id}.${step.id}`,
        );
      }
    }
  });

  it("keeps step navigate targets on real registry routes", () => {
    const wa = findGuideWorkflowById("connect_whatsapp");
    assert.equal(wa?.steps[0]?.navigateRouteId, "whatsapp");
    assert.equal(wa?.requiredTask, "whatsapp.view");
  });
});
