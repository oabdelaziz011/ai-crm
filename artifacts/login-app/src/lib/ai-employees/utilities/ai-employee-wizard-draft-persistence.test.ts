import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWizardDraftPersistDecision } from "./ai-employee-wizard-draft-persistence.ts";
import {
  assertEligibleForPermanentPurge,
  isEligibleForPermanentPurge,
} from "../services/ai-employee-permanent-cleanup.ts";

describe("resolveWizardDraftPersistDecision", () => {
  it("allows create when no draft resume id is present", () => {
    assert.deepEqual(
      resolveWizardDraftPersistDecision({
        urlDraftId: null,
        stateDraftId: null,
        loadedDraft: undefined,
        isDraftLoading: false,
      }),
      { mode: "create" },
    );
  });

  it("blocks insert when URL draft is missing from data", () => {
    assert.deepEqual(
      resolveWizardDraftPersistDecision({
        urlDraftId: "11111111-1111-4111-8111-111111111111",
        stateDraftId: null,
        loadedDraft: undefined,
        isDraftLoading: false,
      }),
      { mode: "blocked", reason: "draft_not_found" },
    );
  });

  it("updates only when loaded draft matches resume id", () => {
    const draftId = "22222222-2222-4222-8222-222222222222";
    assert.deepEqual(
      resolveWizardDraftPersistDecision({
        urlDraftId: draftId,
        stateDraftId: draftId,
        loadedDraft: { id: draftId, status: "draft" },
        isDraftLoading: false,
      }),
      { mode: "update", draftId },
    );
  });

  it("blocks archived draft resume", () => {
    const draftId = "33333333-3333-4333-8333-333333333333";
    assert.deepEqual(
      resolveWizardDraftPersistDecision({
        urlDraftId: draftId,
        stateDraftId: draftId,
        loadedDraft: { id: draftId, status: "archived" },
        isDraftLoading: false,
      }),
      { mode: "blocked", reason: "archived" },
    );
  });

  it("prefers URL draft over cleared state to prevent accidental insert", () => {
    const draftId = "44444444-4444-4444-8444-444444444444";
    assert.deepEqual(
      resolveWizardDraftPersistDecision({
        urlDraftId: draftId,
        stateDraftId: null,
        loadedDraft: undefined,
        isDraftLoading: false,
      }),
      { mode: "blocked", reason: "draft_not_found" },
    );
  });
});

describe("permanent purge eligibility", () => {
  it("accepts archived soft-deleted rows only", () => {
    assert.equal(
      isEligibleForPermanentPurge({ status: "archived", deleted_at: "2026-01-01T00:00:00Z" }),
      true,
    );
    assert.equal(isEligibleForPermanentPurge({ status: "archived", deleted_at: null }), false);
    assert.equal(
      isEligibleForPermanentPurge({ status: "published", deleted_at: "2026-01-01T00:00:00Z" }),
      false,
    );
    assert.equal(isEligibleForPermanentPurge({ status: "draft", deleted_at: null }), false);
    assert.equal(isEligibleForPermanentPurge({ status: "disabled", deleted_at: null }), false);
  });

  it("assertEligibleForPermanentPurge rejects active rows", () => {
    assert.throws(
      () =>
        assertEligibleForPermanentPurge({
          id: "55555555-5555-4555-8555-555555555555",
          status: "published",
          deleted_at: null,
        }),
      /not eligible for permanent purge/i,
    );
  });
});
