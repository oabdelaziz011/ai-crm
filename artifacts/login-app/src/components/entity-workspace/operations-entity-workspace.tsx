import { Component, Suspense, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  DEFAULT_OPS_ENTITY_TABS,
  OPS_ENTITY_SEARCHABLE_TABS,
  OperationsEntityShell,
} from "@/components/entity-workspace/operations-entity-shell";
import { EntityWorkspaceSkeleton } from "@/components/entity-workspace/entity-workspace-skeleton";
import { EntityOverviewPanel } from "@/components/entity-workspace/panels/entity-overview-panel";
import { EntityNotesPanel } from "@/components/entity-workspace/panels/entity-notes-panel";
import { EntityAttachmentsPanel } from "@/components/entity-workspace/panels/entity-attachments-panel";
import { EntityTimelinePanel } from "@/components/entity-workspace/panels/entity-timeline-panel";
import { EntityCommunicationPanel } from "@/components/entity-workspace/panels/entity-communication-panel";
import { EntityTasksPanel } from "@/components/entity-workspace/panels/entity-tasks-panel";
import { EntityRelatedPanel } from "@/components/entity-workspace/panels/entity-related-panel";
import { EntityWorkspaceSidebar } from "@/components/entity-workspace/panels/entity-workspace-sidebar";
import { CollectPaymentDialog } from "@/components/universal-operations/action-registry/collect-payment-dialog";
import { EntityWorkspaceProvider, useEntityWorkspace } from "@/context/entity-workspace-context";
import { useOperationsCommands } from "@/hooks/universal-operations/use-operations-commands";
import {
  entityWorkspaceHref,
  normalizeEntityWorkspaceTab,
  resolveEntityWorkspaceLayout,
  type EntityWorkspaceTabId,
} from "@/lib/entity-workspace";
import { customerInitials } from "@/lib/customer-workspace/customer-workspace-utils";
import { CallService, ConversationService } from "@/lib/customer-profile/services";
import { Button } from "@/components/ui/button";

type Props = {
  entityType: string;
  entityId: string;
  tab?: string;
  operationId?: string | null;
};

class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void; message: string; retryLabel: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Entity workspace error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-destructive">{this.props.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            {this.props.retryLabel}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OperationsEntityWorkspace(props: Props) {
  const { t } = useTranslation("common");
  return (
    <EntityWorkspaceProvider
      entityType={props.entityType}
      entityId={props.entityId}
      operationId={props.operationId}
    >
      <WorkspaceErrorBoundary
        message={t("entityWorkspace.error.title", { defaultValue: "Workspace failed to load" })}
        retryLabel={t("buttons.refresh")}
        onRetry={() => window.location.reload()}
      >
        <OperationsEntityWorkspaceInner tab={props.tab} />
      </WorkspaceErrorBoundary>
    </EntityWorkspaceProvider>
  );
}

function OperationsEntityWorkspaceInner({ tab }: { tab?: string }) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const workspace = useEntityWorkspace();
  const layout = resolveEntityWorkspaceLayout("operations", workspace.entityType);
  const activeTab = normalizeEntityWorkspaceTab(tab, layout?.defaultTab ?? "overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const commands = useOperationsCommands(
    workspace.operation?.customerId ?? workspace.customer?.id ?? null,
  );

  const tabs = useMemo(
    () =>
      DEFAULT_OPS_ENTITY_TABS.filter((item) => {
        if (item.id === "tasks") return workspace.permissions.canReadTasks;
        if (item.id === "communication") {
          return Boolean(
            workspace.customer &&
              (workspace.permissions.canCall ||
                workspace.permissions.canWhatsapp ||
                workspace.customer.email?.trim()),
          );
        }
        if (item.id === "related") return workspace.entityType === "customer";
        return true;
      }),
    [workspace.customer, workspace.entityType, workspace.permissions],
  );

  const showSearch = OPS_ENTITY_SEARCHABLE_TABS.includes(activeTab);

  const navigateTab = (next: EntityWorkspaceTabId) => {
    setLocation(
      entityWorkspaceHref({
        module: "operations",
        entityType: workspace.entityType,
        entityId: workspace.entityId,
        tab: next,
        operationId: workspace.operationId,
      }),
    );
  };

  if (workspace.isLoading) {
    return <EntityWorkspaceSkeleton />;
  }

  if (workspace.isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-destructive">
          {t("entityWorkspace.error.title", { defaultValue: "Workspace failed to load" })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{workspace.error?.message}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={() => workspace.refetch()}>
          {t("buttons.refresh")}
        </Button>
      </div>
    );
  }

  const customer = workspace.customer;
  const operation = workspace.operation;
  const title =
    workspace.entityType === "customer"
      ? (customer?.name ?? t("entityWorkspace.untitledEntity"))
      : t("entityWorkspace.entityTitle", {
          type: workspace.entityType,
          id: workspace.entityId.slice(0, 8),
        });
  const initials =
    workspace.entityType === "customer" && customer
      ? customerInitials(customer.name)
      : workspace.entityType.slice(0, 2).toUpperCase();

  const lastActivity = workspace.timeline[0]?.timestamp
    ? format(parseISO(workspace.timeline[0].timestamp), "MMM d, HH:mm")
    : null;

  return (
    <>
      <OperationsEntityShell
        title={title}
        entityTypeLabel={workspace.entityType}
        subtitle={customer?.email ?? customer?.phone ?? null}
        initials={initials}
        tags={workspace.tags.map((tag) => tag.name)}
        statusLabel={operation ? String(operation.values.status ?? operation.statusId) : null}
        resourceLabel={
          operation && String(operation.values.resource) !== "—"
            ? String(operation.values.resource)
            : null
        }
        branchLabel={
          operation && String(operation.values.branch) !== "—"
            ? String(operation.values.branch)
            : null
        }
        operationLabel={
          operation && String(operation.values.service) !== "—"
            ? String(operation.values.service)
            : null
        }
        lastActivityLabel={lastActivity}
        ownerLabel={null}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(next) => {
          if (next === "notes") setNoteComposerOpen(false);
          navigateTab(next);
        }}
        onBack={() => setLocation("/queue")}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={showSearch}
        showAddNote={workspace.permissions.canCreateNotes}
        onAddNote={() => {
          setNoteComposerOpen(true);
          if (activeTab !== "notes") navigateTab("notes");
        }}
        showCollectPayment={workspace.permissions.canCollectPayment}
        onCollectPayment={() => setPaymentOpen(true)}
        showCall={workspace.permissions.canCall}
        onCall={() => {
          if (!customer?.phone) return;
          CallService.initiateCall(customer.phone);
          void workspace.recordCommunication("call");
        }}
        showWhatsapp={workspace.permissions.canWhatsapp}
        onWhatsapp={() => {
          if (!customer) return;
          void ConversationService.openWhatsappConversation({
            customerId: customer.id,
            companyId: workspace.companyId,
            navigate: setLocation,
          })
            .then(() => workspace.recordCommunication("whatsapp"))
            .catch(() => toast.error(t("entityWorkspace.communication.whatsappMissing")));
        }}
        onCopyLink={() => {
          const path = entityWorkspaceHref({
            module: "operations",
            entityType: workspace.entityType,
            entityId: workspace.entityId,
            tab: activeTab,
            operationId: workspace.operationId,
          });
          const absolute = `${window.location.origin}/dashboard/operations${path.split("?")[0]}${
            workspace.operationId ? `?operationId=${workspace.operationId}` : ""
          }`;
          void navigator.clipboard.writeText(absolute).then(() => {
            toast.success(t("entityWorkspace.actions.linkCopied", { defaultValue: "Link copied" }));
          });
        }}
        sidebar={
          <EntityWorkspaceSidebar
            searchQuery={showSearch ? searchQuery : ""}
            onOpenNote={(noteId) => {
              workspace.setFocusNoteId(noteId);
              navigateTab("notes");
            }}
          />
        }
      >
        <Suspense fallback={<DashboardPageFallback />}>
          {activeTab === "overview" ? (
            <div className="space-y-3">
              <EntityOverviewPanel />
              <EntityNotesPanel searchQuery={searchQuery} dense />
            </div>
          ) : null}
          {activeTab === "notes" ? (
            <EntityNotesPanel searchQuery={searchQuery} composerOpen={noteComposerOpen} />
          ) : null}
          {activeTab === "files" ? <EntityAttachmentsPanel searchQuery={searchQuery} /> : null}
          {activeTab === "communication" ? <EntityCommunicationPanel /> : null}
          {activeTab === "timeline" || activeTab === "activity" ? (
            <EntityTimelinePanel
              searchQuery={searchQuery}
              onOpenNote={(noteId) => {
                workspace.setFocusNoteId(noteId);
                navigateTab("notes");
              }}
            />
          ) : null}
          {activeTab === "tasks" ? <EntityTasksPanel /> : null}
          {activeTab === "related" ? <EntityRelatedPanel onOpenTab={navigateTab} /> : null}
        </Suspense>
      </OperationsEntityShell>

      <CollectPaymentDialog
        open={paymentOpen}
        row={operation}
        busy={commands.collectPayment.isPending}
        onCancel={() => setPaymentOpen(false)}
        onConfirm={(values) => {
          void commands.collectPayment
            .mutateAsync(values)
            .then(() => {
              toast.success(
                t("universalOperations.actions.toast.success", {
                  action: t("entityWorkspace.actions.collectPayment"),
                }),
              );
              setPaymentOpen(false);
              workspace.refetch();
            })
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : t("entityWorkspace.notes.saveError"));
            });
        }}
      />
    </>
  );
}
