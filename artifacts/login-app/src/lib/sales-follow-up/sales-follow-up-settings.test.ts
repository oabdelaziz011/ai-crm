import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALES_FOLLOW_UP_FORM,
  normalizeSalesFollowUpForm,
  resolveSalesFollowUpDraftsInboxState,
  salesFollowUpConfigState,
  salesFollowUpFormToRow,
  validateSalesFollowUpForm,
} from "./sales-follow-up-settings.js";

describe("sales follow-up settings form", () => {
  it("defaults to disabled draft mode for missing rows", () => {
    const form = normalizeSalesFollowUpForm(null);
    assert.equal(form.enabled, false);
    assert.equal(form.approvalMode, "draft");
    assert.deepEqual(form.channels, []);
    assert.ok(form.scheduleSteps.length >= 1);
  });

  it("scopes upsert payload to the provided company id", () => {
    const row = salesFollowUpFormToRow("company-a", {
      ...DEFAULT_SALES_FOLLOW_UP_FORM,
      enabled: true,
      approvalMode: "automatic",
      channels: ["whatsapp"],
    });
    assert.equal(row.company_id, "company-a");
    assert.equal(row.enabled, true);
    assert.equal(row.approval_mode, "automatic");
    assert.deepEqual(row.channels, ["whatsapp"]);
    assert.equal(row.max_attempts, 3);
  });

  it("keeps draft approval unless automatic is explicit", () => {
    const form = normalizeSalesFollowUpForm({
      enabled: true,
      approval_mode: "something-else",
      channels: ["whatsapp"],
    });
    assert.equal(form.approvalMode, "draft");
    assert.equal(form.enabled, true);
  });

  it("distinguishes unconfigured, disabled and enabled without inventing a row", () => {
    assert.equal(salesFollowUpConfigState(null), "unconfigured");
    assert.equal(salesFollowUpConfigState(undefined), "unconfigured");
    assert.equal(salesFollowUpConfigState({ enabled: false }), "disabled");
    assert.equal(salesFollowUpConfigState({ enabled: null }), "disabled");
    assert.equal(salesFollowUpConfigState({ enabled: true }), "enabled");
    // A missing row normalizes to off, never to enabled.
    assert.equal(normalizeSalesFollowUpForm(null).enabled, false);
  });

  it("resolves drafts inbox states", () => {
    const base = { isLoading: false, hasError: false, itemCount: 0, configState: null } as const;
    assert.equal(resolveSalesFollowUpDraftsInboxState({ ...base, isLoading: true }), "loading");
    assert.equal(
      resolveSalesFollowUpDraftsInboxState({ ...base, hasError: true, configState: "unconfigured" }),
      "error",
    );
    assert.equal(resolveSalesFollowUpDraftsInboxState({ ...base, configState: "unconfigured" }), "unconfigured");
    assert.equal(resolveSalesFollowUpDraftsInboxState({ ...base, configState: "disabled" }), "disabled");
    assert.equal(resolveSalesFollowUpDraftsInboxState({ ...base, configState: "enabled" }), "empty");
    // Settings unreadable/unknown never claims the feature is disabled.
    assert.equal(resolveSalesFollowUpDraftsInboxState(base), "empty");
    // Existing drafts stay visible even when follow-up is disabled or unconfigured.
    assert.equal(
      resolveSalesFollowUpDraftsInboxState({ ...base, itemCount: 2, configState: "disabled" }),
      "list",
    );
  });

  it("requires channels when automation is enabled", () => {
    assert.equal(
      validateSalesFollowUpForm({
        ...DEFAULT_SALES_FOLLOW_UP_FORM,
        enabled: true,
        channels: [],
      }),
      "channels_required_when_enabled",
    );
  });
});
