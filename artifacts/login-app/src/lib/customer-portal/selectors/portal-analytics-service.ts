import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalAnalyticsSnapshot } from "@/lib/customer-portal/types";

export class PortalAnalyticsService {
  constructor(private readonly client: SupabaseClient) {}

  async snapshot(companyId: string): Promise<PortalAnalyticsSnapshot> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: events } = await this.client
      .from("portal_analytics_events")
      .select("event_type, metadata")
      .eq("company_id", companyId)
      .gte("created_at", since.toISOString());

    const visits = (events ?? []).filter((e) => e.event_type === "portal_visit").length;
    const bookings = (events ?? []).filter((e) => e.event_type === "booking_completed").length;
    const cancellations = (events ?? []).filter((e) => e.event_type === "booking_cancelled").length;

    const { count: onlineCount } = await this.client
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("source", "public_booking")
      .gte("created_at", since.toISOString());

    const { count: totalCount } = await this.client
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", since.toISOString());

    const conversion = visits > 0 ? Math.round((bookings / visits) * 100) : 0;
    const onlinePct = totalCount ? Math.round(((onlineCount ?? 0) / totalCount) * 100) : 0;
    const cancelRate = bookings > 0 ? Math.round((cancellations / bookings) * 100) : 0;

    return {
      portalVisits: visits,
      bookingConversionRate: conversion,
      onlineBookingPercent: onlinePct,
      cancellationRate: cancelRate,
      averageBookingTimeSeconds: 0,
      satisfactionScore: null,
    };
  }

  async trackVisit(companyId: string): Promise<void> {
    await this.client.from("portal_analytics_events").insert({
      company_id: companyId,
      event_type: "portal_visit",
      metadata: {},
    });
  }
}
