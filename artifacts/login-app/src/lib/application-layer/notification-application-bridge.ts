import type { NotificationCenterProjectionDto } from "@workspace/application-layer";
import type { NotificationListFilter as AppNotificationListFilter } from "@workspace/application-layer";
import type {
  Notification,
  NotificationCategory,
  NotificationListFilter,
  NotificationPriority,
  NotificationVisualType,
} from "@/lib/notifications/types";
import type { NotificationItem } from "@/lib/types";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap.js";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { createLoginAppApplicationPorts } from "./create-login-app-application-ports.js";

function mapListFilter(filter: NotificationListFilter & { page?: number; pageSize?: number; search?: string }): AppNotificationListFilter {
  return {
    unreadOnly: filter.unreadOnly,
    page: filter.page,
    pageSize: filter.pageSize,
    search: filter.search,
    category: undefined,
    eventType: filter.event && filter.event !== "all" ? filter.event : undefined,
    priority: filter.priority && filter.priority !== "all" ? filter.priority : undefined,
    includeArchived: filter.includeArchived,
  };
}

function severityToVisual(severity?: string): NotificationVisualType {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  return "info";
}

export function mapProjectionItemToNotification(
  item: NotificationCenterProjectionDto["notifications"][number],
  tenantId: string,
): Notification {
  return {
    id: item.id,
    companyId: tenantId,
    recipient: { userId: null, companyId: tenantId },
    templateKey: item.title,
    titleKey: item.title,
    messagePayload: item.message,
    event: null,
    status: item.read ? "read" : "delivered",
    priority: (item.priority as NotificationPriority) ?? "normal",
    channel: "in_app",
    visualType: severityToVisual(item.severity),
    category: (item.category as NotificationCategory) ?? "system",
    isRead: item.read,
    archivedAt: null,
    createdAt: item.createdAt,
  };
}

export function mapProjectionItemToLegacy(item: NotificationCenterProjectionDto["notifications"][number]): NotificationItem {
  const visual = severityToVisual(item.severity);
  return {
    id: item.id,
    company_id: "",
    user_id: null,
    title_key: item.title,
    message: item.message,
    type: visual,
    category: (item.category as NotificationCategory) ?? "system",
    is_read: item.read,
    created_at: item.createdAt,
  };
}

export async function fetchNotificationsViaApplicationLayer(
  portContext: LoginAppPortContext,
  filter: NotificationListFilter & { page?: number; pageSize?: number; search?: string } = {},
): Promise<NotificationCenterProjectionDto> {
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });

  const mapped = mapListFilter(filter);
  const result = await registry.getServices().notification.getNotifications(
    {
      unreadOnly: mapped.unreadOnly,
      page: mapped.page,
      pageSize: mapped.pageSize,
      search: mapped.search,
      category: mapped.category,
      eventType: mapped.eventType,
      priority: mapped.priority,
      includeArchived: mapped.includeArchived,
    },
    context,
  );

  return result.data;
}

export async function markNotificationReadViaApplicationLayer(
  portContext: LoginAppPortContext,
  notificationId: string,
): Promise<void> {
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });
  await registry.getServices().notification.markRead({ notificationId }, context);
}

export async function markAllNotificationsReadViaApplicationLayer(
  portContext: LoginAppPortContext,
): Promise<void> {
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });
  await registry.getServices().notification.markAllRead(context);
}

export async function archiveNotificationViaApplicationLayer(
  portContext: LoginAppPortContext,
  notificationId: string,
): Promise<void> {
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });
  await registry.getServices().notification.archive({ notificationId }, context);
}

/** Secondary action — routed through write port (no command pipeline yet). */
export async function markNotificationUnreadViaPorts(
  portContext: LoginAppPortContext,
  notificationId: string,
): Promise<void> {
  const ports = createLoginAppApplicationPorts(portContext);
  await ports.notificationWrite.markUnread(portContext.companyId, portContext.actorUserId, notificationId);
}
