import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  branchDraftsToRpcPayload,
  createBranchDraft,
  defaultBranchDays,
  validateBranchDrafts,
} from "./branch-draft.ts";

function openDraft(partial: { clientId: string; isMain: boolean; name: string; url: string; opens?: string; closes?: string }) {
  const draft = createBranchDraft({
    clientId: partial.clientId,
    isMain: partial.isMain,
    name: partial.name,
    address: "12 Nile Street",
    locationUrl: partial.url,
  });
  draft.days = defaultBranchDays().map((day) =>
    day.dayOfWeek === 1
      ? { ...day, closed: false, opensAt: partial.opens ?? "09:00", closesAt: partial.closes ?? "17:00" }
      : { ...day, closed: true, opensAt: "", closesAt: "" },
  );
  return draft;
}

describe("onboarding branch drafts", () => {
  it("keeps an independent location and schedule for each branch", () => {
    const main = openDraft({
      clientId: "main",
      isMain: true,
      name: "Main",
      url: "https://maps.google.com/?q=main",
      opens: "08:00",
      closes: "16:00",
    });
    const extra = openDraft({
      clientId: "extra",
      isMain: false,
      name: "Airport",
      url: "https://maps.google.com/?q=airport",
      opens: "10:00",
      closes: "22:00",
    });
    const result = validateBranchDrafts([main, extra]);
    assert.equal(result.ok, true);
    const payload = branchDraftsToRpcPayload([main, extra], {
      timezone: "Africa/Cairo",
      city: "Cairo",
      country: "EG",
    });
    assert.equal(payload[0]?.location_url, "https://maps.google.com/?q=main");
    assert.equal(payload[1]?.location_url, "https://maps.google.com/?q=airport");
    assert.equal(payload[0]?.weekly_hours.find((day) => day.day_of_week === 1)?.opens_at, "08:00");
    assert.equal(payload[1]?.weekly_hours.find((day) => day.day_of_week === 1)?.opens_at, "10:00");
  });

  it("accepts Google Maps hosts and rejects other websites", () => {
    for (const url of [
      "https://maps.google.com/?q=main",
      "https://www.google.com/maps/place/Cairo",
      "https://maps.app.goo.gl/abc",
      "https://goo.gl/maps/abc",
      "https://maps.google.co.uk/maps?q=berlin",
    ]) {
      const draft = openDraft({ clientId: "main", isMain: true, name: "Main", url });
      assert.equal(validateBranchDrafts([draft]).ok, true, url);
    }
    for (const url of ["https://example.com/maps", "https://evil.google.com/maps", "http://maps.google.evil.com/"]) {
      const draft = openDraft({ clientId: "main", isMain: true, name: "Main", url });
      const result = validateBranchDrafts([draft]);
      assert.equal(result.ok, false, url);
      assert.equal(result.byId.main?.locationUrl, "invalidUrl");
    }
  });

  it("rejects a bad map link and a closing time that is not after opening", () => {
    const draft = openDraft({
      clientId: "main",
      isMain: true,
      name: "Main",
      url: "javascript:alert(1)",
      opens: "18:00",
      closes: "09:00",
    });
    const result = validateBranchDrafts([draft]);
    assert.equal(result.ok, false);
    assert.equal(result.byId.main?.locationUrl, "invalidUrl");
    assert.equal(result.byId.main?.hours, "invalidHours");
  });

  it("does not assume every day is open", () => {
    const closedWeekend = defaultBranchDays().filter((day) => day.closed).map((day) => day.dayOfWeek);
    assert.deepEqual(closedWeekend, [5, 6]);
  });
});

describe("onboarding branch migration", () => {
  const sql = readFileSync(
    new URL("../../../../../../supabase/migrations/444_profile_name_parts_and_onboarding_branches.sql", import.meta.url),
    "utf8",
  );

  it("keeps existing full_name and blocks another company", () => {
    assert.match(sql, /add column if not exists first_name/);
    assert.match(sql, /full_name = coalesce\(public\.profiles\.full_name, excluded\.full_name\)/);
    assert.match(sql, /v_company <> p_company_id/);
    assert.match(sql, /raise exception 'forbidden'/);
    assert.match(sql, /template_key = 'admin'/);
    assert.match(sql, /maps\\\.google/);
    assert.doesNotMatch(sql, /\^https\?:\/\/\[\^\[:space:\]\]\+\$/);
    assert.doesNotMatch(sql, /grant execute on function public\.save_onboarding_branches\(uuid, jsonb\) to anon/);
    assert.match(sql, /to authenticated/);
  });
});
