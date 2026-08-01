import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardPageFallback,
  DashboardStatCard,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AiEmployeeDeleteDialog, AiEmployeeStatusBadge, AgentConfigurationWorkspace } from "@/lib/ai-employees/components";
import {
  formatAiEmployeeError,
  formatAiEmployeeLifecycleError,
  formatAiEmployeeSkillError,
  useAiEmployee,
  useAiEmployeeCollaboration,
  useAiEmployeeGovernance,
  useAiEmployeeAdministration,
  useControlTowerEmployeeFilter,
  useAiEmployeeConfigurationState,
  useAiEmployeeLifecycleState,
  useAiEmployeeMemory,
  useAiEmployeeMemorySearch,
  useAiEmployeeOperations,
  useAiEmployeeOperationsControl,
  useAiEmployeeSkills,
  useAiEmployeeSkillsMarketplace,
  useAssignAiEmployeeSkills,
  useTestAiSkill,
  useToggleAiSkillFavorite,
  useArchiveAiEmployee,
  useDeleteAiEmployee,
  useDisableAiEmployee,
  usePublishAiEmployee,
  useRestoreAiEmployee,
  useRollbackAiEmployee,
  useUpdateAiEmployeeConfiguration,
} from "@/lib/ai-employees/hooks";
import {
  hasAiEmployeesCollaborationViewPermission,
  hasAiEmployeesGovernanceViewPermission,
  hasAiEmployeesAdministrationViewPermission,
  hasAiEmployeesDeletePermission,
  hasAiEmployeesEditPermission,
  hasAiEmployeesMemoryViewPermission,
  hasAiEmployeesOperationsControlPermission,
  hasAiEmployeesOperationsViewPermission,
  hasAiEmployeesPublishPermission,
  hasAiEmployeesRollbackPermission,
  hasAiEmployeesSkillsEditPermission,
  hasAiEmployeesSkillsViewPermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { agentEditHref } from "@/config/agents-route-registry";
import { nestedSectionHref, NEST_INDEX } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { Activity, BarChart3, Clock, HeartPulse } from "lucide-react";

const MemoryCenterPanel = lazy(() =>
  import("@/lib/ai-employees/components/memory/memory-center-panel").then((module) => ({
    default: module.MemoryCenterPanel,
  })),
);

const LifecycleManagerPanel = lazy(() =>
  import("@/lib/ai-employees/components/lifecycle/lifecycle-manager-panel").then((module) => ({
    default: module.LifecycleManagerPanel,
  })),
);

const OperationsCenterPanel = lazy(() =>
  import("@/lib/ai-employees/components/operations/operations-center-panel").then((module) => ({
    default: module.OperationsCenterPanel,
  })),
);

const SkillsPlatformPanel = lazy(() =>
  import("@/lib/ai-employees/components/skills/skills-platform-panel").then((module) => ({
    default: module.SkillsPlatformPanel,
  })),
);

const CollaborationPlatformPanel = lazy(() =>
  import("@/lib/ai-employees/components/collaboration/collaboration-platform-panel").then((module) => ({
    default: module.CollaborationPlatformPanel,
  })),
);

const GovernancePlatformPanel = lazy(() =>
  import("@/lib/ai-employees/components/governance/governance-platform-panel").then((module) => ({
    default: module.GovernancePlatformPanel,
  })),
);

const ControlTowerPanel = lazy(() =>
  import("@/lib/ai-employees/components/administration/control-tower-panel").then((module) => ({
    default: module.ControlTowerPanel,
  })),
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AgentDetailPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { company, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { resolvedEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const companyId = company?.id ?? null;

  const canAccess = isAiEmployeesWorkspaceAccessible({
    isSuperAdmin,
    hasPermission,
    agentsFeatureEnabled,
  });
  const canEdit = hasAiEmployeesEditPermission(hasPermission, isSuperAdmin);
  const canDelete = hasAiEmployeesDeletePermission(hasPermission, isSuperAdmin);
  const canPublish = hasAiEmployeesPublishPermission(hasPermission, isSuperAdmin);
  const canRollback = hasAiEmployeesRollbackPermission(hasPermission, isSuperAdmin);
  const canViewOperations = hasAiEmployeesOperationsViewPermission(hasPermission, isSuperAdmin);
  const canViewMemory = hasAiEmployeesMemoryViewPermission(hasPermission, isSuperAdmin);
  const canViewSkills = hasAiEmployeesSkillsViewPermission(hasPermission, isSuperAdmin);
  const canViewCollaboration = hasAiEmployeesCollaborationViewPermission(hasPermission, isSuperAdmin);
  const canViewGovernance = hasAiEmployeesGovernanceViewPermission(hasPermission, isSuperAdmin);
  const canViewAdministration = hasAiEmployeesAdministrationViewPermission(hasPermission, isSuperAdmin);
  const canEditSkills = hasAiEmployeesSkillsEditPermission(hasPermission, isSuperAdmin);
  const canControlOperations = hasAiEmployeesOperationsControlPermission(hasPermission, isSuperAdmin);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const validAgentId = agentId && UUID_PATTERN.test(agentId) ? agentId : null;
  const { data: employee, isLoading, error } = useAiEmployee(companyId, validAgentId);
  const configState = useAiEmployeeConfigurationState(companyId, validAgentId);
  const lifecycleState = useAiEmployeeLifecycleState(companyId, validAgentId);
  const operationsQuery = useAiEmployeeOperations(companyId, validAgentId);
  const memoryQuery = useAiEmployeeMemory(companyId, validAgentId);
  const memorySearch = useAiEmployeeMemorySearch(memoryQuery.data);
  const skillsQuery = useAiEmployeeSkills(companyId, validAgentId);
  const skillsMarketplace = useAiEmployeeSkillsMarketplace(skillsQuery.data);
  const collaborationQuery = useAiEmployeeCollaboration(companyId, validAgentId);
  const governanceQuery = useAiEmployeeGovernance(companyId, validAgentId);
  const administrationQuery = useAiEmployeeAdministration(companyId, validAgentId);
  const controlTowerFilter = useControlTowerEmployeeFilter(administrationQuery.data);
  const assignSkills = useAssignAiEmployeeSkills(companyId, validAgentId);
  const testSkill = useTestAiSkill(companyId);
  const toggleFavorite = useToggleAiSkillFavorite(companyId, validAgentId);
  const operationsControl = useAiEmployeeOperationsControl(companyId, validAgentId);
  const updateConfiguration = useUpdateAiEmployeeConfiguration(companyId, validAgentId);
  const publishEmployee = usePublishAiEmployee(companyId, validAgentId);
  const rollbackEmployee = useRollbackAiEmployee(companyId, validAgentId);
  const archiveEmployee = useArchiveAiEmployee(companyId, validAgentId);
  const restoreEmployee = useRestoreAiEmployee(companyId, validAgentId);
  const disableEmployee = useDisableAiEmployee(companyId, validAgentId);
  const deleteEmployee = useDeleteAiEmployee(companyId);

  const floatingAiContext = useMemo(
    () =>
      validAgentId && employee
        ? {
            page: "agents",
            moduleLabel: t("aiEmployees.title"),
            pageTitle: employee.displayName ?? employee.name,
            aiEmployeeId: validAgentId,
          }
        : null,
    [employee, t, validAgentId],
  );
  useRegisterFloatingAiContext(floatingAiContext);

  const handleDelete = async () => {
    if (!employee) return;
    try {
      await deleteEmployee.mutateAsync(employee.id);
      toast({ title: t("aiEmployees.deleted") });
      setLocation(NEST_INDEX);
    } catch (deleteError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(deleteError),
      });
    }
  };

  if (!canAccess) {
    return <DashboardErrorBanner message={t("aiEmployees.accessDenied")} />;
  }

  if (!agentId || !UUID_PATTERN.test(agentId)) {
    return <DashboardErrorBanner message={t("aiEmployees.notFound")} />;
  }

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error || !employee) {
    return <DashboardErrorBanner message={error?.message ?? t("aiEmployees.notFound")} />;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setLocation(NEST_INDEX)}>
              <ArrowLeft className="size-4" />
            </Button>
            <Avatar className="size-14">
              {employee.avatar ? <AvatarImage src={employee.avatar} alt={employee.displayName} /> : null}
              <AvatarFallback>{employee.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{employee.displayName}</h1>
                <AiEmployeeStatusBadge status={employee.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{employee.description || employee.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
              >
                <Pencil className="me-2 size-4" />
                {t("aiEmployees.actions.edit")}
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="destructive" className="rounded-xl" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="me-2 size-4" />
                {t("aiEmployees.actions.delete")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            label={t("aiEmployees.detail.runtimeStatus")}
            value={
              operationsQuery.data
                ? t(`aiEmployees.operations.runtimeStatus.presence.${operationsQuery.data.runtimeStatus.presence}`)
                : t("aiEmployees.operations.loading")
            }
            icon={Activity}
          />
          <DashboardStatCard
            label={t("aiEmployees.detail.health")}
            value={
              operationsQuery.data ? `${operationsQuery.data.metrics.successRate}%` : t("aiEmployees.detail.placeholder")
            }
            icon={HeartPulse}
          />
          <DashboardStatCard
            label={t("aiEmployees.detail.analytics")}
            value={
              operationsQuery.data
                ? formatCost(operationsQuery.data.costs.estimatedDailyCost, operationsQuery.data.costs.currency)
                : t("aiEmployees.detail.placeholder")
            }
            icon={BarChart3}
          />
          <DashboardStatCard
            label={t("aiEmployees.detail.executions")}
            value={operationsQuery.data?.metrics.executionsToday ?? t("aiEmployees.detail.placeholder")}
            icon={Clock}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <SummaryCard title={t("aiEmployees.detail.general")}>
            <DetailRow label={t("aiEmployees.table.department")} value={employee.department} />
            <DetailRow label={t("aiEmployees.table.owner")} value={employee.owner} />
            <DetailRow label={t("aiEmployees.table.provider")} value={employee.provider} />
            <DetailRow label={t("aiEmployees.table.model")} value={employee.model} />
            <DetailRow label={t("aiEmployees.form.temperature")} value={employee.temperature?.toString()} />
            <DetailRow label={t("aiEmployees.form.maxTokens")} value={employee.maxTokens?.toString()} />
          </SummaryCard>

          <SummaryCard title={t("aiEmployees.detail.prompt")}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {employee.systemPromptSummary || t("aiEmployees.detail.noPrompt")}
            </p>
          </SummaryCard>

          <SummaryCard title={t("aiEmployees.detail.knowledge")}>
            <p className="text-sm text-muted-foreground">{employee.knowledgeSummary}</p>
          </SummaryCard>

          <SummaryCard title={t("aiEmployees.detail.tools")}>
            <p className="text-sm text-muted-foreground">{employee.toolSummary}</p>
          </SummaryCard>

          <SummaryCard title={t("aiEmployees.detail.skills")}>
            <p className="text-sm text-muted-foreground">{employee.skillsSummary}</p>
          </SummaryCard>
        </div>

        <AgentConfigurationWorkspace
          employee={employee}
          preview={configState.preview}
          canEdit={canEdit}
          isSaving={updateConfiguration.isPending || configState.isLoading}
          onSave={(patch) => {
            void updateConfiguration.mutateAsync(patch).catch((saveError) => {
              toast({
                variant: "destructive",
                title: t("aiEmployees.errors.title"),
                description: formatAiEmployeeError(saveError),
              });
            });
          }}
        />

        {canViewAdministration ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <ControlTowerPanel
              employee={employee}
              snapshot={administrationQuery.data ?? null}
              isLoading={administrationQuery.isLoading}
              employeeFilter={controlTowerFilter}
            />
          </Suspense>
        ) : null}

        {canViewOperations ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <OperationsCenterPanel
              employee={employee}
              snapshot={operationsQuery.data ?? null}
              isLoading={operationsQuery.isLoading}
              canControl={canControlOperations}
              isControlling={operationsControl.isPending}
              onControl={async (action) => {
                try {
                  await operationsControl.mutateAsync(action);
                  toast({ title: t(`aiEmployees.operations.controlSuccess.${action}`) });
                } catch (controlError) {
                  toast({
                    variant: "destructive",
                    title: t("aiEmployees.errors.title"),
                    description: formatAiEmployeeLifecycleError(controlError),
                  });
                  throw controlError;
                }
              }}
            />
          </Suspense>
        ) : null}

        {canViewMemory ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <MemoryCenterPanel
              employee={employee}
              snapshot={memoryQuery.data ?? null}
              isLoading={memoryQuery.isLoading}
              search={memorySearch}
            />
          </Suspense>
        ) : null}

        {canViewSkills ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <SkillsPlatformPanel
              employee={employee}
              snapshot={skillsQuery.data ?? null}
              isLoading={skillsQuery.isLoading}
              marketplace={skillsMarketplace}
              canEdit={canEditSkills}
              isAssigning={assignSkills.isPending}
              onAssign={async (skillIds) => {
                try {
                  await assignSkills.mutateAsync(skillIds);
                  toast({ title: t("aiEmployees.skills.assigned.saved") });
                } catch (assignError) {
                  toast({
                    variant: "destructive",
                    title: t("aiEmployees.errors.title"),
                    description: formatAiEmployeeSkillError(assignError),
                  });
                  throw assignError;
                }
              }}
              onToggleFavorite={async (skillId, favorite) => {
                await toggleFavorite.mutateAsync({ skillId, favorite });
              }}
              onTestSkill={async (skillId) => {
                try {
                  const result = await testSkill.mutateAsync(skillId);
                  toast({
                    title: t("aiEmployees.skills.test.success"),
                    description: t("aiEmployees.skills.test.score", { score: result.readiness.score }),
                  });
                } catch (testError) {
                  toast({
                    variant: "destructive",
                    title: t("aiEmployees.errors.title"),
                    description: formatAiEmployeeSkillError(testError),
                  });
                }
              }}
            />
          </Suspense>
        ) : null}

        {canViewCollaboration ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <CollaborationPlatformPanel
              employee={employee}
              snapshot={collaborationQuery.data ?? null}
              isLoading={collaborationQuery.isLoading}
            />
          </Suspense>
        ) : null}

        {canViewGovernance ? (
          <Suspense fallback={<DashboardPageFallback />}>
            <GovernancePlatformPanel
              employee={employee}
              snapshot={governanceQuery.data ?? null}
              isLoading={governanceQuery.isLoading}
            />
          </Suspense>
        ) : null}

        <Suspense fallback={<DashboardPageFallback />}>
          <LifecycleManagerPanel
            companyId={companyId}
            agentId={validAgentId}
            employee={employee}
            preview={lifecycleState.preview}
            validation={lifecycleState.validation}
            readiness={lifecycleState.readiness}
            versions={lifecycleState.versions}
            deployments={lifecycleState.deployments}
            timeline={lifecycleState.timeline}
            isLoading={lifecycleState.isLoading}
            canPublish={canPublish}
            canRollback={canRollback}
            canArchive={canDelete}
            canDisable={canEdit}
            isPublishing={publishEmployee.isPending}
            isRollingBack={rollbackEmployee.isPending}
            isArchiving={archiveEmployee.isPending}
            isDisabling={disableEmployee.isPending}
            onPublish={async (publishNotes) => {
              if (!lifecycleState.preview) {
                throw new Error(t("aiEmployees.lifecycle.publish.notReady"));
              }
              await publishEmployee.mutateAsync({ publishNotes, preview: lifecycleState.preview });
              toast({ title: t("aiEmployees.lifecycle.publish.success") });
            }}
            onRollback={async (versionNumber) => {
              try {
                await rollbackEmployee.mutateAsync(versionNumber);
                toast({ title: t("aiEmployees.lifecycle.rollback.success") });
              } catch (rollbackError) {
                toast({
                  variant: "destructive",
                  title: t("aiEmployees.errors.title"),
                  description: formatAiEmployeeLifecycleError(rollbackError),
                });
                throw rollbackError;
              }
            }}
            onArchive={async () => {
              try {
                await archiveEmployee.mutateAsync();
                toast({ title: t("aiEmployees.deleted") });
              } catch (archiveError) {
                toast({
                  variant: "destructive",
                  title: t("aiEmployees.errors.title"),
                  description: formatAiEmployeeLifecycleError(archiveError),
                });
              }
            }}
            onRestore={async () => {
              try {
                await restoreEmployee.mutateAsync();
                toast({ title: t("aiEmployees.lifecycle.restore.success") });
              } catch (restoreError) {
                toast({
                  variant: "destructive",
                  title: t("aiEmployees.errors.title"),
                  description: formatAiEmployeeLifecycleError(restoreError),
                });
              }
            }}
            onDisable={async () => {
              try {
                await disableEmployee.mutateAsync();
                toast({ title: t("aiEmployees.lifecycle.disable.success") });
              } catch (disableError) {
                toast({
                  variant: "destructive",
                  title: t("aiEmployees.errors.title"),
                  description: formatAiEmployeeLifecycleError(disableError),
                });
              }
            }}
          />
        </Suspense>
      </div>

      <AiEmployeeDeleteDialog
        employee={employee}
        open={deleteOpen}
        isDeleting={deleteEmployee.isPending}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DashboardCard className="space-y-4 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </DashboardCard>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value?.trim() || "—"}</span>
    </div>
  );
}

function formatCost(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
