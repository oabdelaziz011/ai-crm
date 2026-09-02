import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  agentContinueHref,
  agentDetailHref,
  agentEditHref,
  agentLifecycleHref,
  agentManageChannelsHref,
  agentManageCapabilitiesHref,
  agentNewHref,
  agentViewDetailsHref,
} from "../../config/agents-route-registry.ts";
import {
  isAiEmployeeReadOnlyViewMode,
  visibleAiEmployeeRowActions,
  type AiEmployeeRowActionCapabilities,
} from "./utilities/ai-employee-row-actions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = resolve(here, "../..");

const fullCaps: AiEmployeeRowActionCapabilities = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canPublish: true,
};

const viewOnly: AiEmployeeRowActionCapabilities = {
  canView: true,
  canEdit: false,
  canDelete: false,
  canPublish: false,
};

describe("AI Employee Control Center shell", () => {
  it("preserves existing routes and adds view/channels/permissions deep-links", () => {
    assert.equal(agentNewHref(), "/new");
    assert.equal(agentDetailHref("abc"), "/abc");
    assert.equal(agentEditHref("abc"), "/abc/edit");
    assert.equal(
      agentContinueHref("75d6c2ab-7a01-4dfa-91bb-580f9c8b8c0b"),
      "/new?draft=75d6c2ab-7a01-4dfa-91bb-580f9c8b8c0b",
    );
    assert.equal(agentViewDetailsHref("abc"), "/abc?mode=view");
    assert.equal(agentManageChannelsHref("abc"), "/abc?tab=channels");
    assert.equal(agentManageCapabilitiesHref("abc"), "/abc?tab=setup&config=tools");
    assert.equal(agentLifecycleHref("abc"), "/abc?tab=lifecycle");
  });

  it("exposes status-aware list actions without inventing lifecycle states", () => {
    const draft = visibleAiEmployeeRowActions({ status: "draft" }, fullCaps).map((a) => a.id);
    assert.deepEqual(draft, ["view", "continue", "edit", "publish", "delete"]);

    const published = visibleAiEmployeeRowActions({ status: "published" }, fullCaps).map(
      (a) => a.id,
    );
    assert.ok(!published.includes("continue"));
    assert.deepEqual(published, [
      "view",
      "edit",
      "manageChannels",
      "manageCapabilities",
      "disable",
      "delete",
    ]);

    const disabled = visibleAiEmployeeRowActions({ status: "disabled" }, fullCaps).map((a) => a.id);
    assert.deepEqual(disabled, [
      "view",
      "edit",
      "manageChannels",
      "manageCapabilities",
      "publish",
      "delete",
    ]);

    const archived = visibleAiEmployeeRowActions({ status: "archived" }, fullCaps).map((a) => a.id);
    assert.deepEqual(archived, ["view", "restore"]);
    assert.ok(!archived.includes("delete"));
    assert.ok(!archived.includes("continue"));

    const viewDraft = visibleAiEmployeeRowActions({ status: "draft" }, viewOnly).map((a) => a.id);
    assert.deepEqual(viewDraft, ["view"]);
  });

  it("keeps Continue Setup in the Actions menu only (no standalone table button)", () => {
    const table = readFileSync(
      resolve(loginAppSrc, "lib/ai-employees/components/ai-employee-table.tsx"),
      "utf8",
    );
    assert.match(table, /visibleAiEmployeeRowActions/);
    assert.match(table, /case "continue"/);
    assert.doesNotMatch(
      table,
      /canEdit && employee\.status === "draft"[\s\S]{0,200}actions\.continue/,
    );
  });

  it("treats mode=view as genuine read-only Control Center mode", () => {
    assert.equal(isAiEmployeeReadOnlyViewMode("?mode=view"), true);
    assert.equal(isAiEmployeeReadOnlyViewMode("?tab=channels&mode=view"), true);
    assert.equal(isAiEmployeeReadOnlyViewMode("?tab=channels"), false);
  });

  it("detail page gates mutations when mode=view and never auto-saves", () => {
    const detail = readFileSync(
      resolve(loginAppSrc, "pages/dashboard/agents/agent-detail-page.tsx"),
      "utf8",
    );
    assert.match(detail, /isAiEmployeeReadOnlyViewMode/);
    assert.match(detail, /canEditPermission && !isReadOnlyView/);
    assert.match(detail, /if \(!canEdit\) return;/);
    assert.match(detail, /controlCenter\.readOnlyBadge/);
    assert.doesNotMatch(detail, /mode=view[\s\S]{0,80}mutateAsync/);
  });

  it("localizes Control Center action labels in EN and AR", () => {
    const en = JSON.parse(
      readFileSync(resolve(loginAppSrc, "locales/en/common.json"), "utf8"),
    ) as { aiEmployees: { actions: Record<string, string>; controlCenter: { readOnlyBadge: string } } };
    const ar = JSON.parse(
      readFileSync(resolve(loginAppSrc, "locales/ar/common.json"), "utf8"),
    ) as { aiEmployees: { actions: Record<string, string>; controlCenter: { readOnlyBadge: string } } };

    assert.equal(en.aiEmployees.actions.view, "View Details");
    assert.equal(ar.aiEmployees.actions.view, "عرض التفاصيل");
    assert.equal(en.aiEmployees.actions.continue, "Continue Setup");
    assert.equal(ar.aiEmployees.actions.continue, "استكمال الإعداد");
    assert.equal(en.aiEmployees.actions.manageChannels, "Manage Channels");
    assert.equal(ar.aiEmployees.actions.manageChannels, "إدارة القنوات");
    assert.equal(en.aiEmployees.actions.manageCapabilities, "Capabilities & tools");
    assert.equal(ar.aiEmployees.actions.manageCapabilities, "القدرات والأدوات");
    assert.equal(en.aiEmployees.controlCenter.readOnlyBadge, "Read-only");
    assert.equal(ar.aiEmployees.controlCenter.readOnlyBadge, "للقراءة فقط");
    assert.match(
      (
        en.aiEmployees as {
          listGuide?: { points?: { controlCenter?: string } };
        }
      ).listGuide?.points?.controlCenter ?? "",
      /Capabilities & tools/,
    );
    assert.match(
      (
        ar.aiEmployees as {
          listGuide?: { points?: { controlCenter?: string } };
        }
      ).listGuide?.points?.controlCenter ?? "",
      /القدرات والأدوات/,
    );
    assert.equal(
      (en.aiEmployees.actions as { managePermissions?: string }).managePermissions,
      undefined,
    );
  });
});
