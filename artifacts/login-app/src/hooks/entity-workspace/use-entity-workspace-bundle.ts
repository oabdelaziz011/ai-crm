import { useQuery } from "@tanstack/react-query";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type {
  EntityAttachment,
  EntityNote,
  EntityTimelineEvent,
} from "@/lib/entity-workspace";
import type { Customer } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import { mapBookingReadModelToRow } from "@/lib/application-layer/operations-queue-row-mapper";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations/use-universal-operations-queue";
import { ConversationService, type WhatsappConversationRef } from "@/lib/customer-profile/services";
import { supabase } from "@/lib/supabase";
import { useEntityWorkspaceServices } from "./use-entity-workspace-services";

export type EntityRelatedCounts = {
  notes: number;
  files: number;
  invoices: number;
  bookings: number;
  messages: number;
  tasks: number;
};

export type EntityWorkspaceTag = { id: string; name: string; color: string | null };
export type EntityWorkspaceCustomField = { id: string; label: string; value: string };
export type EntityWorkspaceTask = {
  id: string;
  title: string;
  status: string;
  dueAt?: string;
  completedAt?: string;
};

export type EntityWorkspaceBundle = {
  entityType: string;
  entityId: string;
  operationId: string | null;
  companyId: string;
  customer: Customer | null;
  operation: OperationsRow | null;
  notes: EntityNote[];
  files: EntityAttachment[];
  timeline: EntityTimelineEvent[];
  tags: EntityWorkspaceTag[];
  customFields: EntityWorkspaceCustomField[];
  tasks: EntityWorkspaceTask[];
  related: EntityRelatedCounts;
  whatsapp: WhatsappConversationRef | null;
  permissions: {
    canCollectPayment: boolean;
    canReadTasks: boolean;
    canReadInvoices: boolean;
    canCreateNotes: boolean;
    canCall: boolean;
    canWhatsapp: boolean;
  };
};

export function entityWorkspaceBundleKey(
  companyId: string | null | undefined,
  entityType: string,
  entityId: string,
  operationId: string | null | undefined,
) {
  return ["entity-workspace", "bundle", companyId, entityType, entityId, operationId ?? "none"] as const;
}

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

/** Single parallel load for the Operations Entity Workspace host. */
export function useEntityWorkspaceBundle(input: {
  entityType: string;
  entityId: string;
  operationId?: string | null;
  templateKey?: string;
}) {
  const { company, user, profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? profile?.company_id ?? null;
  const services = useEntityWorkspaceServices();
  const configQuery = useUniversalOperationsConfig(input.templateKey ?? "clinic");
  const config = configQuery.data;

  const canReadTasks = isSuperAdmin || hasPermission("tasks.read");
  const canReadInvoices = isSuperAdmin || hasPermission("invoices.view");
  const canCreateNotes =
    isSuperAdmin ||
    hasPermission("entity.activities.write") ||
    hasPermission("customers.edit") ||
    hasPermission("operations.notes.manage") ||
    hasPermission("operations.read");

  return useQuery({
    queryKey: entityWorkspaceBundleKey(companyId, input.entityType, input.entityId, input.operationId),
    enabled: Boolean(companyId && user?.id && services && input.entityId && config),
    staleTime: 15_000,
    queryFn: async (): Promise<EntityWorkspaceBundle> => {
      if (!companyId || !user?.id || !services || !config) {
        throw new Error("Workspace unavailable");
      }

      const ports = createLoginAppApplicationPorts({
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      });

      // Files first so notes can attach without a second entity_files query.
      const files = await services.attachments.list(input.entityType, input.entityId);

      const [customerResult, operationResult, notes, tagAssignments, customFields, tasks, whatsapp, classicBookings, schedulingBookings, messages, invoices] =
        await Promise.all([
          input.entityType === "customer"
            ? supabase
                .from("customers")
                .select("*")
                .eq("id", input.entityId)
                .single()
                .then(({ data, error }) => {
                  if (error) throw new Error(error.message);
                  return data as Customer;
                })
            : Promise.resolve(null),
          input.operationId
            ? ports.bookingRead.getById(companyId, input.operationId).then((booking) =>
                booking ? mapBookingReadModelToRow(booking, config) : null,
              )
            : Promise.resolve(null),
          services.notes.list(input.entityType, input.entityId, {
            files,
            moduleId: "operations",
          }),
          ports.entityTagRead.listForEntity(companyId, input.entityType, input.entityId).catch(() => []),
          ports.entityCustomFieldRead.listValues(companyId, input.entityType, input.entityId).catch(() => []),
          canReadTasks
            ? ports.taskRead.listForEntity(companyId, input.entityType, input.entityId, 50).catch(() => [])
            : Promise.resolve([]),
          input.entityType === "customer"
            ? ConversationService.findLatestWhatsappConversation(input.entityId, companyId).catch(() => null)
            : Promise.resolve(null),
          input.entityType === "customer" ? countCustomerRows("bookings", input.entityId) : Promise.resolve(0),
          input.entityType === "customer"
            ? countCustomerRows("scheduling_bookings", input.entityId)
            : Promise.resolve(0),
          input.entityType === "customer"
            ? countCustomerRows("conversations", input.entityId, companyId)
            : Promise.resolve(0),
          canReadInvoices && input.entityType === "customer"
            ? ports.invoiceRead.listForCustomer(companyId, input.entityId).catch(() => [])
            : Promise.resolve([]),
        ]);

      // Reuse notes/files — do not re-query inside timeline.list
      const timeline = await services.timeline.list(input.entityType, input.entityId, {
        notes,
        files,
      });

      const operation = operationResult;
      const canCollectPayment =
        Boolean(operation?.customerId) &&
        Number(operation?.values.amount) > 0 &&
        (isSuperAdmin ||
          hasPermission("operations.payment.collect") ||
          hasPermission("invoices.create") ||
          hasPermission("operations.write"));

      const customer = customerResult;
      const related: EntityRelatedCounts = {
        notes: notes.length,
        files: files.length,
        invoices: invoices.length,
        bookings: schedulingBookings > 0 ? schedulingBookings : classicBookings,
        messages,
        tasks: tasks.length,
      };

      return {
        entityType: input.entityType,
        entityId: input.entityId,
        operationId: input.operationId ?? null,
        companyId,
        customer,
        operation,
        notes,
        files,
        timeline,
        tags: tagAssignments.map((a) => ({
          id: a.assignmentId,
          name: a.tag.name,
          color: a.tag.color,
        })),
        customFields: customFields.map((f) => ({
          id: f.fieldId,
          label: f.label,
          value: f.value,
        })),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          dueAt: task.dueAt,
          completedAt: task.completedAt,
        })),
        related,
        whatsapp,
        permissions: {
          canCollectPayment,
          canReadTasks,
          canReadInvoices,
          canCreateNotes,
          canCall: Boolean(customer?.phone?.trim()),
          canWhatsapp: Boolean(whatsapp?.id),
        },
      };
    },
  });
}
