import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardPageFallback,
  DashboardStatCard,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AiEmployeeDeleteDialog,
  AiEmployeeStatusBadge,
  AgentConfigurationWorkspace,
  ChannelInboundBindingPanel,
} from "@/lib/ai-employees/components";
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
import { agentContinueHref, agentEditHref } from "@/config/agents-route-registry";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import {
  formatEmployeeTagLabel,
  localizeEmployeeSummary,
} from "@/lib/ai-employees/utilities/format-employee-tag-label";
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

type DetailTab = "overview" | "setup" | "channels" | "knowledge" | "lifecycle" | "activity";

const DETAIL_TABS: DetailTab[] = [
  "overview",
  "setup",
  "channels",
  "knowledge",
  "lifecycle",
  "activity",
];

function readDetailTab(search: string): DetailTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("tab");
  return DETAIL_TABS.includes(value as DetailTab) ? (value as DetailTab) : "overview";
}

export function AgentDetailPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const [activeTab, setActiveTab] = useState<DetailTab>(() => readDetailTab(search));

  useEffect(() => {
    setActiveTab(readDetailTab(search));
  }, [search]);

  const goToTab = (tab: DetailTab) => {
    setActiveTab(tab);
    const base = location.split("?")[0] ?? location;
    setLocation(tab === "overview" ? base : `${base}?tab=${tab}`);
  };
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

  const isDraft = employee.status === "draft";
  const runtimeLabel =
    employee.status !== "published"
      ? t("aiEmployees.workspace.overview.runtimeNotPublished")
      : operationsQuery.data
        ? t(
            `aiEmployees.operations.runtimeStatus.presence.${operationsQuery.data.runtimeStatus.presence}`,
          )
        : t("aiEmployees.operations.loading");

  const statusCopyKey =
    employee.status === "published"
      ? "statusPublished"
      : employee.status === "disabled"
        ? "statusDisabled"
        : employee.status === "archived"
          ? "statusArchived"
          : "statusDraft";

  return (
    <>
      <div className="space-y-5">
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
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`aiEmployees.workspace.overview.${statusCopyKey}`)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="rounded-xl">
                  <MoreHorizontal className="me-2 size-4" />
                  {t("aiEmployees.actions.menu")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80] rounded-xl">
                {canEdit && isDraft ? (
                  <DropdownMenuItem onSelect={() => setLocation(agentContinueHref(employee.id))}>
                    <Pencil className="me-2 size-4" />
                    {t("aiEmployees.workspace.overview.ctaContinue")}
                  </DropdownMenuItem>
                ) : null}
                {canEdit ? (
                  <DropdownMenuItem
                    onSelect={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
                  >
                    <Pencil className="me-2 size-4" />
                    {t("aiEmployees.actions.edit")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => goToTab("lifecycle")}>
                  {t("aiEmployees.actions.openLifecycle")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLocation("~/dashboard/channels")}>
                  {t("aiEmployees.actions.openChannels")}
                </DropdownMenuItem>
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="me-2 size-4" />
                    {t("aiEmployees.actions.delete")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {isDraft && canPublish ? (
              <Button className="rounded-xl" onClick={() => goToTab("lifecycle")}>
                <Rocket className="me-2 size-4" />
                {t("aiEmployees.workspace.overview.ctaPublish")}
              </Button>
            ) : null}
            {canEdit && isDraft ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setLocation(agentContinueHref(employee.id))}
              >
                <Pencil className="me-2 size-4" />
                {t("aiEmployees.workspace.overview.ctaContinue")}
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
              >
                <Pencil className="me-2 size-4" />
                {t("aiEmployees.workspace.overview.ctaEdit")}
              </Button>
            ) : null}
          </div>
        </div>

        <nav aria-label={t("aiEmployees.workspace.tabsNav")} className="overflow-x-auto">
          <div className="flex min-w-max gap-1 border-b border-border/60 pb-px">
            {DETAIL_TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => goToTab(tab)}
                  className={cn(
                    "relative px-3 py-2.5 text-sm transition-colors",
                    active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`aiEmployees.workspace.tabs.${tab}`)}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        {activeTab === "overview" ? (
          <div className="space-y-5">
            <ModulePurposeBanner
              title={t("aiEmployees.workspace.overview.title")}
              body={t("aiEmployees.workspace.overview.body")}
              points={[
                t("aiEmployees.detail.guide.points.publish"),
                t("aiEmployees.detail.guide.points.channels"),
                t("aiEmployees.detail.guide.points.tools"),
                t("aiEmployees.detail.guide.points.omnichannel"),
              ]}
            />

            <DashboardCard className="space-y-3 border-border/50 bg-transparent p-5 shadow-none">
              <h2 className="text-sm font-semibold">{t("aiEmployees.workspace.overview.nextSteps")}</h2>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <NextStepRow
                  done={Boolean(employee.provider && employee.model && employee.systemPromptSummary)}
                  label={t("aiEmployees.workspace.overview.stepContinue")}
                  onClick={() => (isDraft ? setLocation(agentContinueHref(employee.id)) : goToTab("setup"))}
                />
                <NextStepRow
                  done={(employee.tags ?? []).some((tag) => tag.startsWith("channel:"))}
                  label={t("aiEmployees.workspace.overview.stepChannels")}
                  onClick={() => goToTab("channels")}
                />
                <NextStepRow
                  done={Boolean(employee.knowledgeSummary || employee.toolSummary)}
                  label={t("aiEmployees.workspace.overview.stepKnowledge")}
                  onClick={() => goToTab("knowledge")}
                />
                <NextStepRow
                  done={employee.status === "published"}
                  label={t("aiEmployees.workspace.overview.stepPublish")}
                  onClick={() => goToTab("lifecycle")}
                />
              </ol>
              <div className="flex flex-wrap gap-2 pt-1">
                {isDraft && canEdit ? (
                  <Button size="sm" className="rounded-xl" onClick={() => setLocation(agentContinueHref(employee.id))}>
                    {t("aiEmployees.workspace.overview.ctaContinue")}
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => goToTab("channels")}>
                  {t("aiEmployees.workspace.overview.ctaChannels")}
                </Button>
                {isDraft ? (
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => goToTab("lifecycle")}>
                    {t("aiEmployees.workspace.overview.ctaPublish")}
                  </Button>
                ) : null}
              </div>
            </DashboardCard>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardStatCard
                label={t("aiEmployees.detail.runtimeStatus")}
                value={runtimeLabel}
                icon={Activity}
              />
              <DashboardStatCard
                label={t("aiEmployees.detail.health")}
                value={
                  operationsQuery.isLoading
                    ? t("aiEmployees.operations.loading")
                    : operationsQuery.data
                      ? `${operationsQuery.data.metrics.successRate}%`
                      : t("aiEmployees.detail.noData")
                }
                icon={HeartPulse}
              />
              <DashboardStatCard
                label={t("aiEmployees.detail.estimatedCost")}
                value={
                  operationsQuery.isLoading
                    ? t("aiEmployees.operations.loading")
                    : operationsQuery.data
                      ? formatCost(
                          operationsQuery.data.costs.estimatedDailyCost,
                          operationsQuery.data.costs.currency,
                        )
                      : t("aiEmployees.detail.noData")
                }
                icon={BarChart3}
              />
              <DashboardStatCard
                label={t("aiEmployees.detail.executions")}
                value={
                  operationsQuery.isLoading
                    ? t("aiEmployees.operations.loading")
                    : (operationsQuery.data?.metrics.executionsToday ?? t("aiEmployees.detail.noData"))
                }
                icon={Clock}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SummaryCard title={t("aiEmployees.workspace.overview.summaryTitle")}>
                <DetailRow
                  label={t("aiEmployees.table.department")}
                  value={formatEmployeeDepartmentLabel(t, employee.department)}
                />
                <DetailRow label={t("aiEmployees.table.owner")} value={employee.owner} />
                <DetailRow
                  label={t("aiEmployees.table.provider")}
                  value={formatEmployeeProviderLabel(t, employee.provider)}
                />
                <DetailRow label={t("aiEmployees.table.model")} value={employee.model} />
                <DetailRow
                  label={t("aiEmployees.form.channelRouting.title")}
                  value={
                    (employee.tags ?? []).length > 0
                      ? (employee.tags ?? []).map((tag) => formatEmployeeTagLabel(t, tag)).join(" · ")
                      : t("aiEmployees.form.channelRouting.noneSelected")
                  }
                />
              </SummaryCard>
              <SummaryCard title={t("aiEmployees.detail.prompt")}>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {employee.systemPromptSummary || t("aiEmployees.detail.noPrompt")}
                </p>
              </SummaryCard>
            </div>
          </div>
        ) : null}

        {activeTab === "setup" ? (
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
        ) : null}

        {activeTab === "channels" ? (
          <ChannelInboundBindingPanel
            employee={employee}
            canEdit={canEdit}
            isSaving={updateConfiguration.isPending}
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
        ) : null}

        {activeTab === "knowledge" ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <SummaryCard title={t("aiEmployees.detail.knowledge")}>
                <p className="text-sm text-muted-foreground">
                  {localizeEmployeeSummary(
                    t,
                    employee.knowledgeSummary,
                    "aiEmployees.detail.emptyKnowledge",
                  )}
                </p>
              </SummaryCard>
              <SummaryCard title={t("aiEmployees.detail.tools")}>
                <p className="text-sm text-muted-foreground">
                  {localizeEmployeeSummary(t, employee.toolSummary, "aiEmployees.detail.emptyTools")}
                </p>
              </SummaryCard>
            </div>
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
                        description: t("aiEmployees.skills.test.score", {
                          score: result.readiness.score,
                        }),
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
          </div>
        ) : null}

        {activeTab === "lifecycle" ? (
          <div id="ai-employee-lifecycle">
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
                  await publishEmployee.mutateAsync({
                    publishNotes,
                    preview: lifecycleState.preview,
                  });
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
        ) : null}

        {activeTab === "activity" ? (
          <div className="space-y-5">
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
            {!canViewOperations && !canViewMemory && !canViewCollaboration && !canViewGovernance && !canViewAdministration ? (
              <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("aiEmployees.detail.noData")}
              </p>
            ) : null}
          </div>
        ) : null}
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

function NextStepRow({
  done,
  label,
  onClick,
}: {
  done: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-start hover:bg-muted/40"
      >
        {done ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className={cn(done && "text-foreground")}>{label}</span>
      </button>
    </li>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DashboardCard className="space-y-4 border-border/50 bg-transparent p-5 shadow-none">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
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
