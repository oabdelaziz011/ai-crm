import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_RECIPIENT_SUGGEST_LIMIT,
  EMAIL_RECIPIENT_SUGGEST_MIN_CHARS,
  extractParticipantCandidatesFromConversationMetadata,
  filterParticipantCandidates,
  matchesRecipientSuggestionQuery,
  rankAndMergeRecipientSuggestions,
  shouldRequestRecipientSuggestions,
} from "./email-recipient-suggestions.ts";
import { searchEmailRecipientSuggestions } from "./search-email-recipient-suggestions.ts";
import { mergeRecipientEmails } from "./email-thread-outbound.ts";

describe("email recipient suggestion matching", () => {
  it("requires at least 2 characters", () => {
    assert.equal(shouldRequestRecipientSuggestions("a"), false);
    assert.equal(shouldRequestRecipientSuggestions("ab"), true);
    assert.equal(EMAIL_RECIPIENT_SUGGEST_MIN_CHARS, 2);
  });

  it("matches name and email case-insensitively", () => {
    assert.equal(
      matchesRecipientSuggestionQuery(
        { email: "abdelazizomar187@gmail.com", displayName: "Abdelaziz Omar" },
        "AB",
      ),
      true,
    );
    assert.equal(
      matchesRecipientSuggestionQuery(
        { email: "ahmed@example.com", displayName: "Ahmed Abdelrahman" },
        "ahmed@",
      ),
      true,
    );
    assert.equal(
      matchesRecipientSuggestionQuery({ email: "other@example.com", displayName: "Zaid" }, "ab"),
      false,
    );
  });

  it("ranks customers above participants and bounds results", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      email: `user${i}@example.com`,
      displayName: `User ${i}`,
      customerId: `c${i}`,
      source: "customer" as const,
    }));
    const ranked = rankAndMergeRecipientSuggestions({
      query: "user",
      customers: many,
      participants: [
        { email: "user0@example.com", displayName: null, source: "participant" },
        { email: "partner@example.com", displayName: null, source: "participant" },
      ],
      limit: EMAIL_RECIPIENT_SUGGEST_LIMIT,
    });
    assert.ok(ranked.length <= EMAIL_RECIPIENT_SUGGEST_LIMIT);
    assert.equal(ranked.find((row) => row.email === "user0@example.com")?.source, "customer");
    assert.ok(ranked.every((row) => row.email.includes("@")));
  });

  it("excludes already selected emails (dedupe path)", () => {
    const ranked = rankAndMergeRecipientSuggestions({
      query: "ah",
      customers: [
        {
          email: "ahmed@example.com",
          displayName: "Ahmed",
          customerId: "c1",
          source: "customer",
        },
      ],
      excludeEmails: ["Ahmed@example.com"],
    });
    assert.deepEqual(ranked, []);
  });

  it("keeps participant-only emails without inventing customers", () => {
    const ranked = rankAndMergeRecipientSuggestions({
      query: "part",
      participants: [{ email: "partner@example.com", source: "participant" }],
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.customerId, null);
    assert.equal(ranked[0]?.displayName, null);
    assert.equal(ranked[0]?.email, "partner@example.com");
  });
});

describe("participant extraction + tenant isolation helpers", () => {
  it("extracts draft/outbound participant emails from metadata", () => {
    const rows = extractParticipantCandidatesFromConversationMetadata({
      emailComposerDraft: {
        to: ["one@example.com"],
        cc: ["two@example.com", "three@example.com"],
        bcc: [],
      },
      recipientEmails: ["four@example.com"],
    });
    const emails = rows.map((row) => row.email).sort();
    assert.deepEqual(emails, [
      "four@example.com",
      "one@example.com",
      "three@example.com",
      "two@example.com",
    ]);
  });

  it("filters local participants without cross-contaminating excluded emails", () => {
    const filtered = filterParticipantCandidates(
      [
        { email: "alpha@company-a.test", source: "participant" },
        { email: "beta@company-a.test", source: "participant" },
      ],
      "al",
      ["alpha@company-a.test"],
    );
    assert.deepEqual(filtered.map((row) => row.email), []);
  });
});

describe("searchEmailRecipientSuggestions security", () => {
  it("returns empty when port companyId mismatches authenticated companyId", async () => {
    const rows = await searchEmailRecipientSuggestions({
      companyId: "company-a",
      query: "ab",
      portContext: {
        companyId: "company-b",
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      searchCustomers: async () => [
        {
          email: "leak@company-b.test",
          displayName: "Leak",
          customerId: "x",
          source: "customer",
        },
      ],
    });
    assert.deepEqual(rows, []);
  });

  it("never returns cross-company customers from injectable search", async () => {
    const rows = await searchEmailRecipientSuggestions({
      companyId: "company-a",
      query: "ab",
      portContext: {
        companyId: "company-a",
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      searchCustomers: async (companyId) => {
        assert.equal(companyId, "company-a");
        return [
          {
            email: "abdelaziz@company-a.test",
            displayName: "Abdelaziz Omar",
            customerId: "cust-a",
            source: "customer",
          },
        ];
      },
      participantCandidates: [
        { email: "partner@company-a.test", source: "participant" },
        // Caller must only pass company-A candidates; search still filters by query.
        { email: "zzz@other.test", source: "participant" },
      ],
    });
    assert.ok(rows.some((row) => row.email === "abdelaziz@company-a.test"));
    assert.ok(rows.every((row) => !row.email.includes("company-b")));
    assert.ok(!rows.some((row) => row.email === "zzz@other.test"));
  });

  it("selecting a suggestion uses the same merge/dedupe path as typed chips", () => {
    const merged = mergeRecipientEmails(
      ["ahmed@example.com"],
      ["Ahmed@example.com", "second@example.com"],
    );
    assert.deepEqual(merged.list, ["ahmed@example.com", "second@example.com"]);
  });

  it("supports Arabic and English query matching", () => {
    assert.equal(
      matchesRecipientSuggestionQuery(
        { email: "noura@example.com", displayName: "نورة أحمد" },
        "نور",
      ),
      true,
    );
    assert.equal(
      matchesRecipientSuggestionQuery(
        { email: "john@example.com", displayName: "John Smith" },
        "jo",
      ),
      true,
    );
  });
});
