import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  AiEmployeeFormSections,
  type AiEmployeeWizardStep,
} from "@/lib/ai-employees/components/ai-employee-form-sections";
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
import { cn } from "@/lib/utils";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same Control Center step order as create/continue — edit never creates a duplicate. */
const STEPS: AiEmployeeWizardStep[] = [
  "general",
  "prompt",
  "intelligence",
  "knowledge",
  "tools",
  "channels",
  "review",
];

export function AgentEditPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const validAgentId = agentId && UUID_PATTERN.test(agentId) ? agentId : null;
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

  const { data: employee, isLoading, error } = useAiEmployee(companyId, validAgentId);
  const updateEmployee = useUpdateAiEmployee(companyId, validAgentId ?? null);
  const { data: toolOptions = [] } = useAiEmployeeToolOptions();
  const { data: knowledgeOptions = [] } = useAiEmployeeKnowledgeOptions(companyId);

  const [values, setValues] = useState<AiEmployeeFormValues | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

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

  useEffect(() => {
    topAnchorRef.current?.scrollIntoView({ block: "start" });
  }, [stepIndex]);

  const ownerOptions = useMemo(() => ownersQuery.data ?? [], [ownersQuery.data]);
  const step = STEPS[stepIndex]!;
  const isLastStep = stepIndex === STEPS.length - 1;

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

  const handleSave = async (navigateAfter: boolean) => {
    if (!values || !validAgentId) return;
    try {
      // Update existing row only — never create.
      await updateEmployee.mutateAsync(values);
      toast({ title: t("aiEmployees.updated") });
      if (navigateAfter) {
        setLocation(nestedSectionHref(agentDetailHref(validAgentId)));
      }
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(saveError),
      });
    }
  };

  const handleNext = async () => {
    if (isLastStep) {
      await handleSave(true);
      return;
    }
    await handleSave(false);
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
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
    <div ref={topAnchorRef} className="w-full scroll-mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={() => setLocation(nestedSectionHref(agentDetailHref(agentId)))}
        >
          <ArrowLeft className="me-2 size-4" />
          {t("aiEmployees.backToDetail")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("aiEmployees.wizard.stepOf", { current: stepIndex + 1, total: STEPS.length })}
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("aiEmployees.edit.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{employee.displayName}</p>
      </div>

      <ModulePurposeBanner
        title={t("aiEmployees.edit.guide.title")}
        body={t("aiEmployees.edit.guide.body")}
        points={[
          t("aiEmployees.edit.guide.points.profile"),
          t("aiEmployees.edit.guide.points.publish"),
        ]}
        className="shadow-none"
      />

      <nav aria-label={t("aiEmployees.wizard.stepsNav")} className="overflow-x-auto">
        <ol className="flex w-full min-w-max items-stretch justify-between gap-1 border-b border-border/60 pb-px lg:min-w-0">
          {STEPS.map((wizardStep, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <li key={wizardStep} className="flex-1">
                <button
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={cn(
                    "relative w-full px-2 py-2.5 text-start text-xs transition-colors sm:text-sm",
                    active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="block truncate">{t(`aiEmployees.wizard.steps.${wizardStep}`)}</span>
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  ) : null}
                  {done && !active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-muted-foreground/40" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-3">
        <h2 ref={stepHeadingRef} className="text-lg font-semibold scroll-mt-4">
          {t(`aiEmployees.wizard.steps.${step}`)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(`aiEmployees.wizard.stepHints.${step}`)}</p>
        <AiEmployeeFormSections
          step={step}
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={(patch) => setValues((current) => (current ? { ...current, ...patch } : current))}
          reviewContext={{
            employeeId: validAgentId,
            transferableFlowId: employee.runtimeConfiguration?.transferableFlowId ?? null,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={stepIndex === 0 || updateEmployee.isPending}
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
        >
          <ArrowLeft className="me-2 size-4" />
          {t("aiEmployees.wizard.back")}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={updateEmployee.isPending}
            onClick={() => void handleSave(false)}
          >
            <Save className="me-2 size-4" />
            {t("aiEmployees.save")}
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={updateEmployee.isPending}
            onClick={() => void handleNext()}
          >
            {isLastStep ? t("aiEmployees.save") : t("aiEmployees.wizard.next")}
            {!isLastStep ? <ArrowRight className="ms-2 size-4" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
