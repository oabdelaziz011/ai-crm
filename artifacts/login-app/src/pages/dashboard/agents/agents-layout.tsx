import { Suspense, useEffect, useMemo, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Bot, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { DashboardCard, DashboardErrorBanner, DashboardPageFallback, DashboardStatCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  AiEmployeeDeleteDialog,
  AiEmployeeFilters,
  AiEmployeeTable,
} from "@/lib/ai-employees/components";
import {
  formatAiEmployeeError,
  useAiEmployees,
  useDeleteAiEmployee,
} from "@/lib/ai-employees/hooks";
import type { AiEmployeeListFilter, AiEmployeeRecord } from "@/lib/ai-employees/types";
import {
  hasAiEmployeesCreatePermission,
  hasAiEmployeesDeletePermission,
  hasAiEmployeesEditPermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { aiEmployeesTrace } from "@/lib/ai-employees/debug/ai-employees-trace";
import { agentNewHref } from "@/config/agents-route-registry";
import { nestedSectionHref } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { AgentCreateWizardPage } from "@/pages/dashboard/agents/agent-create-wizard-page";
import { AgentDetailPage } from "@/pages/dashboard/agents/agent-detail-page";
import { AgentEditPage } from "@/pages/dashboard/agents/agent-edit-page";
import { NEST_INDEX } from "@/lib/routing";

export function AgentsListPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { company, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { resolvedEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const companyId = company?.id ?? null;

  const canAccess = isAiEmployeesWorkspaceAccessible({
    isSuperAdmin,
    hasPermission,
    agentsFeatureEnabled,
  });
  const canCreate = hasAiEmployeesCreatePermission(hasPermission, isSuperAdmin);
  const canEdit = hasAiEmployeesEditPermission(hasPermission, isSuperAdmin);
  const canDelete = hasAiEmployeesDeletePermission(hasPermission, isSuperAdmin);

  const [filter, setFilter] = useState<AiEmployeeListFilter>({});
  const [deleteTarget, setDeleteTarget] = useState<AiEmployeeRecord | null>(null);

  const { data: employees = [], isLoading, error } = useAiEmployees(companyId, filter);
  const deleteEmployee = useDeleteAiEmployee(companyId);

  useEffect(() => {
    const payload = {
      companyId,
      filter,
      "employees.length": employees.length,
      isLoading,
      error: error?.message ?? null,
    };
    console.log("[AI_EMPLOYEES_TRACE agents-layout]", payload);
    aiEmployeesTrace("agents-layout", payload);
  }, [companyId, filter, employees.length, isLoading, error]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees) {
      if (employee.ownerId && employee.owner) {
        map.set(employee.ownerId, employee.owner);
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [employees]);

  const stats = useMemo(() => {
    const published = employees.filter((employee) => employee.status === "published").length;
    const draft = employees.filter((employee) => employee.status === "draft").length;
    return { total: employees.length, published, draft };
  }, [employees]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEmployee.mutateAsync(deleteTarget.id);
      toast({ title: t("aiEmployees.deleted") });
      setDeleteTarget(null);
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

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  const renderPayload = { "employees.length": employees.length, employees };
  console.log("[AI_EMPLOYEES_TRACE agents-layout render]", renderPayload);
  aiEmployeesTrace("agents-layout render", renderPayload);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="size-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("aiEmployees.title")}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.subtitle")}</p>
          </div>
          {canCreate ? (
            <Button className="rounded-xl" onClick={() => setLocation(nestedSectionHref(agentNewHref()))}>
              <Plus className="me-2 size-4" />
              {t("aiEmployees.create")}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <DashboardStatCard label={t("aiEmployees.stats.total")} value={stats.total} icon={Bot} />
          <DashboardStatCard label={t("aiEmployees.stats.published")} value={stats.published} icon={Bot} />
          <DashboardStatCard label={t("aiEmployees.stats.draft")} value={stats.draft} icon={Bot} />
        </div>

        <DashboardCard className="space-y-4 p-5">
          <AiEmployeeFilters
            filter={filter}
            employees={employees}
            ownerOptions={ownerOptions}
            onChange={(patch) => setFilter((current) => ({ ...current, ...patch }))}
          />
          {employees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
              {t("aiEmployees.empty")}
            </div>
          ) : (
            <AiEmployeeTable
              employees={employees}
              canEdit={canEdit}
              canDelete={canDelete}
              onDelete={setDeleteTarget}
            />
          )}
        </DashboardCard>
      </div>

      <AiEmployeeDeleteDialog
        employee={deleteTarget}
        open={Boolean(deleteTarget)}
        isDeleting={deleteEmployee.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />
    </>
  );
}

export function AgentsLayout() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <Switch>
        <Route path="/new">
          <AgentCreateWizardPage />
        </Route>
        <Route path="/:agentId/edit">
          <AgentEditPage />
        </Route>
        <Route path="/:agentId">
          <AgentDetailPage />
        </Route>
        <Route path={NEST_INDEX}>
          <AgentsListPage />
        </Route>
      </Switch>
    </Suspense>
  );
}
