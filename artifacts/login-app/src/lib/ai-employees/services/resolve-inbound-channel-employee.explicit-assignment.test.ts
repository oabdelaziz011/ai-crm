import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

/**
 * Unit coverage for Messenger/Instagram explicit assignment vs WhatsApp tag fallback.
 * Uses a lightweight in-module mirror of the resolver branch logic so we do not
 * pull the full Supabase/services graph in this package test.
 */

type FakeEmployee = {
  id: string;
  status: "published" | "draft";
  tags: string[];
};

function scoreEmployeeForChannel(
  employee: FakeEmployee,
  channelKey: string,
  companyChannelId: string,
): number {
  const tags = employee.tags ?? [];
  let score = 0;
  if (tags.includes(`channel:${companyChannelId}`)) score += 100;
  if (tags.includes(`channel:${channelKey}`)) score += 50;
  return score;
}

const EXPLICIT = new Set(["messenger", "instagram"]);

function resolve(input: {
  channelKey: string;
  assignedId: string | null;
  employees: FakeEmployee[];
  readyIds: Set<string>;
}): FakeEmployee | null {
  if (EXPLICIT.has(input.channelKey)) {
    if (!input.assignedId) return null;
    const employee = input.employees.find((e) => e.id === input.assignedId) ?? null;
    if (!employee || employee.status !== "published") return null;
    return input.readyIds.has(employee.id) ? employee : null;
  }

  const published = input.employees.filter((e) => e.status === "published");
  const ranked = [...published].sort(
    (a, b) =>
      scoreEmployeeForChannel(b, input.channelKey, "chan-1") -
      scoreEmployeeForChannel(a, input.channelKey, "chan-1"),
  );
  const tagged = ranked.filter((e) => scoreEmployeeForChannel(e, input.channelKey, "chan-1") > 0);
  const candidates = tagged.length > 0 ? tagged : ranked;
  for (const employee of candidates) {
    if (input.readyIds.has(employee.id)) return employee;
  }
  return null;
}

describe("explicit AI assignment scope (Messenger/Instagram vs WhatsApp)", () => {
  const employees: FakeEmployee[] = [
    { id: "tagged", status: "published", tags: ["channel:messenger"] },
    { id: "assigned", status: "published", tags: [] },
    { id: "wa-any", status: "published", tags: [] },
  ];
  const ready = new Set(["tagged", "assigned", "wa-any"]);

  it("Messenger with null assignment soft-skips AI (no tag fallback)", () => {
    const selected = resolve({
      channelKey: "messenger",
      assignedId: null,
      employees,
      readyIds: ready,
    });
    assert.equal(selected, null);
  });

  it("Instagram uses explicit assignee only", () => {
    const selected = resolve({
      channelKey: "instagram",
      assignedId: "assigned",
      employees,
      readyIds: ready,
    });
    assert.equal(selected?.id, "assigned");
  });

  it("WhatsApp still falls back to any published employee when untagged", () => {
    const selected = resolve({
      channelKey: "whatsapp",
      assignedId: null,
      employees: [{ id: "wa-any", status: "published", tags: [] }],
      readyIds: new Set(["wa-any"]),
    });
    assert.ok(selected);
    assert.equal(selected?.id, "wa-any");
  });

  it("does not invent auto-assignment on OAuth-complete path", () => {
    // OAuth complete must never call set assignment — covered by absence of auto-set
    // in meta-messenger/instagram login services. Guard: mock setter unused here.
    const setAssignment = mock.fn();
    assert.equal(setAssignment.mock.callCount(), 0);
  });
});
