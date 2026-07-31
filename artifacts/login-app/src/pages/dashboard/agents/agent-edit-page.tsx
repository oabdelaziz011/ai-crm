import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { DashboardCard, DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { AiEmployeeEditSections } from "@/lib/ai-employees/components/ai-employee-form-sections";
import {
  formatAiEmployeeError,
  useAiEmployee,
  useAiEmployeeKnowledgeOptions,
  useAiEmployeeToolOptions,
  useUpdateAiEmployee,
} from "@/lib/ai-employees/hooks";
import { recordToFormValues } from "@/lib/ai-employees/validators";
import {
  hasAiEmployeesEditPermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { agentDetailHref } from "@/config/agents-route-registry";
import { nestedSectionHref } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AgentEditPage() {
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

  const { data: employee, isLoading, error } = useAiEmployee(
    companyId,
    agentId && UUID_PATTERN.test(agentId) ? agentId : null,
  );
  const updateEmployee = useUpdateAiEmployee(companyId, agentId ?? null);
  const { data: toolOptions = [] } = useAiEmployeeToolOptions();
  const { data: knowledgeOptions = [] } = useAiEmployeeKnowledgeOptions(companyId);

  const [values, setValues] = useState<AiEmployeeFormValues | null>(null);

  const ownersQuery = useQuery({
    queryKey: ["ai-employees", "owners", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error: ownersError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", companyId!)
        .order("full_name");
      if (ownersError) throw new Error(ownersError.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        label: (row.full_name as string | null)?.trim() || (row.email as string) || (row.id as string),
      }));
    },
  });

  useEffect(() => {
    if (employee) {
      setValues(recordToFormValues(employee));
    }
  }, [employee]);

  const ownerOptions = useMemo(() => ownersQuery.data ?? [], [ownersQuery.data]);

  const handleSave = async () => {
    if (!values) return;
    try {
      await updateEmployee.mutateAsync(values);
      toast({ title: t("aiEmployees.updated") });
      if (agentId) {
        setLocation(nestedSectionHref(agentDetailHref(agentId)));
      }
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(saveError),
      });
    }
  };

  if (!canAccess || !canEdit) {
    return <DashboardErrorBanner message={t("aiEmployees.accessDenied")} />;
  }

  if (!agentId || !UUID_PATTERN.test(agentId)) {
    return <DashboardErrorBanner message={t("aiEmployees.notFound")} />;
  }

  if (isLoading || !values) {
    return <DashboardPageFallback />;
  }

  if (error || !employee) {
    return <DashboardErrorBanner message={error?.message ?? t("aiEmployees.notFound")} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setLocation(nestedSectionHref(agentDetailHref(agentId)))}>
          <ArrowLeft className="me-2 size-4" />
          {t("aiEmployees.backToDetail")}
        </Button>
        <Button className="rounded-xl" disabled={updateEmployee.isPending} onClick={() => void handleSave()}>
          <Save className="me-2 size-4" />
          {t("aiEmployees.save")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{t("aiEmployees.edit.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{employee.displayName}</p>
      </div>

      <DashboardCard className="p-6">
        <AiEmployeeEditSections
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={(patch) => setValues((current) => (current ? { ...current, ...patch } : current))}
        />
      </DashboardCard>
    </div>
  );
}
