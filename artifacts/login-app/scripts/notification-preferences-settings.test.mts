/**
 * Notification preference settings — delivery gates must stay real.
 * Run: npx --yes tsx --test scripts/notification-preferences-settings.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NotificationPreferenceService } from "../src/lib/notifications/services/notification-service.ts";
import {
  buildMutedEventsForTopicToggle,
  isChannelEnabled,
  isTopicEnabled,
  readMutedEvents,
} from "../src/lib/notifications/preference-settings.ts";
import type { NotificationPreference } from "../src/lib/notifications/types/notification-types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pref(
  partial: Partial<NotificationPreference> &
    Pick<NotificationPreference, "channel" | "muted" | "scope">,
): NotificationPreference {
  return {
    id: partial.id ?? "p1",
    companyId: "c1",
    userId: partial.userId ?? "u1",
    scope: partial.scope,
    channel: partial.channel,
    minPriority: partial.minPriority ?? null,
    muted: partial.muted,
    workingHours: partial.workingHours ?? null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("notification preference helpers", () => {
  it("defaults channels and topics to enabled when no rows", () => {
    assert.equal(isChannelEnabled([], "u1", "whatsapp"), true);
    assert.equal(isTopicEnabled([], "u1", "new_bookings"), true);
  });

  it("respects channel mute", () => {
    const prefs = [pref({ scope: "user", channel: "whatsapp", muted: true, userId: "u1" })];
    assert.equal(isChannelEnabled(prefs, "u1", "whatsapp"), false);
    assert.equal(isChannelEnabled(prefs, "u1", "email"), true);
  });

  it("topic toggle mutes only booking events", () => {
    const muted = buildMutedEventsForTopicToggle([], "new_bookings", false);
    assert.ok(muted.includes("appointment_created"));
    assert.equal(isTopicEnabled([pref({
      scope: "user",
      channel: null,
      muted: false,
      userId: "u1",
      workingHours: {
        timezone: "UTC",
        startHour: 0,
        endHour: 24,
        days: [0, 1, 2, 3, 4, 5, 6],
        mutedEvents: muted,
      },
    })], "u1", "new_bookings"), false);
    assert.equal(
      isTopicEnabled(
        [
          pref({
            scope: "user",
            channel: null,
            muted: false,
            userId: "u1",
            workingHours: {
              timezone: "UTC",
              startHour: 0,
              endHour: 24,
              days: [0, 1, 2, 3, 4, 5, 6],
              mutedEvents: muted,
            },
          }),
        ],
        "u1",
        "invoice_paid",
      ),
      true,
    );
  });

  it("readMutedEvents reads settings bag", () => {
    const events = readMutedEvents(
      [
        pref({
          scope: "user",
          channel: null,
          muted: false,
          workingHours: {
            timezone: "UTC",
            startHour: 0,
            endHour: 24,
            days: [0],
            mutedEvents: ["payment_received"],
          },
        }),
      ],
      "u1",
    );
    assert.deepEqual(events, ["payment_received"]);
  });
});

describe("NotificationPreferenceService.shouldDeliver", () => {
  const service = new NotificationPreferenceService({} as never);

  it("blocks muted channel", () => {
    const ok = service.shouldDeliver(
      [pref({ scope: "user", channel: "email", muted: true })],
      { userId: "u1", companyId: "c1" },
      "email",
      "normal",
      "payment_received",
    );
    assert.equal(ok, false);
  });

  it("allows other channels when one is muted", () => {
    const ok = service.shouldDeliver(
      [pref({ scope: "user", channel: "email", muted: true })],
      { userId: "u1", companyId: "c1" },
      "in_app",
      "normal",
      "payment_received",
    );
    assert.equal(ok, true);
  });

  it("blocks muted event without blocking other events", () => {
    const prefs = [
      pref({
        scope: "user",
        channel: null,
        muted: false,
        workingHours: {
          timezone: "UTC",
          startHour: 0,
          endHour: 24,
          days: [0, 1, 2, 3, 4, 5, 6],
          mutedEvents: ["appointment_created"],
        },
      }),
    ];
    assert.equal(
      service.shouldDeliver(
        prefs,
        { userId: "u1", companyId: "c1" },
        "in_app",
        "normal",
        "appointment_created",
      ),
      false,
    );
    assert.equal(
      service.shouldDeliver(
        prefs,
        { userId: "u1", companyId: "c1" },
        "in_app",
        "normal",
        "payment_received",
      ),
      true,
    );
  });

  it("event-settings bag muted=false does not mute all channels", () => {
    const ok = service.shouldDeliver(
      [pref({ scope: "user", channel: null, muted: false })],
      { userId: "u1", companyId: "c1" },
      "whatsapp",
      "normal",
    );
    assert.equal(ok, true);
  });
});

describe("notifications settings page wiring", () => {
  const page = readFileSync(
    join(root, "src/pages/dashboard/settings/notifications-page.tsx"),
    "utf8",
  );

  it("uses real Switch + preference hooks and removes logout stub", () => {
    assert.match(page, /useNotificationPreferences/);
    assert.match(page, /useUpdateNotificationPreference/);
    assert.match(page, /from \"@\/components\/ui\/switch\"/);
    assert.doesNotMatch(page, /signOut|LogOut|buttons\.signOut/);
    assert.doesNotMatch(page, /weeklyReport|aiInsights/);
    assert.match(page, /handleChannelToggle|handleTopicToggle/);
  });

  it("EN/AR strings cover new keys", () => {
    const en = readFileSync(join(root, "src/locales/en/common.json"), "utf8");
    const ar = readFileSync(join(root, "src/locales/ar/common.json"), "utf8");
    for (const key of [
      "inApp",
      "emailAlerts",
      "channelsTitle",
      "topicsTitle",
      "newBookingsDesc",
      "invoicePaidDesc",
      "whatsappAlertsDesc",
    ]) {
      assert.match(en, new RegExp(`"${key}"`));
      assert.match(ar, new RegExp(`"${key}"`));
    }
  });
});
