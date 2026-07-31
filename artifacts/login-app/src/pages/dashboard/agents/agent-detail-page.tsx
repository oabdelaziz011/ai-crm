import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
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
import { AiEmployeeDeleteDialog, AiEmployeeStatusBadge } from "@/lib/ai-employees/components";
import {
  formatAiEmployeeError,
  useAiEmployee,
  useDeleteAiEmployee,
} from "@/lib/ai-employees/hooks";
import {
  hasAiEmployeesDeletePermission,
  hasAiEmployeesEditPermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { agentEditHref } from "@/config/agents-route-registry";
import { nestedSectionHref, NEST_INDEX } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { Activity, BarChart3, Clock, HeartPulse } from "lucide-react";
import { useState } from "react";

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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: employee, isLoading, error } = useAiEmployee(
    companyId,
    agentId && UUID_PATTERN.test(agentId) ? agentId : null,
  );
  const deleteEmployee = useDeleteAiEmployee(companyId);

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
          <DashboardStatCard label={t("aiEmployees.detail.runtimeStatus")} value={t("aiEmployees.detail.notConnected")} icon={Activity} />
          <DashboardStatCard label={t("aiEmployees.detail.health")} value={t("aiEmployees.detail.placeholder")} icon={HeartPulse} />
          <DashboardStatCard label={t("aiEmployees.detail.analytics")} value={t("aiEmployees.detail.placeholder")} icon={BarChart3} />
          <DashboardStatCard label={t("aiEmployees.detail.executions")} value={t("aiEmployees.detail.placeholder")} icon={Clock} />
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
        </div>
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
