import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useQuery } from "@tanstack/react-query";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  AiEmployeeFormSections,
  type AiEmployeeWizardStep,
} from "@/lib/ai-employees/components/ai-employee-form-sections";
import {
  formatAiEmployeeError,
  useAiEmployeeKnowledgeOptions,
  useAiEmployeeToolOptions,
  useCreateAiEmployee,
} from "@/lib/ai-employees/hooks";
import { DEFAULT_AI_EMPLOYEE_FORM } from "@/lib/ai-employees/validators";
import {
  hasAiEmployeesCreatePermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { agentDetailHref } from "@/config/agents-route-registry";
import { nestedSectionHref, NEST_INDEX } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";

const STEPS: AiEmployeeWizardStep[] = [
  "general",
  "provider",
  "model",
  "prompt",
  "knowledge",
  "tools",
  "review",
];

export function AgentCreateWizardPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { company, isSuperAdmin, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { resolvedEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const companyId = company?.id ?? null;

  const canAccess = isAiEmployeesWorkspaceAccessible({
    isSuperAdmin,
    hasPermission,
    agentsFeatureEnabled,
  });
  const canCreate = hasAiEmployeesCreatePermission(hasPermission, isSuperAdmin);

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<AiEmployeeFormValues>({
    ...DEFAULT_AI_EMPLOYEE_FORM,
    ownerId: user?.id ?? null,
  });

  const createEmployee = useCreateAiEmployee(companyId);
  const { data: toolOptions = [] } = useAiEmployeeToolOptions();
  const { data: knowledgeOptions = [] } = useAiEmployeeKnowledgeOptions(companyId);

  const ownersQuery = useQuery({
    queryKey: ["ai-employees", "owners", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", companyId!)
        .order("full_name");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        label: (row.full_name as string | null)?.trim() || (row.email as string) || (row.id as string),
      }));
    },
  });

  const step = STEPS[stepIndex]!;
  const isLastStep = stepIndex === STEPS.length - 1;

  const ownerOptions = useMemo(() => ownersQuery.data ?? [], [ownersQuery.data]);

  const onChange = (patch: Partial<AiEmployeeFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const handleCreate = async () => {
    try {
      const employee = await createEmployee.mutateAsync(values);
      toast({ title: t("aiEmployees.created") });
      setLocation(nestedSectionHref(agentDetailHref(employee.id)));
    } catch (createError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(createError),
      });
    }
  };

  if (!canAccess || !canCreate) {
    return <DashboardErrorBanner message={t("aiEmployees.accessDenied")} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setLocation(NEST_INDEX)}>
          <ArrowLeft className="me-2 size-4" />
          {t("aiEmployees.backToList")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{t("aiEmployees.wizard.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.wizard.subtitle")}</p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((wizardStep, index) => (
          <li
            key={wizardStep}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              index === stepIndex
                ? "border-primary bg-primary/10 text-primary"
                : index < stepIndex
                  ? "border-border text-foreground"
                  : "border-border/60 text-muted-foreground",
            )}
          >
            {t(`aiEmployees.wizard.steps.${wizardStep}`)}
          </li>
        ))}
      </ol>

      <DashboardCard className="space-y-6 p-6">
        <AiEmployeeFormSections
          step={step}
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={onChange}
        />

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={stepIndex === 0 || createEmployee.isPending}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          >
            {t("aiEmployees.wizard.back")}
          </Button>
          {isLastStep ? (
            <Button className="rounded-xl" disabled={createEmployee.isPending} onClick={() => void handleCreate()}>
              <Check className="me-2 size-4" />
              {t("aiEmployees.wizard.create")}
            </Button>
          ) : (
            <Button className="rounded-xl" onClick={() => setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))}>
              {t("aiEmployees.wizard.next")}
              <ArrowRight className="ms-2 size-4" />
            </Button>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
