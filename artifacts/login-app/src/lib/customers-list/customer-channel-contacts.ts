/**
 * Prior channel contact (WhatsApp / Email / SMS conversations) for customers list tags.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import type {
  CustomerListChannelContactKey,
  CustomerListChannelContactMap,
} from "./customer-entity-notes-merge";

export function customerChannelContactsKey(
  companyId: string | null | undefined,
  customerIdsKey: string,
) {
  return ["customers-list-channel-contacts", companyId ?? "none", customerIdsKey] as const;
}

const CHANNEL_KEYS = new Set<CustomerListChannelContactKey>(["whatsapp", "email", "sms"]);

function asChannelKey(value: unknown): CustomerListChannelContactKey | null {
  const key = String(value ?? "").trim().toLowerCase();
  return CHANNEL_KEYS.has(key as CustomerListChannelContactKey)
    ? (key as CustomerListChannelContactKey)
    : null;
}

export async function fetchCustomerChannelContacts(input: {
  companyId: string;
  customerIds: string[];
}): Promise<CustomerListChannelContactMap> {
  const ids = [...new Set(input.customerIds.map((id) => id.trim()).filter(Boolean))];
  const result: CustomerListChannelContactMap = new Map();
  if (!input.companyId.trim() || ids.length === 0) return result;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("conversations")
      .select("customer_id, channel_type")
      .eq("company_id", input.companyId)
      .in("customer_id", chunk)
      .in("channel_type", ["whatsapp", "email", "sms"])
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const customerId = typeof row.customer_id === "string" ? row.customer_id : "";
      const channel = asChannelKey(row.channel_type);
      if (!customerId || !channel) continue;
      const set = result.get(customerId) ?? new Set<CustomerListChannelContactKey>();
      set.add(channel);
      result.set(customerId, set);
    }
  }

  return result;
}

export function useCustomerChannelContacts(
  companyId: string | null | undefined,
  customerIds: string[],
) {
  const sortedKey = [...customerIds].sort().join(",");
  return useQuery({
    queryKey: customerChannelContactsKey(companyId, sortedKey),
    enabled: Boolean(companyId) && customerIds.length > 0,
    staleTime: APP_QUERY_STALE_MS,
    refetchOnWindowFocus: true,
    queryFn: () =>
      fetchCustomerChannelContacts({
        companyId: companyId!,
        customerIds,
      }),
  });
}

/** Keep notes + channel tags live while the customers list is open. */
export function useCustomerListTagRealtime(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`customers-list-tags-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entity_activities",
          filter: `tenant_id=eq.${companyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["customers-list-entity-notes"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["customers-list-channel-contacts"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}

/** Optimistically mark a customer as having notes in the list presence cache. */
export function markCustomerHasEntityNoteInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  customerId: string,
) {
  queryClient.setQueriesData<Set<string>>(
    { queryKey: ["customers-list-entity-notes"] },
    (previous) => {
      const next = new Set(previous ?? []);
      next.add(customerId);
      return next;
    },
  );
}

/** Optimistically mark prior channel contact for list tags. */
export function markCustomerChannelContactInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  customerId: string,
  channel: CustomerListChannelContactKey,
) {
  queryClient.setQueriesData<CustomerListChannelContactMap>(
    { queryKey: ["customers-list-channel-contacts"] },
    (previous) => {
      const next: CustomerListChannelContactMap = new Map(previous ?? []);
      const set = new Set(next.get(customerId) ?? []);
      set.add(channel);
      next.set(customerId, set);
      return next;
    },
  );
}
