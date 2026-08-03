import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContext, createApplicationLayerRegistry } from "../index.js";
import { mapNotifications } from "../mappers/projection-mappers.js";
import {
  mapPlatformEventToNotificationInput,
  PLATFORM_NOTIFICATION_EVENT_TYPES,
} from "../notifications/platform-event-notification-mapper.js";
import type { NotificationListResult } from "../ports/repository-ports.js";

describe("Notification platform — event mapper", () => {
  it("maps all subscribed platform events", () => {
    assert.equal(PLATFORM_NOTIFICATION_EVENT_TYPES.length, 16);
  });

  it("maps BookingCreated with correlation and navigation", () => {
    const input = mapPlatformEventToNotificationInput({
      eventType: "BookingCreated",
      eventId: "evt_1",
      schemaVersion: 1,
      tenantId: "company_1",
      correlationId: "corr_1",
      actorId: "user_1",
      actorType: "user",
      sourceModule: "booking",
      entityType: "booking",
      entityId: "book_1",
      occurredAt: "2026-08-01T10:00:00.000Z",
      payload: { bookingId: "book_1", customerId: "cust_1", scheduledAt: "2026-08-02T09:00:00.000Z" },
    });

    assert.ok(input);
    assert.equal(input?.tenantId, "company_1");
    assert.equal(input?.correlationId, "corr_1");
    assert.equal(input?.entityId, "book_1");
    assert.equal(input?.idempotencyKey, "corr_1:BookingCreated");
    assert.equal(input?.category, "booking");
  });

  it("routes TaskAssigned to assignee user", () => {
    const input = mapPlatformEventToNotificationInput({
      eventType: "TaskAssigned",
      eventId: "evt_2",
      schemaVersion: 1,
      tenantId: "company_1",
      correlationId: "corr_2",
      actorId: "manager_1",
      actorType: "user",
      sourceModule: "tasks",
      entityType: "task",
      entityId: "task_1",
      occurredAt: "2026-08-01T10:00:00.000Z",
      payload: { taskId: "task_1", assigneeId: "user_99", title: "Follow up VIP" },
    });

    assert.ok(input);
    assert.equal(input?.recipientUserId, "user_99");
    assert.equal(input?.severity, "action_required");
  });
});

describe("Notification platform — projection", () => {
  it("maps paginated notification list with unread count", () => {
    const result: NotificationListResult = Object.freeze({
      items: Object.freeze([
        Object.freeze({
          id: "n1",
          tenantId: "tenant_1",
          title: "Booking confirmed",
          message: "A booking was confirmed.",
          category: "booking",
          priority: "normal",
          severity: "success",
          read: false,
          createdAt: "2026-08-01T10:00:00.000Z",
          correlationId: "corr-abc",
          entityType: "booking",
          entityId: "b1",
          navigationTarget: "/dashboard/bookings",
        }),
      ]),
      total: 1,
      page: 1,
      pageSize: 12,
      hasMore: false,
    });

    const projection = mapNotifications(result, 3);
    assert.equal(projection.unreadCount, 3);
    assert.equal(projection.total, 1);
    assert.equal(projection.hasMore, false);
    assert.equal(projection.notifications[0]?.correlationId, "corr-abc");
    assert.equal(projection.notifications[0]?.navigationTarget, "/dashboard/bookings");
  });
});

describe("Notification platform — application service", () => {
  const context = () =>
    createContext({
      tenantId: "tenant_1",
      actorId: "user_1",
      permissions: ["*"],
    });

  it("lists notifications via NotificationApplicationService", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const result = await registry.getServices().notification.getNotifications({}, context());
    assert.ok(result.data.notifications.length >= 1);
    assert.equal(typeof result.data.unreadCount, "number");
  });

  it("marks notification read and archives via command pipeline", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    await services.notification.markRead({ notificationId: "n1" }, context());
    await services.notification.markAllRead(context());
    await services.notification.archive({ notificationId: "n1" }, context());
  });
});
