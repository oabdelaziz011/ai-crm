import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  registerDefaultWorkflows,
  resolveWorkflowEngine,
  type OperationsRow,
  type OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useOperationsCommands } from "@/hooks/universal-operations/use-operations-commands";
import { CallService, ConversationService } from "@/lib/customer-profile/services";
import { operationsEntityWorkspaceHref } from "@/lib/entity-workspace";
import {
  BookingDomainError,
  formatBookingValidationErrors,
} from "@/lib/scheduling/booking-domain";
import {
  featureFlagsFromConfig,
  getOperationsActionRegistry,
  type ActionGroupSection,
  type OperationsActionRuntime,
  type ResolvedOperationsAction,
} from "@/lib/universal-operations/action-registry";
import type { CollectPaymentDialogValues } from "@/components/universal-operations/action-registry/collect-payment-dialog";

type PendingConfirmation = {
  action: ResolvedOperationsAction;
  row: OperationsRow;
};

/** Actions that remove the row from the active operations queue. */
const QUEUE_REMOVE_ACTION_IDS = new Set([
  "appointments.cancel",
  "appointments.mark_no_show",
  "appointments.archive",
]);

registerDefaultWorkflows({ includeExamples: true });

function resolveOperationsActionErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof BookingDomainError) {
    return formatBookingValidationErrors(error.codes, (key) => t(key));
  }
  if (error instanceof Error && error.message.trim()) {
    if (error.message === "Permission denied") {
      return t("universalOperations.actions.noPermission");
    }
    return error.message;
  }
  return t("universalOperations.actions.toast.error");
}

function removeRowFromQueuePages(page: unknown, rowId: string): unknown {
  if (!page || typeof page !== "object") return page;
  const record = page as { rows?: OperationsRow[]; total?: number };
  if (!Array.isArray(record.rows)) return page;
  const nextRows = record.rows.filter((row) => row.id !== rowId);
  if (nextRows.length === record.rows.length) return page;
  return {
    ...record,
    rows: nextRows,
    total: typeof record.total === "number" ? Math.max(0, record.total - 1) : nextRows.length,
  };
}

export function useOperationsActionEngine({
  config,
  onOpenCustomer360,
  workspaceRole,
  templateKey = "clinic",
  onActionSuccess,
}: {
  config: OperationsWorkspaceConfig | undefined;
  /** Optional override; default opens Operations Entity Workspace (never CRM). */
  onOpenCustomer360?: (row: OperationsRow) => void;
  /** Customer360 / workspace preview role — aliases resolved by the Workflow Engine. */
  workspaceRole?: string;
  /** Operations template key → registered workflow pack. */
  templateKey?: string;
  /** Called after a successful action (e.g. clear selection / close drawer). */
  onActionSuccess?: (action: ResolvedOperationsAction, row: OperationsRow) => void;
}) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const commands = useOperationsCommands();
  const qc = useQueryClient();
  const registry = useMemo(() => getOperationsActionRegistry(), []);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [pendingPaymentRow, setPendingPaymentRow] = useState<OperationsRow | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const workflow = useMemo(
    () => resolveWorkflowEngine(templateKey) ?? resolveWorkflowEngine("clinic"),
    [templateKey],
  );
  const actorRole = workflow?.resolveActorRole(workspaceRole);

  const openCustomerWorkspace = useCallback(
    (row: OperationsRow) => {
      if (onOpenCustomer360) {
        onOpenCustomer360(row);
        return;
      }
      if (!row.customerId) return;
      setLocation(
        operationsEntityWorkspaceHref(row.customerId, {
          operationId: row.id,
        }),
      );
    },
    [onOpenCustomer360, setLocation],
  );

  const buildRuntime = useCallback(
    (row: OperationsRow): OperationsActionRuntime => ({
      row,
      config,
      hasPermission,
      isSuperAdmin,
      actorRole,
      clinicRole: actorRole,
      workflow,
      featureFlags: featureFlagsFromConfig(config),
      commandsReady: commands.isReady,
      openCustomer360: openCustomerWorkspace,
      navigate: (path) => setLocation(path),
      commands: {
        checkIn: (bookingId) => commands.checkIn.mutateAsync(bookingId),
        checkOut: (bookingId) => commands.checkOut.mutateAsync(bookingId),
        cancelBooking: (input) => commands.cancelBooking.mutateAsync(input),
        markNoShow: (input) => commands.markNoShow.mutateAsync(input),
        collectPayment: (input) => commands.collectPayment.mutateAsync(input),
        assignEmployee: (input) => commands.assignEmployee.mutateAsync(input),
        rescheduleBooking: (input) => commands.rescheduleBooking.mutateAsync(input),
        transitionClinicStatus: (input) => commands.transitionClinicStatus.mutateAsync(input),
        completeTriage: (input) => commands.completeTriage.mutateAsync(input),
        generateInvoice: (input) => commands.generateInvoice.mutateAsync(input),
      },
      communication: {
        call: (phone) => CallService.initiateCall(phone),
        openWhatsApp: async ({ customerId }) => {
          await ConversationService.openWhatsappConversation({
            customerId,
            companyId: company?.id,
            navigate: setLocation,
          });
        },
      },
    }),
    [
      actorRole,
      company?.id,
      commands,
      config,
      hasPermission,
      isSuperAdmin,
      openCustomerWorkspace,
      setLocation,
      workflow,
    ],
  );

  const getAvailableActions = useCallback(
    (row: OperationsRow): ResolvedOperationsAction[] => {
      const runtime = buildRuntime(row);
      return registry.getAvailableActions(runtime).map((action) => ({
        ...action,
        title: t(action.titleKey),
      }));
    },
    [buildRuntime, registry, t],
  );

  const getAvailableActionGroups = useCallback(
    (row: OperationsRow): ActionGroupSection[] => {
      const actions = getAvailableActions(row);
      return registry.groupActions(actions).map((section) => ({
        ...section,
        actions: section.actions.map((action) => ({
          ...action,
          title: t(action.titleKey),
        })),
      }));
    },
    [getAvailableActions, registry, t],
  );

  const getQuickBarActions = useCallback(
    (row: OperationsRow): ResolvedOperationsAction[] => {
      const runtime = buildRuntime(row);
      return registry.getQuickBarActions(runtime).map((action) => ({
        ...action,
        title: t(action.titleKey),
      }));
    },
    [buildRuntime, registry, t],
  );

  const refreshOperationsQueue = useCallback(
    async (actionId: string, rowId: string) => {
      if (QUEUE_REMOVE_ACTION_IDS.has(actionId)) {
        qc.setQueriesData({ queryKey: ["universal-operations", "queue"] }, (page) =>
          removeRowFromQueuePages(page, rowId),
        );
      }
      await qc.invalidateQueries({
        queryKey: ["universal-operations", "queue"],
        refetchType: "active",
      });
      await qc.invalidateQueries({
        queryKey: ["universal-operations"],
        refetchType: "active",
      });
    },
    [qc],
  );

  const runAction = useCallback(
    async (action: ResolvedOperationsAction, row: OperationsRow) => {
      if (!action.enabled) return;
      setExecutingId(action.id);
      try {
        const definition = registry.get(action.id);
        await registry.execute(action.id, buildRuntime(row));
        await refreshOperationsQueue(action.id, row.id);
        onActionSuccess?.(action, row);
        if (definition?.toastOnSuccess !== false) {
          toast.success(t("universalOperations.actions.toast.success", { action: action.title }));
        }
      } catch (error) {
        const message = resolveOperationsActionErrorMessage(error, t);
        if (message.toLowerCase().includes("coming soon")) {
          toast.message(t("universalOperations.actions.comingSoon"));
        } else {
          toast.error(message || t("universalOperations.actions.toast.error"));
        }
      } finally {
        setExecutingId(null);
      }
    },
    [buildRuntime, onActionSuccess, refreshOperationsQueue, registry, t],
  );

  const requestAction = useCallback(
    async (action: ResolvedOperationsAction, row: OperationsRow) => {
      if (!action.enabled) return;
      if (action.dialog === "confirm" && action.confirmation) {
        setPendingConfirmation({ action, row });
        return;
      }
      if (action.id === "billing.collect_payment" && action.dialog === "modal") {
        setPendingPaymentRow(row);
        return;
      }
      await runAction(action, row);
    },
    [runAction],
  );

  const confirmPendingAction = useCallback(async () => {
    if (!pendingConfirmation) return;
    const { action, row } = pendingConfirmation;
    setPendingConfirmation(null);
    await runAction(action, row);
  }, [pendingConfirmation, runAction]);

  const cancelPendingAction = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  const confirmCollectPayment = useCallback(
    async (values: CollectPaymentDialogValues) => {
      setExecutingId("billing.collect_payment");
      try {
        await commands.collectPayment.mutateAsync(values);
        toast.success(
          t("universalOperations.actions.toast.success", {
            action: t("universalOperations.actions.items.collectPayment"),
          }),
        );
        setPendingPaymentRow(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("universalOperations.actions.toast.error");
        toast.error(message || t("universalOperations.actions.toast.error"));
      } finally {
        setExecutingId(null);
      }
    },
    [commands.collectPayment, t],
  );

  const cancelCollectPayment = useCallback(() => {
    setPendingPaymentRow(null);
  }, []);

  return {
    getAvailableActions,
    getAvailableActionGroups,
    getQuickBarActions,
    requestAction,
    executingId,
    pendingConfirmation,
    confirmPendingAction,
    cancelPendingAction,
    pendingPaymentRow,
    confirmCollectPayment,
    cancelCollectPayment,
  };
}
