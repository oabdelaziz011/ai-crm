import { useCallback, useState } from "react";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type { Customer360SectionId, Customer360WorkspaceRole } from "@workspace/universal-operations-engine";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Customer360StickyHeader } from "@/components/universal-operations/customer360/customer360-header";
import { Customer360QuickActions } from "@/components/universal-operations/customer360/customer360-quick-actions";
import { Customer360Sections } from "@/components/universal-operations/customer360/customer360-sections";
import { Customer360IntelligenceLayer } from "@/components/universal-operations/intelligence/customer360-intelligence-layer";
import { useCustomer360Workspace } from "@/hooks/universal-operations/use-customer360-workspace";
import { useCustomer360Intelligence } from "@/hooks/universal-operations/use-customer360-intelligence";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations";
import { useOperationsCommands } from "@/hooks/universal-operations/use-operations-commands";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

export function Customer360Workspace({
  row,
  open,
  onClose,
  role = "manager",
  onRoleChange,
  templateKey = "clinic",
}: {
  row: OperationsRow | null;
  open: boolean;
  onClose: () => void;
  role?: Customer360WorkspaceRole;
  onRoleChange?: (role: Customer360WorkspaceRole) => void;
  templateKey?: string;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, sections, configError } = useCustomer360Workspace(row, role);
  const { data: workspaceConfig } = useUniversalOperationsConfig(templateKey);
  const { snapshot, blocks, configError: intelligenceConfigError } = useCustomer360Intelligence(data ?? undefined, role, workspaceConfig);
  const operations = useOperationsCommands(row?.customerId ?? data?.customer.id ?? null);

  const handleOperationAction = useCallback(
    (action: "checkIn" | "checkOut" | "noShow" | "cancel" | "reschedule" | "collect") => {
      const bookingId = data?.todaysOperation.id ?? row?.id;
      if (!bookingId) return;
      if (action === "checkIn") operations.checkIn.mutate(bookingId);
      if (action === "checkOut") operations.checkOut.mutate(bookingId);
      if (action === "cancel") operations.cancelBooking.mutate({ bookingId });
      if (action === "collect" && data?.customer.id) {
        operations.collectPayment.mutate({
          customerId: data.customer.id,
          amountCents: data.outstandingBalanceCents,
          currency: "USD",
          method: "cash",
        });
      }
    },
    [data, row, operations],
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<Customer360SectionId, boolean>>>({});
  const [commSearch, setCommSearch] = useState("");

  const toggleSection = useCallback((id: Customer360SectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const reference = row ? String(row.values.reference ?? row.id) : "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="relative flex w-full flex-col gap-0 p-0 sm:max-w-[580px] lg:max-w-[620px]"
        style={{ ["--c360-header-h" as string]: headerCollapsed ? "3.5rem" : "7rem" }}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <DashboardPageFallback />
          </div>
        ) : configError || intelligenceConfigError ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
            {(configError ?? intelligenceConfigError)?.message}
          </div>
        ) : !data || ("isEmpty" in data && data.isEmpty) ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {t("customer360.noCustomerSelected")}
          </div>
        ) : (
          <>
            <Customer360StickyHeader
              data={data}
              reference={reference}
              collapsed={headerCollapsed}
              onToggleCollapse={() => setHeaderCollapsed((v) => !v)}
              onClose={onClose}
            />
            <Customer360QuickActions />
            {onRoleChange && (
              <div className="border-b border-border/40 px-4 py-2">
                <Select value={role} onValueChange={(v) => onRoleChange(v as Customer360WorkspaceRole)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("customer360.rolePreview")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receptionist">{t("customer360.roles.receptionist")}</SelectItem>
                    <SelectItem value="cashier">{t("customer360.roles.cashier")}</SelectItem>
                    <SelectItem value="nurse">{t("customer360.roles.nurse")}</SelectItem>
                    <SelectItem value="manager">{t("customer360.roles.manager")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1 space-y-8 overflow-y-auto px-4 py-5">
              {snapshot && blocks.length > 0 && (
                <Customer360IntelligenceLayer
                  snapshot={snapshot}
                  blockIds={blocks.map((b) => b.id)}
                  showCopilot={blocks.some((b) => b.id === "floating_copilot")}
                />
              )}
              {sections.map((section) => (
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
