import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type { Customer360SectionId, Customer360WorkspaceRole } from "@workspace/universal-operations-engine";
import { Customer360StickyHeader } from "@/components/universal-operations/customer360/customer360-header";
import {
  Customer360QuickActions,
  type Customer360QuickActionKey,
} from "@/components/universal-operations/customer360/customer360-quick-actions";
import { Customer360Sections } from "@/components/universal-operations/customer360/customer360-sections";
import { Customer360IntelligenceLayer } from "@/components/universal-operations/intelligence/customer360-intelligence-layer";
import { useCustomer360Workspace } from "@/hooks/universal-operations/use-customer360-workspace";
import { useCustomer360Intelligence } from "@/hooks/universal-operations/use-customer360-intelligence";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations";
import { useOperationsCommands } from "@/hooks/universal-operations/use-operations-commands";
import { CallService, ConversationService } from "@/lib/customer-profile/services";
import { operationsEntityWorkspaceHref } from "@/lib/entity-workspace";
import { useAuth } from "@/context/auth-context";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type Customer360ContentProps = {
  row: OperationsRow | null;
  role?: Customer360WorkspaceRole;
  onRoleChange?: (role: Customer360WorkspaceRole) => void;
  templateKey?: string;
  onClose?: () => void;
  /** When embedded inside Operation Workspace — denser chrome, optional section filter. */
  embedded?: boolean;
  showHeader?: boolean;
  showQuickActions?: boolean;
  sectionIds?: Customer360SectionId[];
  className?: string;
};

/** Shared Customer360 body — used by Sheet host and Operation Workspace Customer tab. */
export function Customer360Content({
  row,
  role = "manager",
  onRoleChange,
  templateKey = "clinic",
  onClose,
  embedded = false,
  showHeader = true,
  showQuickActions = true,
  sectionIds,
  className,
}: Customer360ContentProps) {
  const { t } = useTranslation("common");
  const { data, isLoading, sections, configError } = useCustomer360Workspace(row, role);
  const { data: workspaceConfig } = useUniversalOperationsConfig(templateKey);
  const { snapshot, blocks, configError: intelligenceConfigError } = useCustomer360Intelligence(
    data ?? undefined,
    role,
    workspaceConfig,
  );
  const { company } = useAuth();
  const [, setLocation] = useLocation();
  const operations = useOperationsCommands(row?.customerId ?? data?.customer.id ?? null);

  const serviceAmountCents = Number(row?.values.amount) || data?.todaysOperation.paymentAmountCents || 0;

  const handleOperationAction = useCallback(
    (action: "checkIn" | "checkOut" | "noShow" | "cancel" | "reschedule" | "collect" | "invoice") => {
      const bookingId = data?.todaysOperation.id ?? row?.id;
      if (!bookingId && action !== "collect" && action !== "invoice") return;
      if (action === "checkIn" && bookingId) operations.checkIn.mutate(bookingId);
      if (action === "checkOut" && bookingId) operations.checkOut.mutate(bookingId);
      if (action === "noShow" && bookingId) operations.markNoShow.mutate({ bookingId });
      if (action === "cancel" && bookingId) operations.cancelBooking.mutate({ bookingId });
      if (action === "collect" && data?.customer.id) {
        const amountCents = data.outstandingBalanceCents > 0 ? data.outstandingBalanceCents : serviceAmountCents;
        if (amountCents <= 0) return;
        operations.collectPayment.mutate({
          customerId: data.customer.id,
          amountCents,
          currency: String(row?.values.currency ?? "USD"),
          method: "cash",
          bookingId: bookingId ?? undefined,
          servicePriceCents: amountCents,
          serviceDescription: String(row?.values.service ?? "Service"),
        });
      }
      if (action === "invoice" && data?.customer.id) {
        const amountCents = serviceAmountCents > 0 ? serviceAmountCents : data.outstandingBalanceCents;
        if (amountCents <= 0) return;
        operations.generateInvoice.mutate({
          customerId: data.customer.id,
          amountCents,
          currency: String(row?.values.currency ?? "USD"),
        });
      }
    },
    [data, row, operations, serviceAmountCents],
  );

  const handleQuickAction = useCallback(
    async (action: Customer360QuickActionKey) => {
      if (action === "call" && data?.customer.phone) {
        CallService.initiateCall(data.customer.phone);
        return;
      }
      if (action === "whatsapp" && data?.customer.id) {
        await ConversationService.openWhatsappConversation({
          customerId: data.customer.id,
          companyId: company?.id,
          navigate: setLocation,
        });
        return;
      }
      if (action === "collect") {
        handleOperationAction("collect");
        return;
      }
      if (action === "invoice") {
        handleOperationAction("invoice");
        return;
      }
      if (action === "crm" && data?.customer.id) {
        setLocation(
          operationsEntityWorkspaceHref(data.customer.id, {
            operationId: row?.id ?? null,
          }),
        );
      }
    },
    [data, company?.id, setLocation, handleOperationAction, row?.id],
  );

  const [headerCollapsed, setHeaderCollapsed] = useState(embedded);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<Customer360SectionId, boolean>>>({});
  const [commSearch, setCommSearch] = useState("");

  const toggleSection = useCallback((id: Customer360SectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const reference = row ? String(row.values.reference ?? row.id) : "";
  const visibleSections = sectionIds?.length
    ? sections.filter((section) => sectionIds.includes(section.id))
    : sections;

  if (isLoading) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6", className)}>
        <DashboardPageFallback />
      </div>
    );
  }

  if (configError || intelligenceConfigError) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6 text-sm text-destructive", className)}>
        {(configError ?? intelligenceConfigError)?.message}
      </div>
    );
  }

  if (!data || ("isEmpty" in data && data.isEmpty)) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground", className)}>
        {t("customer360.noCustomerSelected")}
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      style={{ ["--c360-header-h" as string]: headerCollapsed ? "3.5rem" : "7rem" }}
    >
      {showHeader && (
        <Customer360StickyHeader
          data={data}
          reference={reference}
          collapsed={headerCollapsed}
          onToggleCollapse={() => setHeaderCollapsed((v) => !v)}
          onClose={onClose ?? (() => undefined)}
        />
      )}
      {showQuickActions && (
        <Customer360QuickActions
          ready={operations.isReady}
          canCollect={Boolean(data.customer.id) && (data.outstandingBalanceCents > 0 || serviceAmountCents > 0)}
          canInvoice={Boolean(data.customer.id) && (serviceAmountCents > 0 || data.outstandingBalanceCents > 0)}
          onAction={handleQuickAction}
        />
      )}
      {onRoleChange && (
        <div className="border-b border-border/40 px-3 py-1.5">
          <Select value={role} onValueChange={(v) => onRoleChange(v as Customer360WorkspaceRole)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t("customer360.rolePreview")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receptionist">{t("customer360.roles.receptionist")}</SelectItem>
              <SelectItem value="cashier">{t("customer360.roles.cashier")}</SelectItem>
              <SelectItem value="nurse">{t("customer360.roles.nurse")}</SelectItem>
              <SelectItem value="doctor">{t("customer360.roles.doctor")}</SelectItem>
              <SelectItem value="manager">{t("customer360.roles.manager")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={cn("flex-1 space-y-5 overflow-y-auto", embedded ? "px-3 py-3" : "px-4 py-5")}>
        {snapshot && blocks.length > 0 && (
          <Customer360IntelligenceLayer
            snapshot={snapshot}
            blockIds={blocks.map((b) => b.id)}
            showCopilot={blocks.some((b) => b.id === "floating_copilot")}
          />
        )}
        {visibleSections.map((section) => (
          <Customer360Sections
            key={section.id}
            data={data}
            sectionId={section.id}
            collapsed={collapsedSections[section.id]}
            onToggle={() => toggleSection(section.id)}
            communicationGroups={snapshot?.communicationGroups}
            communicationSearch={commSearch}
            onCommunicationSearchChange={setCommSearch}
            onOperationAction={handleOperationAction}
            operationsReady={operations.isReady}
          />
        ))}
      </div>
    </div>
  );
}
