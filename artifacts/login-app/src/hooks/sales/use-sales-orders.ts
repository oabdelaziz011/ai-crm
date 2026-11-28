import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  assignSalesOrderDelivery,
  approveSalesOrder,
  getSalesOrderDetail,
  listCustomerSalesOrderHistory,
  listSalesOrdersPage,
  normalizeSalesOrdersFilters,
  prepareDeliveryNotifyRetry,
  recordDeliveryNotifyResult,
  rejectSalesOrder,
  updateSalesOrderLifecycleStatus,
} from "@/lib/sales-orders/sales-orders-query";
import { notifyCustomerOrderStatusOnWhatsApp } from "@/lib/sales-orders/sales-order-customer-status-notify";
import { sendWhatsAppTextMessage } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type { SalesOrdersListFilters } from "@/lib/sales-orders/sales-order-types";

async function dispatchCustomerStatusWhatsApp(input: {
  companyId: string;
  orderId: string;
  status: string;
  dryRun?: boolean;
}) {
  const detail = await getSalesOrderDetail(supabase, input.companyId, input.orderId);
  if (!detail) {
    return { customerNotifyOutcome: "skipped" as const, customerNotifyReason: "order_not_found" };
  }
  const idempotencyKey = `customer-status:${input.orderId}:${input.status}`;
  const result = await notifyCustomerOrderStatusOnWhatsApp({
    client: supabase,
    companyId: input.companyId,
    orderId: input.orderId,
    orderNumber: detail.orderNumber,
    status: input.status,
    conversationId: detail.conversationId,
    customerPhone: detail.customerPhone,
    customerName: detail.customerName,
    idempotencyKey,
    dryRun: input.dryRun === true,
  });
  return {
    customerNotifyOutcome: result.outcome,
    customerNotifyReason: result.reason,
    customerNotifyMessageId: result.messageId,
  };
}

export const SALES_ORDERS_LIST_KEY = ["sales", "orders", "list"] as const;
export const SALES_ORDER_DETAIL_KEY = ["sales", "orders", "detail"] as const;
export const CUSTOMER_SALES_ORDERS_KEY = ["sales", "orders", "customer"] as const;

export function salesOrdersListKey(companyId: string | null, filters: SalesOrdersListFilters) {
  return [...SALES_ORDERS_LIST_KEY, companyId, filters] as const;
}

export function salesOrderDetailKey(companyId: string | null, orderId: string | null) {
  return [...SALES_ORDER_DETAIL_KEY, companyId, orderId] as const;
}

export function useSalesOrdersList(
  companyId: string | null,
  filtersInput: Partial<SalesOrdersListFilters>,
) {
  const filters = normalizeSalesOrdersFilters(filtersInput);
  return useQuery({
    queryKey: salesOrdersListKey(companyId, filters),
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) throw new Error("Company required");
      return listSalesOrdersPage(supabase, companyId, filters);
    },
  });
}

export function useSalesOrderDetail(companyId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: salesOrderDetailKey(companyId, orderId),
    enabled: Boolean(companyId && orderId),
    queryFn: async () => {
      if (!companyId || !orderId) return null;
      return getSalesOrderDetail(supabase, companyId, orderId);
    },
  });
}

export function customerSalesOrdersKey(companyId: string | null, customerId: string | null) {
  return [...CUSTOMER_SALES_ORDERS_KEY, companyId, customerId] as const;
}

export function useCustomerSalesOrderHistory(
  companyId: string | null,
  customerId: string | null,
) {
  return useQuery({
    queryKey: customerSalesOrdersKey(companyId, customerId),
    enabled: Boolean(companyId && customerId),
    queryFn: async () => {
      if (!companyId || !customerId) {
        return {
          totalOrders: 0,
          totalValue: 0,
          currency: "EGP",
          firstOrderAt: null,
          lastOrderAt: null,
          orders: [],
        };
      }
      return listCustomerSalesOrderHistory(supabase, companyId, customerId);
    },
  });
}

async function dispatchWorkerWhatsApp(input: {
  companyId: string;
  orderId: string;
  workerPhone: string;
  notifyMessage: string;
  idempotencyKey: string;
  /** When true, skip live WhatsApp (local verification). */
  dryRun?: boolean;
  dryRunFail?: boolean;
}) {
  if (input.dryRun) {
    if (input.dryRunFail) {
      await recordDeliveryNotifyResult(supabase, {
        companyId: input.companyId,
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        ok: false,
        error: "DRY_RUN_FORCED_FAILURE",
      });
      return { notifyOk: false as const, notifyError: "DRY_RUN_FORCED_FAILURE", messageId: null };
    }
    const messageId = `dry-run-${Date.now()}`;
    await recordDeliveryNotifyResult(supabase, {
      companyId: input.companyId,
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      ok: true,
      messageId,
    });
    return { notifyOk: true as const, notifyError: null, messageId };
  }

  try {
    const result = await sendWhatsAppTextMessage(
      input.companyId,
      input.workerPhone,
      input.notifyMessage,
    );
    const messageId =
      result && typeof result === "object" && "messageId" in result
        ? String((result as { messageId?: string }).messageId ?? "")
        : "";
    await recordDeliveryNotifyResult(supabase, {
      companyId: input.companyId,
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      ok: true,
      messageId: messageId || null,
    });
    return { notifyOk: true as const, notifyError: null, messageId: messageId || null };
  } catch (error) {
    const notifyError = error instanceof Error ? error.message : String(error);
    await recordDeliveryNotifyResult(supabase, {
      companyId: input.companyId,
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      ok: false,
      error: notifyError,
    });
    return { notifyOk: false as const, notifyError, messageId: null };
  }
}

export function useSalesOrderApprovalActions(companyId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = async (orderId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SALES_ORDERS_LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: salesOrderDetailKey(companyId, orderId) }),
      queryClient.invalidateQueries({ queryKey: CUSTOMER_SALES_ORDERS_KEY }),
    ]);
  };

  const approve = useMutation({
    mutationFn: async (input: {
      orderId: string;
      userId: string;
      note?: string;
      dryRunNotify?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      const result = await approveSalesOrder(supabase, { companyId, ...input });
      const customerNotify = await dispatchCustomerStatusWhatsApp({
        companyId,
        orderId: input.orderId,
        status: "confirmed",
        dryRun: input.dryRunNotify === true,
      });
      if (result.autoAssigned && result.assignResult) {
        const notify = await dispatchWorkerWhatsApp({
          companyId,
          orderId: input.orderId,
          workerPhone: result.assignResult.workerPhone,
          notifyMessage: result.assignResult.notifyMessage,
          idempotencyKey: result.assignResult.idempotencyKey,
          dryRun: input.dryRunNotify === true,
        });
        return { ...result, ...notify, ...customerNotify };
      }
      return {
        ...result,
        notifyOk: false as const,
        notifyError: null,
        messageId: null,
        ...customerNotify,
      };
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const reject = useMutation({
    mutationFn: async (input: {
      orderId: string;
      userId: string;
      note?: string;
      dryRunNotify?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      await rejectSalesOrder(supabase, { companyId, ...input });
      const customerNotify = await dispatchCustomerStatusWhatsApp({
        companyId,
        orderId: input.orderId,
        status: "cancelled",
        dryRun: input.dryRunNotify === true,
      });
      return customerNotify;
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const assignDelivery = useMutation({
    mutationFn: async (input: {
      orderId: string;
      userId: string;
      workerId: string;
      reassign?: boolean;
      reassignmentReason?: string;
      dryRunNotify?: boolean;
      dryRunFail?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      const assigned = await assignSalesOrderDelivery(supabase, {
        companyId,
        orderId: input.orderId,
        userId: input.userId,
        workerId: input.workerId,
        mode: "manual",
        reassign: input.reassign === true,
        reassignmentReason: input.reassignmentReason,
      });
      const notify = await dispatchWorkerWhatsApp({
        companyId,
        orderId: input.orderId,
        workerPhone: assigned.workerPhone,
        notifyMessage: assigned.notifyMessage,
        idempotencyKey: assigned.idempotencyKey,
        dryRun: input.dryRunNotify === true,
        dryRunFail: input.dryRunFail === true,
      });
      const customerNotify = await dispatchCustomerStatusWhatsApp({
        companyId,
        orderId: input.orderId,
        status: "out_for_delivery",
        dryRun: input.dryRunNotify === true,
      });
      return { ...assigned, ...notify, ...customerNotify };
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const updateLifecycleStatus = useMutation({
    mutationFn: async (input: {
      orderId: string;
      userId: string;
      toStatus: "processing" | "delivered";
      note?: string;
      dryRunNotify?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      const detail = await updateSalesOrderLifecycleStatus(supabase, {
        companyId,
        orderId: input.orderId,
        userId: input.userId,
        toStatus: input.toStatus,
        note: input.note,
      });
      const customerNotify = await dispatchCustomerStatusWhatsApp({
        companyId,
        orderId: input.orderId,
        status: input.toStatus,
        dryRun: input.dryRunNotify === true,
      });
      return { detail, ...customerNotify };
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const retryDeliveryNotify = useMutation({
    mutationFn: async (input: {
      orderId: string;
      userId: string;
      dryRunNotify?: boolean;
      dryRunFail?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      const prepared = await prepareDeliveryNotifyRetry(supabase, {
        companyId,
        orderId: input.orderId,
        userId: input.userId,
      });
      if (prepared.skipped) {
        return { skipped: true as const, reason: prepared.reason ?? null };
      }
      const notify = await dispatchWorkerWhatsApp({
        companyId,
        orderId: input.orderId,
        workerPhone: prepared.workerPhone!,
        notifyMessage: prepared.notifyMessage!,
        idempotencyKey: prepared.idempotencyKey!,
        dryRun: input.dryRunNotify === true,
        dryRunFail: input.dryRunFail === true,
      });
      return { skipped: false as const, ...notify };
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const approveCancellation = useMutation({
    mutationFn: async (input: {
      orderId: string;
      requestId: string;
      userId: string;
      decisionReason?: string;
      dryRunNotify?: boolean;
    }) => {
      if (!companyId) throw new Error("Company required");
      const { approveCancellationRequest, recordCancellationNotifyResult } = await import(
        "@/lib/sales-orders/sales-orders-query"
      );
      const result = await approveCancellationRequest(supabase, { companyId, ...input });
      if (result.cancelled && result.workerPhone && result.notifyMessage && result.idempotencyKey) {
        if (input.dryRunNotify === true) {
          const messageId = `dry-run-cancel-${Date.now()}`;
          await recordCancellationNotifyResult(supabase, {
            companyId,
            orderId: input.orderId,
            idempotencyKey: result.idempotencyKey,
            ok: true,
            messageId,
          });
          return { ...result, notifyOk: true as const, notifyError: null, messageId };
        }
        try {
          const wa = await sendWhatsAppTextMessage(
            companyId,
            result.workerPhone,
            result.notifyMessage,
          );
          const messageId =
            wa && typeof wa === "object" && "messageId" in wa
              ? String((wa as { messageId?: string }).messageId ?? "")
              : "";
          await recordCancellationNotifyResult(supabase, {
            companyId,
            orderId: input.orderId,
            idempotencyKey: result.idempotencyKey,
            ok: true,
            messageId: messageId || null,
          });
          return { ...result, notifyOk: true as const, notifyError: null, messageId: messageId || null };
        } catch (error) {
          const notifyError = error instanceof Error ? error.message : String(error);
          await recordCancellationNotifyResult(supabase, {
            companyId,
            orderId: input.orderId,
            idempotencyKey: result.idempotencyKey,
            ok: false,
            error: notifyError,
          });
          return { ...result, notifyOk: false as const, notifyError, messageId: null };
        }
      }
      return { ...result, notifyOk: false as const, notifyError: null, messageId: null };
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  const rejectCancellation = useMutation({
    mutationFn: async (input: {
      orderId: string;
      requestId: string;
      userId: string;
      decisionReason?: string;
    }) => {
      if (!companyId) throw new Error("Company required");
      const { rejectCancellationRequest } = await import("@/lib/sales-orders/sales-orders-query");
      await rejectCancellationRequest(supabase, { companyId, ...input });
    },
    onSuccess: async (_data, variables) => {
      await invalidate(variables.orderId);
    },
  });

  return {
    approve,
    reject,
    assignDelivery,
    updateLifecycleStatus,
    retryDeliveryNotify,
    approveCancellation,
    rejectCancellation,
  };
}
