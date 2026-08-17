import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import { supabase } from "@/lib/supabase";
import { useEntityNotes } from "./use-entity-notes";
import { useEntityAttachments } from "./use-entity-attachments";

export type EntityRelatedCounts = {
  notes: number;
  files: number;
  invoices: number;
  bookings: number;
  messages: number;
};

async function countCustomerRows(
  table: "bookings" | "scheduling_bookings" | "conversations",
  entityId: string,
  companyId?: string | null,
): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("customer_id", entityId);
  if (table === "conversations") {
    query = query.is("deleted_at", null);
    if (companyId) query = query.eq("company_id", companyId);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

/**
 * Live related counts only.
 * Note: bookingRead.listForCustomer is today-scoped — not used for Related KPIs.
 */
export function useEntityRelatedCounts(entityType: string, entityId: string) {
  const { company, user, profile } = useAuth();
  const { hasCompanyPermission: hasPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const companyId = company?.id ?? profile?.company_id ?? null;
  const notesQuery = useEntityNotes(entityType, entityId);
  const filesQuery = useEntityAttachments(entityType, entityId);
  const canReadInvoices = isSuperAdmin || hasPermission("invoices.view");

  const extrasQuery = useQuery({
    queryKey: ["entity-workspace", "related-counts", companyId, entityType, entityId, canReadInvoices],
    enabled: Boolean(companyId && user?.id && entityType === "customer" && entityId),
    queryFn: async (): Promise<Pick<EntityRelatedCounts, "invoices" | "bookings" | "messages">> => {
      if (!companyId || !user?.id) {
        return { invoices: 0, bookings: 0, messages: 0 };
      }

      const [classicBookings, schedulingBookings, messages] = await Promise.all([
        countCustomerRows("bookings", entityId),
        countCustomerRows("scheduling_bookings", entityId),
        countCustomerRows("conversations", entityId, companyId),
      ]);

      let invoices = 0;
      if (canReadInvoices) {
        const ports = createLoginAppApplicationPorts({
          companyId,
          actorUserId: user.id,
          isSuperAdmin,
          hasPermission,
        });
        const rows = await ports.invoiceRead.listForCustomer(companyId, entityId).catch(() => []);
        invoices = rows.length;
      }

      return {
        invoices,
        // Prefer scheduling ops bookings; fall back to classic CRM bookings.
        bookings: schedulingBookings > 0 ? schedulingBookings : classicBookings,
        messages,
      };
    },
  });

  const data: EntityRelatedCounts | undefined =
    notesQuery.isSuccess && filesQuery.isSuccess && extrasQuery.isSuccess
      ? {
          notes: notesQuery.data?.length ?? 0,
          files: filesQuery.data?.length ?? 0,
          invoices: extrasQuery.data?.invoices ?? 0,
          bookings: extrasQuery.data?.bookings ?? 0,
          messages: extrasQuery.data?.messages ?? 0,
        }
      : undefined;

  return {
    data,
    isLoading: notesQuery.isLoading || filesQuery.isLoading || extrasQuery.isLoading,
    isSuccess: Boolean(data),
  };
}
