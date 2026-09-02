import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Updates business_appointment_exception_items when the WhatsApp provider
 * reaches a terminal Meta submit outcome for a linked queue item.
 */
export async function reconcileBusinessExceptionNotification(
  client: SupabaseClient,
  input: {
    companyId: string;
    queueId: string;
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
    businessExceptionItemId?: string | null;
  },
): Promise<void> {
  const itemId = input.businessExceptionItemId?.trim() || null;

  let item: {
    id: string;
    exception_id: string;
    notification_status: string;
  } | null = null;

  if (itemId) {
    const { data, error } = await client
      .from("business_appointment_exception_items")
      .select("id, exception_id, notification_status")
      .eq("company_id", input.companyId)
      .eq("id", itemId)
      .maybeSingle();
    if (error) {
      console.warn("[business-exception] reconcile lookup by id failed", error.message);
      return;
    }
    item = data;
  }

  if (!item) {
    const { data, error } = await client
      .from("business_appointment_exception_items")
      .select("id, exception_id, notification_status")
      .eq("company_id", input.companyId)
      .eq("notification_queue_id", input.queueId)
      .maybeSingle();
    if (error) {
      console.warn("[business-exception] reconcile lookup by queue failed", error.message);
      return;
    }
    item = data;
  }

  if (!item) return;
  if (item.notification_status === "sent" || item.notification_status === "skipped") return;
  if (input.status === "failed" && item.notification_status === "failed") return;

  const { error: updateError } = await client
    .from("business_appointment_exception_items")
    .update({
      notification_status: input.status,
      provider_message_id:
        input.status === "sent" ? (input.providerMessageId?.trim() || null) : null,
      error_message: input.status === "failed" ? (input.errorMessage ?? "whatsapp_send_failed") : null,
    })
    .eq("id", item.id)
    .eq("company_id", input.companyId);

  if (updateError) {
    console.warn("[business-exception] reconcile item update failed", updateError.message);
    return;
  }

  await recountExceptionNotificationCounts(client, input.companyId, item.exception_id);
}

export async function recountExceptionNotificationCounts(
  client: SupabaseClient,
  companyId: string,
  exceptionId: string,
): Promise<void> {
  const { data: items, error } = await client
    .from("business_appointment_exception_items")
    .select("notification_status, cancellation_status")
    .eq("company_id", companyId)
    .eq("exception_id", exceptionId);

  if (error) {
    console.warn("[business-exception] recount failed", error.message);
    return;
  }

  let queued = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let cancelled = 0;

  for (const row of items ?? []) {
    if (row.cancellation_status === "cancelled") cancelled += 1;
    switch (row.notification_status) {
      case "queued":
        queued += 1;
        break;
      case "sent":
        sent += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      default:
        break;
    }
  }

  const { error: parentError } = await client
    .from("business_appointment_exceptions")
    .update({
      cancelled_appointments_count: cancelled,
      notification_queued_count: queued,
      notification_sent_count: sent,
      notification_failed_count: failed,
      notification_skipped_count: skipped,
    })
    .eq("id", exceptionId)
    .eq("company_id", companyId);

  if (parentError) {
    console.warn("[business-exception] parent recount update failed", parentError.message);
  }
}
