import { supabase } from "@/lib/supabase";

export type NotificationBusPublishParams = {
  eventCode: string;
  companyId?: string | null;
  payload?: Record<string, unknown>;
  channels?: string[];
  idempotencyKey?: string;
};

/**
 * Publishes a billing domain event to the notification bus (RPC v1).
 * Channel delivery is handled by subscribers (in-app inline in Phase B).
 */
export async function notificationBusPublishV1(
  params: NotificationBusPublishParams,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("notification_bus_publish_v1", {
    p_event_code: params.eventCode,
    p_company_id: params.companyId ?? null,
    p_payload: params.payload ?? {},
    p_channels: params.channels ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as string | null) ?? null;
}
