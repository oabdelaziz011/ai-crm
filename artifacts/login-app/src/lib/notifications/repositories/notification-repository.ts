import type { SupabaseClient } from "@supabase/supabase-js";
import { mapNotificationToInsertRow, mapRowToNotification } from "@/lib/notifications/domain/notification-mapper";
import type {
  Notification,
  NotificationListFilter,
  NotificationPage,
} from "@/lib/notifications/types";

const DEFAULT_PAGE_SIZE = 20;

export type NotificationListQuery = {
  companyId: string;
  page: number;
  pageSize?: number;
  filter?: NotificationListFilter;
};

export class NotificationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(query: NotificationListQuery): Promise<NotificationPage> {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (query.page - 1) * pageSize;
    const to = from + pageSize - 1;
    const filter = query.filter ?? {};

    let builder = this.client
      .from("notifications")
      .select(
        "id, company_id, user_id, title, message, type, category, is_read, archived_at, priority, event_type, channel, delivery_status, created_at",
        { count: "exact" },
      )
      .eq("company_id", query.companyId);

    if (!filter.includeArchived) {
      builder = builder.is("archived_at", null);
    }
    if (filter.unreadOnly) {
      builder = builder.eq("is_read", false);
    }
    if (filter.priority && filter.priority !== "all") {
      builder = builder.eq("priority", filter.priority);
    }
    if (filter.event && filter.event !== "all") {
      builder = builder.eq("event_type", filter.event);
    }

    builder = builder.order("created_at", {
      ascending: filter.sort === "oldest",
    });

    const { data, error, count } = await builder.range(from, to);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    const items = (data ?? []).map((row) => mapRowToNotification(row as never));

    return {
      items,
      total,
      pageSize,
      page: query.page,
      hasMore: from + items.length < total,
    };
  }

  async getUnreadCount(companyId: string): Promise<number> {
    const { count, error } = await this.client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_read", false)
      .is("archived_at", null);

    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async create(row: Record<string, unknown>): Promise<Notification> {
    const { data, error } = await this.client
      .from("notifications")
      .insert(row)
      .select(
        "id, company_id, user_id, title, message, type, category, is_read, archived_at, priority, event_type, channel, delivery_status, created_at",
      )
      .single();

    if (error) throw new Error(error.message);
    return mapRowToNotification(data as never);
  }

  async markRead(companyId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("notifications")
      .update({ is_read: true, delivery_status: "read" })
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) throw new Error(error.message);
  }

  async markUnread(companyId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("notifications")
      .update({ is_read: false, delivery_status: "delivered" })
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) throw new Error(error.message);
  }

  async markAllRead(companyId: string): Promise<void> {
    const { error } = await this.client
      .from("notifications")
      .update({ is_read: true, delivery_status: "read" })
      .eq("company_id", companyId)
      .eq("is_read", false)
      .is("archived_at", null);

    if (error) throw new Error(error.message);
  }

  async markManyRead(companyId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client
      .from("notifications")
      .update({ is_read: true, delivery_status: "read" })
      .eq("company_id", companyId)
      .in("id", ids)
      .eq("is_read", false);

    if (error) throw new Error(error.message);
  }

  async archive(companyId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("notifications")
      .update({
        archived_at: new Date().toISOString(),
        delivery_status: "archived",
      })
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) throw new Error(error.message);
  }

  buildInsertRow = mapNotificationToInsertRow;
}
