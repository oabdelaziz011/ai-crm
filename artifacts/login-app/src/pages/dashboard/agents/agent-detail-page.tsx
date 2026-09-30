import { useLocation, useParams, useSearch } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Circle,
  Clock,
  HeartPulse,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { useActiveAutomationFlows } from "@/hooks/channels/use-channel-workflow-binding";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardPageFallback,
} from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AiEmployeeDeleteDialog, AiEmployeeStatusBadge } from "@/lib/ai-employees/components";
import type { AiEmployeeWizardStep } from "@/lib/ai-employees/components/ai-employee-form-sections";
import {
  formatAiEmployeeError,
  formatAiEmployeeLifecycleError,
  formatAiEmployeeSkillError,
  useAiEmployee,
  useAiEmployeeCollaboration,
  useAiEmployeeGovernance,
  useAiEmployeeAdministration,
  useAiEmployeeKnowledgeOptions,
  useControlTowerEmployeeFilter,
  useAiEmployeeLifecycleState,
  useAiEmployeeMemory,
  useAiEmployeeMemorySearch,
  useAiEmployeeOperations,
  useAiEmployeeOperationsControl,
  useAiEmployeeSkills,
  useAiEmployeeSkillsMarketplace,
  useAiSkillOptions,
  useTestAiSkill,
  useToggleAiSkillFavorite,
  useArchiveAiEmployee,
  useCheckAiEmployeeDeleteDependencies,
  useDeleteAiEmployee,
  useDisableAiEmployee,
  usePublishAiEmployee,
  useRestoreAiEmployee,
  useRollbackAiEmployee,
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
  hasAiEmployeesSkillsViewPermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import type { AiEmployeeDeleteDependencyResult } from "@/lib/ai-employees/services/assert-ai-employee-safe-to-archive";
import { agentContinueHref, agentEditHref } from "@/config/agents-route-registry";
import { isAiEmployeeReadOnlyViewMode } from "@/lib/ai-employees/utilities/ai-employee-row-actions";
import {
  legacyDetailTabToWizardStep,
  readinessCategoryToWizardStep,
} from "@/lib/ai-employees/utilities/ai-employee-wizard-step-routing";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { formatToolNameLabel } from "@/lib/ai-employees/utilities/format-tool-label";
import { resolveAiEmployeeWelcomeMessage } from "@/lib/ai-employees/utilities/resolve-ai-employee-welcome-message";
import { nestedSectionHref, NEST_INDEX } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";

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

/** Details are read-only; every setup field is entered through create / edit. */
type DetailTab = "overview" | "lifecycle" | "activity";

const DETAIL_TABS: DetailTab[] = ["overview", "lifecycle", "activity"];

const MAX_VISIBLE_BADGES = 12;

function readSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function readDetailTab(search: string): DetailTab {
  const value = readSearchParams(search).get("tab");
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
  const isReadOnlyView = isAiEmployeeReadOnlyViewMode(search);

  useEffect(() => {
    setActiveTab(readDetailTab(search));
  }, [search]);

  const goToTab = (tab: DetailTab) => {
    setActiveTab(tab);
    const base = location.split("?")[0] ?? location;
    const next = new URLSearchParams();
    if (isReadOnlyView) next.set("mode", "view");
    if (tab !== "overview") next.set("tab", tab);
    const qs = next.toString();
    setLocation(qs ? `${base}?${qs}` : base);
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
  const canEditPermission = hasAiEmployeesEditPermission(hasPermission, isSuperAdmin);
  const canDeletePermission = hasAiEmployeesDeletePermission(hasPermission, isSuperAdmin);
  const canPublishPermission = hasAiEmployeesPublishPermission(hasPermission, isSuperAdmin);
  const canRollbackPermission = hasAiEmployeesRollbackPermission(hasPermission, isSuperAdmin);
  // View Details (`mode=view`) forces a genuine read-only Control Center — even for editors.
  const canEdit = canEditPermission && !isReadOnlyView;
  const canDelete = canDeletePermission && !isReadOnlyView;
  const canPublish = canPublishPermission && !isReadOnlyView;
  const canRollback = canRollbackPermission && !isReadOnlyView;
  const canViewOperations = hasAiEmployeesOperationsViewPermission(hasPermission, isSuperAdmin);
  const canViewMemory = hasAiEmployeesMemoryViewPermission(hasPermission, isSuperAdmin);
  const canViewSkills = hasAiEmployeesSkillsViewPermission(hasPermission, isSuperAdmin);
  const canViewCollaboration = hasAiEmployeesCollaborationViewPermission(hasPermission, isSuperAdmin);
  const canViewGovernance = hasAiEmployeesGovernanceViewPermission(hasPermission, isSuperAdmin);
  const canViewAdministration = hasAiEmployeesAdministrationViewPermission(hasPermission, isSuperAdmin);
  const canControlOperations =
    hasAiEmployeesOperationsControlPermission(hasPermission, isSuperAdmin) && !isReadOnlyView;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dependencyResult, setDependencyResult] = useState<AiEmployeeDeleteDependencyResult | null>(
    null,
  );
  const [checkError, setCheckError] = useState<string | null>(null);

  const validAgentId = agentId && UUID_PATTERN.test(agentId) ? agentId : null;
  const { data: employee, isLoading, error } = useAiEmployee(companyId, validAgentId);
  const lifecycleState = useAiEmployeeLifecycleState(companyId, validAgentId);
  const operationsQuery = useAiEmployeeOperations(companyId, validAgentId);
  const memoryQuery = useAiEmployeeMemory(companyId, validAgentId);
  const memorySearch = useAiEmployeeMemorySearch(memoryQuery.data);
  const skillsQuery = useAiEmployeeSkills(companyId, validAgentId);
  const skillsMarketplace = useAiEmployeeSkillsMarketplace(skillsQuery.data);
  const skillOptionsQuery = useAiSkillOptions(companyId);
  const knowledgeOptionsQuery = useAiEmployeeKnowledgeOptions(companyId);
  const { data: companyChannels = [] } = useCompanyChannelsAdmin();
  const flowsQuery = useActiveAutomationFlows(companyId);
  const collaborationQuery = useAiEmployeeCollaboration(companyId, validAgentId);
  const governanceQuery = useAiEmployeeGovernance(companyId, validAgentId);
  const administrationQuery = useAiEmployeeAdministration(companyId, validAgentId);
  const controlTowerFilter = useControlTowerEmployeeFilter(administrationQuery.data);
  const testSkill = useTestAiSkill(companyId);
  const toggleFavorite = useToggleAiSkillFavorite(companyId, validAgentId);
  const operationsControl = useAiEmployeeOperationsControl(companyId, validAgentId);
  const publishEmployee = usePublishAiEmployee(companyId, validAgentId);
  const rollbackEmployee = useRollbackAiEmployee(companyId, validAgentId);
  const archiveEmployee = useArchiveAiEmployee(companyId, validAgentId);
  const restoreEmployee = useRestoreAiEmployee(companyId, validAgentId);
  const disableEmployee = useDisableAiEmployee(companyId, validAgentId);
  const deleteEmployee = useDeleteAiEmployee(companyId);
  const checkDependencies = useCheckAiEmployeeDeleteDependencies(companyId);

  // Old deep links (Setup / Channels / Knowledge tabs) now open the matching edit wizard step.
  useEffect(() => {
    if (!canEdit) return;
    if (!validAgentId) return;
    const query = readSearchParams(search);
    const step = legacyDetailTabToWizardStep(query.get("tab"), query.get("config"));
    if (!step) return;
    setLocation(nestedSectionHref(agentEditHref(validAgentId, step)), { replace: true });
  }, [canEdit, search, setLocation, validAgentId]);

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

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of companyChannels) {
      map.set(channel.id, channel.display_name);
    }
    return map;
  }, [companyChannels]);

  const runDeleteCheck = async (employeeId: string) => {
    setCheckError(null);
    setDependencyResult(null);
    try {
      const result = await checkDependencies.mutateAsync(employeeId);
      setDependencyResult(result);
    } catch (error) {
      setCheckError(formatAiEmployeeError(error));
    }
  };

  const handleDelete = async () => {
    if (!employee) return;
    try {
      const fresh = await checkDependencies.mutateAsync(employee.id);
      setDependencyResult(fresh);
      if (!fresh.canDelete) return;
      await deleteEmployee.mutateAsync(employee.id);
      toast({ title: t("aiEmployees.deleted") });
      setDeleteOpen(false);
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
  const isArchived = employee.status === "archived";
  const canShowPublish = canPublish && (isDraft || employee.status === "disabled");
  const editHref = (step: AiEmployeeWizardStep) =>
    canEdit && !isArchived ? nestedSectionHref(agentEditHref(employee.id, step)) : null;

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

  const runtime = employee.runtimeConfiguration;
  const pausedToolKeys = employee.allowedToolKeys.filter((key) =>
    runtime.disabledToolKeys.includes(key),
  );
  const activeToolKeys = employee.allowedToolKeys.filter((key) => !pausedToolKeys.includes(key));
  const knowledgeNames = employee.knowledgeSourceIds.map(
    (id) => knowledgeOptionsQuery.data?.find((source) => source.id === id)?.name ?? id,
  );
  const skillNames = employee.allowedSkillIds.map(
    (id) => skillOptionsQuery.data?.find((skill) => skill.id === id)?.displayName ?? id,
  );
  const channelTags = (employee.tags ?? []).filter(
    (tag) => tag.startsWith("channel:") || tag.startsWith("capability:"),
  );
  const otherTags = (employee.tags ?? []).filter((tag) => !channelTags.includes(tag));
  const labelTag = (tag: string) => {
    if (tag.startsWith("channel:")) {
      const name = channelNameById.get(tag.slice("channel:".length));
      if (name) return name;
    }
    return formatEmployeeTagLabel(t, tag);
  };
  const flowName = runtime.transferableFlowId
    ? ((flowsQuery.data ?? []).find((flow) => flow.id === runtime.transferableFlowId)?.name ??
      runtime.transferableFlowId)
    : null;

  const hasChannelTag = channelTags.some((tag) => tag.startsWith("channel:"));
  const hasRuntimeBinding = Boolean(employee.provider && employee.model && employee.systemPromptSummary);
  const isPublished = employee.status === "published";
  const readiness = lifecycleState.readiness;
  const missingCategories = readiness?.categories.filter((category) => !category.ready) ?? [];

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
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{employee.displayName}</h1>
                <AiEmployeeStatusBadge status={employee.status} />
                {isReadOnlyView ? (
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {t("aiEmployees.controlCenter.readOnlyBadge")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`aiEmployees.workspace.overview.${statusCopyKey}`)}
              </p>
              {employee.description.trim() ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
                  {employee.description}
                </p>
              ) : null}
              {isReadOnlyView ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("aiEmployees.controlCenter.readOnlyHint")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isReadOnlyView && canEditPermission ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
              >
                <Pencil className="me-2 size-4" />
                {t("aiEmployees.actions.edit")}
              </Button>
            ) : null}
            {!isReadOnlyView ? (
              <>
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
                {canEdit && !isDraft && !isArchived ? (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
                  >
                    <Pencil className="me-2 size-4" />
                    {t("aiEmployees.workspace.overview.ctaEdit")}
                  </Button>
                ) : null}
                {canShowPublish ? (
                  <Button className="rounded-xl" onClick={() => goToTab("lifecycle")}>
                    <Rocket className="me-2 size-4" />
                    {t("aiEmployees.workspace.overview.ctaPublish")}
                  </Button>
                ) : null}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="rounded-xl" aria-label={t("aiEmployees.actions.menu")}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[80] rounded-xl">
                    {canEdit && isDraft ? (
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
                    {canDelete && !isArchived ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          setDeleteOpen(true);
                          void runDeleteCheck(employee.id);
                        }}
                      >
                        <Trash2 className="me-2 size-4" />
                        {t("aiEmployees.actions.delete")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
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
                  {t(`aiEmployees.profile.tabs.${tab}`)}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        {activeTab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <ProfileSection
                icon={UserRound}
                title={t("aiEmployees.wizard.steps.general")}
                editHref={editHref("general")}
                onNavigate={setLocation}
              >
                <DetailRow label={t("aiEmployees.form.internalName")} value={employee.name} />
                <DetailRow
                  label={t("aiEmployees.table.department")}
                  value={formatEmployeeDepartmentLabel(t, employee.department)}
                />
                <DetailRow label={t("aiEmployees.table.owner")} value={employee.owner} />
                <DetailRow
                  label={t("aiEmployees.controlCenter.fields.updated")}
                  value={new Date(employee.updatedAt).toLocaleString()}
                />
                <TextBlock label={t("aiEmployees.form.welcomeMessage")}>
                  {resolveAiEmployeeWelcomeMessage(employee.welcomeMessage)}
                </TextBlock>
              </ProfileSection>

              <ProfileSection
                icon={MessageSquareText}
                title={t("aiEmployees.wizard.steps.prompt")}
                editHref={editHref("prompt")}
                onNavigate={setLocation}
              >
                <DetailRow
                  label={t("aiEmployees.config.fields.promptVersion")}
                  value={employee.promptVersionLabel}
                />
                {employee.systemPrompt.trim() ? (
                  <details className="group rounded-xl border border-border/50 px-3 py-2">
                    <summary className="cursor-pointer list-none text-sm text-muted-foreground">
                      <span className="line-clamp-2 group-open:hidden">{employee.systemPromptSummary}</span>
                      <span className="mt-1 block text-xs font-medium text-primary">
                        {t("aiEmployees.profile.showFullPrompt")}
                      </span>
                    </summary>
                    <p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                      {employee.systemPrompt}
                    </p>
                  </details>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("aiEmployees.detail.noPrompt")}</p>
                )}
              </ProfileSection>

              <ProfileSection
                icon={Brain}
                title={t("aiEmployees.profile.sections.intelligence")}
                editHref={editHref("intelligence")}
                onNavigate={setLocation}
              >
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <DetailRow
                    label={t("aiEmployees.table.provider")}
                    value={formatEmployeeProviderLabel(t, employee.provider)}
                  />
                  <DetailRow label={t("aiEmployees.table.model")} value={employee.model} />
                  <DetailRow
                    label={t("aiEmployees.form.temperature")}
                    value={employee.temperature != null ? String(employee.temperature) : null}
                  />
                  <DetailRow
                    label={t("aiEmployees.form.maxTokens")}
                    value={employee.maxTokens != null ? String(employee.maxTokens) : null}
                  />
                  <DetailRow
                    label={t("aiEmployees.form.runtime.executionTimeoutSeconds")}
                    value={String(Math.round(runtime.executionTimeoutMs / 1000))}
                  />
                  <DetailRow
                    label={t("aiEmployees.form.runtime.retryCount")}
                    value={String(runtime.retryCount)}
                  />
                  <DetailRow
                    label={t("aiEmployees.form.runtime.rateLimitPerMinute")}
                    value={String(runtime.rateLimitPerMinute)}
                  />
                  <DetailRow
                    label={t("aiEmployees.form.runtime.maxConcurrency")}
                    value={String(runtime.maxConcurrency)}
                  />
                  <DetailRow
                    label={t("aiEmployees.config.fields.sessionTimeoutMinutes")}
                    value={String(runtime.sessionTimeoutMinutes)}
                  />
                </div>
              </ProfileSection>

              <ProfileSection
                icon={BookOpen}
                title={t("aiEmployees.wizard.steps.knowledge")}
                editHref={editHref("knowledge")}
                onNavigate={setLocation}
              >
                <BadgeList items={knowledgeNames} emptyLabel={t("aiEmployees.detail.emptyKnowledge")} />
              </ProfileSection>

              <ProfileSection
                icon={Wrench}
                title={t("aiEmployees.profile.sections.capabilities")}
                editHref={editHref("tools")}
                onNavigate={setLocation}
              >
                <TextBlock label={t("aiEmployees.profile.activeTools", { count: activeToolKeys.length })}>
                  <BadgeList
                    items={activeToolKeys.map((key) => formatToolNameLabel(t, key))}
                    emptyLabel={t("aiEmployees.detail.emptyTools")}
                  />
                </TextBlock>
                {pausedToolKeys.length > 0 ? (
                  <TextBlock label={t("aiEmployees.profile.pausedTools", { count: pausedToolKeys.length })}>
                    <BadgeList
                      items={pausedToolKeys.map((key) => formatToolNameLabel(t, key))}
                      variant="outline"
                    />
                  </TextBlock>
                ) : null}
                <TextBlock label={t("aiEmployees.form.skills.title")}>
                  <BadgeList items={skillNames} emptyLabel={t("aiEmployees.detail.emptySkills")} />
                </TextBlock>
              </ProfileSection>

              <ProfileSection
                icon={MessageCircle}
                title={t("aiEmployees.profile.sections.channels")}
                editHref={editHref("channels")}
                onNavigate={setLocation}
              >
                <TextBlock label={t("aiEmployees.form.channelRouting.title")}>
                  <BadgeList
                    items={channelTags.map(labelTag)}
                    emptyLabel={t("aiEmployees.form.channelRouting.noneSelected")}
                  />
                </TextBlock>
                <DetailRow
                  label={t("aiEmployees.channelBinding.transferableFlow.title")}
                  value={flowName ?? t("aiEmployees.channelBinding.transferableFlow.none")}
                />
                {otherTags.length > 0 ? (
                  <TextBlock label={t("aiEmployees.form.tags")}>
                    <BadgeList items={otherTags.map(labelTag)} variant="outline" />
                  </TextBlock>
                ) : null}
              </ProfileSection>
            </div>

            <div className="space-y-5">
              <DashboardCard className="space-y-4 border-border/50 bg-transparent p-5 shadow-none">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{t("aiEmployees.profile.readiness.title")}</h2>
                  <span className="text-xl font-bold tabular-nums">
                    {lifecycleState.isLoading || !readiness ? "—" : `${readiness.score}%`}
                  </span>
                </div>
                {readiness ? <Progress value={readiness.score} className="h-2" /> : null}
                {readiness && missingCategories.length === 0 ? (
                  <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    {t("aiEmployees.profile.readiness.allReady")}
                  </p>
                ) : null}
                {missingCategories.length > 0 ? (
                  <ul className="space-y-2">
                    {missingCategories.map((category) => {
                      const fixHref = editHref(readinessCategoryToWizardStep(category.id));
                      return (
                        <li key={category.id} className="flex items-start justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                            <span className="min-w-0">
                              <span className="font-medium">
                                {t(`aiEmployees.lifecycle.readiness.categories.${category.id}`, {
                                  defaultValue: category.label,
                                })}
                              </span>
                              {category.missing.length > 0 ? (
                                <span className="block text-xs text-muted-foreground">
                                  {category.missing
                                    .map((item) =>
                                      t(`aiEmployees.lifecycle.readiness.missing.${item}`, {
                                        defaultValue: item,
                                      }),
                                    )
                                    .join(" · ")}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {fixHref ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 shrink-0 rounded-lg px-2 text-xs"
                              onClick={() => setLocation(fixHref)}
                            >
                              {t("aiEmployees.profile.readiness.fix")}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </DashboardCard>

              <DashboardCard className="space-y-3 border-border/50 bg-transparent p-5 shadow-none">
                <h2 className="text-sm font-semibold">{t("aiEmployees.channelBinding.title")}</h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <CheckRow
                    done={isPublished}
                    label={
                      isPublished
                        ? t("aiEmployees.channelBinding.checks.published")
                        : t("aiEmployees.channelBinding.checks.notPublished")
                    }
                  />
                  <CheckRow
                    done={hasChannelTag}
                    label={t("aiEmployees.channelBinding.checks.channels", {
                      count: channelTags.filter((tag) => tag.startsWith("channel:")).length,
                    })}
                  />
                  <CheckRow
                    done={hasRuntimeBinding}
                    label={
                      hasRuntimeBinding
                        ? t("aiEmployees.channelBinding.checks.runtimeOk")
                        : t("aiEmployees.channelBinding.checks.runtimeMissing")
                    }
                  />
                </ul>
                {isPublished && !hasChannelTag ? (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    {t("aiEmployees.channelBinding.fallbackWarning")}
                  </p>
                ) : null}
              </DashboardCard>

              <DashboardCard className="space-y-1 border-border/50 bg-transparent p-5 shadow-none">
                <h2 className="pb-2 text-sm font-semibold">{t("aiEmployees.profile.performance")}</h2>
                <StatRow icon={Activity} label={t("aiEmployees.detail.runtimeStatus")} value={runtimeLabel} />
                <StatRow
                  icon={HeartPulse}
                  label={t("aiEmployees.detail.health")}
                  value={
                    operationsQuery.isLoading
                      ? t("aiEmployees.operations.loading")
                      : operationsQuery.data
                        ? `${operationsQuery.data.metrics.successRate}%`
                        : t("aiEmployees.detail.noData")
                  }
                />
                <StatRow
                  icon={Clock}
                  label={t("aiEmployees.detail.executions")}
                  value={
                    operationsQuery.isLoading
                      ? t("aiEmployees.operations.loading")
                      : String(operationsQuery.data?.metrics.executionsToday ?? t("aiEmployees.detail.noData"))
                  }
                />
                <StatRow
                  icon={BarChart3}
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
                />
              </DashboardCard>
            </div>
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
                  setDeleteOpen(true);
                  void runDeleteCheck(employee.id);
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
            {canViewSkills ? (
              <Suspense fallback={<DashboardPageFallback />}>
                <SkillsPlatformPanel
                  employee={employee}
                  snapshot={skillsQuery.data ?? null}
                  isLoading={skillsQuery.isLoading}
                  marketplace={skillsMarketplace}
                  canEdit={false}
                  isAssigning={false}
                  onAssign={async () => undefined}
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
            {!canViewOperations &&
            !canViewSkills &&
            !canViewMemory &&
            !canViewCollaboration &&
            !canViewGovernance &&
            !canViewAdministration ? (
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
        isDeleting={deleteEmployee.isPending || checkDependencies.isPending}
        isChecking={checkDependencies.isPending && !dependencyResult && !checkError}
        dependencyResult={dependencyResult}
        checkError={checkError}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDependencyResult(null);
            setCheckError(null);
          }
        }}
        onConfirm={handleDelete}
        onRecheck={() => {
          void runDeleteCheck(employee.id);
        }}
      />
    </>
  );
}

function ProfileSection({
  icon: Icon,
  title,
  editHref,
  onNavigate,
  children,
}: {
  icon: LucideIcon;
  title: string;
  editHref: string | null;
  onNavigate: (href: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <DashboardCard className="space-y-3 border-border/50 bg-transparent p-5 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </h2>
        {editHref ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs"
            onClick={() => onNavigate(editHref)}
          >
            <Pencil className="me-1.5 size-3.5" />
            {t("aiEmployees.profile.editSection")}
          </Button>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </DashboardCard>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-end text-sm font-medium">{value?.trim() || "—"}</span>
    </div>
  );
}

function TextBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function BadgeList({
  items,
  emptyLabel,
  variant = "secondary",
}: {
  items: string[];
  emptyLabel?: string;
  variant?: "secondary" | "outline";
}) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null;
  }
  const visible = items.slice(0, MAX_VISIBLE_BADGES);
  const hidden = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item, index) => (
        <Badge key={`${item}-${index}`} variant={variant} className="rounded-lg font-normal">
          {item}
        </Badge>
      ))}
      {hidden > 0 ? (
        <Badge variant="outline" className="rounded-lg font-normal">
          +{hidden}
        </Badge>
      ) : null}
    </div>
  );
}

function CheckRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn(done && "text-foreground")}>{label}</span>
    </li>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function formatCost(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
