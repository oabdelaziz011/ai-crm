/**
 * Campaign submission idempotency — stable key helper + createDraft/execute reuse.
 * Uses Phase 1/2 harness patterns. Mocks only. NO real channel sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clearCampaignSubmissionIdempotencyKey,
  createCampaignIdempotencyKey,
  getOrCreateCampaignSubmissionIdempotencyKey,
} from "./campaign-submission-idempotency.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(__dirname, "../..");

describe("campaign submission idempotency key helper", () => {
  it("reuses the same key from shared storage (tabs / double mount)", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    };
    let created = 0;
    const createKey = () => {
      created += 1;
      return `stable-${created}`;
    };
    const a = getOrCreateCampaignSubmissionIdempotencyKey({
      companyId: "co-1",
      storage,
      createKey,
    });
    const b = getOrCreateCampaignSubmissionIdempotencyKey({
      companyId: "co-1",
      storage,
      createKey,
    });
    assert.equal(a, "stable-1");
    assert.equal(b, "stable-1");
    assert.equal(created, 1);
    clearCampaignSubmissionIdempotencyKey({ companyId: "co-1", storage });
    const c = getOrCreateCampaignSubmissionIdempotencyKey({
      companyId: "co-1",
      storage,
      createKey,
    });
    assert.equal(c, "stable-2");
  });

  it("createCampaignIdempotencyKey returns non-empty string", () => {
    assert.ok(createCampaignIdempotencyKey().length > 0);
  });
});

describe("wizard / hook source contract for stable idempotency", () => {
  it("wizard reuses getOrCreateCampaignSubmissionIdempotencyKey (no per-click randomUUID)", () => {
    const wizardSrc = readFileSync(
      join(loginAppSrc, "pages/dashboard/campaigns/campaign-create-wizard-page.tsx"),
      "utf8",
    );
    const hooksSrc = readFileSync(join(loginAppSrc, "hooks/campaigns/use-campaigns.ts"), "utf8");
    assert.ok(wizardSrc.includes("getOrCreateCampaignSubmissionIdempotencyKey"));
    assert.ok(wizardSrc.includes("submissionIdempotencyKey"));
    assert.ok(wizardSrc.includes("clearCampaignSubmissionIdempotencyKey"));
    assert.ok(!wizardSrc.includes("crypto.randomUUID()"));
    assert.ok(hooksSrc.includes("idempotencyKey: input.idempotencyKey"));
    assert.ok(hooksSrc.includes("service.execute(ctx, { idempotencyKey: input.idempotencyKey })"));
  });
});
