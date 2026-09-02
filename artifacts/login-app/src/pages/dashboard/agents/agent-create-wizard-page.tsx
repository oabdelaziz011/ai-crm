import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useQuery } from "@tanstack/react-query";
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
  useCreateAiEmployee,
  useUpdateAiEmployee,
} from "@/lib/ai-employees/hooks";
import {
  DEFAULT_AI_EMPLOYEE_FORM,
  normalizeAiEmployeeName,
  recordToFormValues,
  resolveAiEmployeeInternalName,
} from "@/lib/ai-employees/validators";
import {
  hasAiEmployeesCreatePermission,
  isAiEmployeesWorkspaceAccessible,
} from "@/lib/ai-employees/permissions";
import { AiEmployeeRegistryError } from "@/lib/ai-employees/services";
import { isArchivedAiEmployeeStatus } from "@/lib/ai-employees/services/assert-ai-employee-safe-to-archive";
import { inferAiEmployeeWizardResumeStepIndex } from "@/lib/ai-employees/utilities/infer-ai-employee-wizard-resume-step";
import { agentContinueHref, agentDetailHref, agentNewHref } from "@/config/agents-route-registry";
import { resolveWizardDraftPersistDecision } from "@/lib/ai-employees/utilities/ai-employee-wizard-draft-persistence";
import { nestedSectionHref, NEST_INDEX } from "@/lib/routing";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STEPS: AiEmployeeWizardStep[] = [
  "general",
  "prompt",
  "intelligence",
  "knowledge",
  "tools",
  "channels",
  "review",
];

/** Reset every nested dashboard scrollport. Instant — smooth scroll loses to focused buttons. */
function scrollWizardToTop(anchor: HTMLElement | null, focusTarget?: HTMLElement | null) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== focusTarget) {
    active.blur();
  }

  const containers = new Set<HTMLElement>();
  const mainContent = document.getElementById("main-content");
  if (mainContent instanceof HTMLElement) containers.add(mainContent);

  document
    .querySelectorAll<HTMLElement>("main.overflow-y-auto, main#main-content")
    .forEach((node) => containers.add(node));

  let node: HTMLElement | null = anchor;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      containers.add(node);
    }
    node = node.parentElement;
  }

  for (const container of containers) {
    container.scrollTop = 0;
  }
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  if (focusTarget) {
    focusTarget.focus({ preventScroll: true });
  }
}

function scheduleWizardScrollToTop(
  anchor: HTMLElement | null,
  focusTarget?: HTMLElement | null,
) {
  const run = () => scrollWizardToTop(anchor, focusTarget);
  run();
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  window.setTimeout(run, 50);
  window.setTimeout(run, 150);
}

function readDraftIdFromUrl(): string | null {
  const draft = new URLSearchParams(window.location.search).get("draft");
  return draft && UUID_PATTERN.test(draft) ? draft : null;
}

function buildPayload(values: AiEmployeeFormValues): AiEmployeeFormValues {
  return {
    ...values,
    name: resolveAiEmployeeInternalName(values.name, values.displayName),
    status: "draft",
  };
}

export function AgentCreateWizardPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
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

  const [draftId, setDraftId] = useState<string | null>(() => readDraftIdFromUrl());
  const urlDraftId = useMemo(() => readDraftIdFromUrl(), [location]);
  const effectiveDraftId = urlDraftId ?? draftId;
  const [stepIndex, setStepIndex] = useState(0);
  const [nameTouched, setNameTouched] = useState(false);
  const [values, setValues] = useState<AiEmployeeFormValues>({
    ...DEFAULT_AI_EMPLOYEE_FORM,
    ownerId: user?.id ?? null,
  });
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hydratedDraftRef = useRef<string | null>(null);

  const createEmployee = useCreateAiEmployee(companyId);
  const updateEmployee = useUpdateAiEmployee(companyId, effectiveDraftId);
  const draftQuery = useAiEmployee(companyId, effectiveDraftId);
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
  const busy = isSavingDraft || createEmployee.isPending || updateEmployee.isPending;

  useEffect(() => {
    scheduleWizardScrollToTop(topAnchorRef.current, stepHeadingRef.current);
  }, [stepIndex]);

  useEffect(() => {
    if (urlDraftId !== draftId) {
      if (!urlDraftId && draftId) {
        setValues({ ...DEFAULT_AI_EMPLOYEE_FORM, ownerId: user?.id ?? null });
        setStepIndex(0);
        setNameTouched(false);
      }
      setDraftId(urlDraftId);
      hydratedDraftRef.current = null;
    }
  }, [location, urlDraftId, draftId, user?.id]);

  useEffect(() => {
    if (!effectiveDraftId || !draftQuery.data) return;
    if (hydratedDraftRef.current === effectiveDraftId) return;
    const formValues = recordToFormValues(draftQuery.data);
    setValues(formValues);
    setNameTouched(Boolean(formValues.name.trim()));
    setStepIndex(inferAiEmployeeWizardResumeStepIndex(formValues));
    hydratedDraftRef.current = effectiveDraftId;
  }, [effectiveDraftId, draftQuery.data]);

  const goToStep = (nextIndex: number) => {
    setStepIndex(nextIndex);
  };

  const onChange = (patch: Partial<AiEmployeeFormValues>) => {
    if (patch.name !== undefined) {
      setNameTouched(true);
    }
    setValues((current) => {
      const next = { ...current, ...patch };
      if (
        patch.displayName !== undefined &&
        !nameTouched &&
        patch.name === undefined &&
        (!current.name.trim() || current.name === normalizeAiEmployeeName(current.displayName))
      ) {
        next.name = normalizeAiEmployeeName(patch.displayName) || current.name;
      }
      return next;
    });
  };

  const canProceed = () => {
    if (step === "general") {
      return Boolean(values.displayName.trim());
    }
    if (step === "prompt") {
      return Boolean(values.systemPrompt.trim());
    }
    if (step === "intelligence") {
      return Boolean(values.provider?.trim() && values.model?.trim());
    }
    return true;
  };

  const persistDraft = async (nextValues: AiEmployeeFormValues): Promise<string> => {
    const payload = buildPayload(nextValues);
    const decision = resolveWizardDraftPersistDecision({
      urlDraftId,
      stateDraftId: draftId,
      loadedDraft: draftQuery.data,
      isDraftLoading: draftQuery.isLoading,
    });

    if (decision.mode === "blocked") {
      if (decision.reason === "draft_not_found") {
        throw new AiEmployeeRegistryError(
          "Draft employee not found. Start a new employee instead of creating a duplicate.",
          "not_found",
        );
      }
      if (decision.reason === "archived") {
        throw new AiEmployeeRegistryError(
          "This employee is archived. Restore it from Lifecycle before continuing setup.",
          "invalid_state",
        );
      }
      throw new AiEmployeeRegistryError("Draft is still loading.", "validation");
    }

    if (decision.mode === "update") {
      await updateEmployee.mutateAsync(payload);
      if (decision.draftId !== draftId) {
        setDraftId(decision.draftId);
      }
      return decision.draftId;
    }

    if (!canCreate) {
      throw new AiEmployeeRegistryError(
        "You do not have permission to create AI employees.",
        "validation",
      );
    }
    const created = await createEmployee.mutateAsync(payload);
    setDraftId(created.id);
    hydratedDraftRef.current = created.id;
    setLocation(agentContinueHref(created.id));
    return created.id;
  };

  const handleNext = async () => {
    if (!canProceed()) return;
    setIsSavingDraft(true);
    const isFirstSave = !draftId;
    try {
      await persistDraft(buildPayload(values));
      if (isFirstSave) {
        toast({ title: t("aiEmployees.wizard.draftSaved") });
      }
      goToStep(Math.min(STEPS.length - 1, stepIndex + 1));
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(saveError),
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleFinish = async () => {
    if (!canProceed()) return;
    setIsSavingDraft(true);
    try {
      const payload = buildPayload(values);
      const id = await persistDraft(payload);
      toast({ title: draftId ? t("aiEmployees.wizard.draftFinished") : t("aiEmployees.created") });
      setLocation(nestedSectionHref(agentDetailHref(id)));
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(saveError),
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSaveAndExit = async () => {
    if (!values.displayName.trim()) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: t("aiEmployees.wizard.draftNeedsName"),
      });
      return;
    }
    setIsSavingDraft(true);
    try {
      await persistDraft(buildPayload(values));
      toast({ title: t("aiEmployees.wizard.draftSaved") });
      setLocation(NEST_INDEX);
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("aiEmployees.errors.title"),
        description: formatAiEmployeeError(saveError),
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  if (!canAccess || !canCreate) {
    return <DashboardErrorBanner message={t("aiEmployees.accessDenied")} />;
  }

  const resumeMode = Boolean(urlDraftId ?? draftId);
  const persistBlocked =
    resumeMode &&
    (draftQuery.isLoading ||
      !draftQuery.data ||
      (effectiveDraftId != null && draftQuery.data?.id !== effectiveDraftId) ||
      (draftQuery.data != null && isArchivedAiEmployeeStatus(draftQuery.data.status)));

  if (resumeMode && draftQuery.isLoading) {
    return <DashboardPageFallback />;
  }

  if (resumeMode && draftQuery.error) {
    return (
      <div className="space-y-4">
        <DashboardErrorBanner message={draftQuery.error.message} />
        <Button variant="outline" className="rounded-xl" onClick={() => setLocation(agentNewHref())}>
          {t("aiEmployees.wizard.startNewEmployee")}
        </Button>
      </div>
    );
  }

  if (resumeMode && !draftQuery.isLoading && !draftQuery.data) {
    return (
      <div className="space-y-4">
        <DashboardErrorBanner message={t("aiEmployees.wizard.draftNotFound")} />
        <Button variant="outline" className="rounded-xl" onClick={() => setLocation(agentNewHref())}>
          {t("aiEmployees.wizard.startNewEmployee")}
        </Button>
      </div>
    );
  }

  if (resumeMode && draftQuery.data && isArchivedAiEmployeeStatus(draftQuery.data.status)) {
    return (
      <div className="space-y-4">
        <DashboardErrorBanner message={t("aiEmployees.wizard.archivedDraftBlocked")} />
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() =>
            setLocation(nestedSectionHref(agentDetailHref(draftQuery.data!.id)))
          }
        >
          {t("aiEmployees.wizard.viewArchivedEmployee")}
        </Button>
      </div>
    );
  }

  return (
    <div ref={topAnchorRef} className="w-full scroll-mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl px-2"
          onClick={() => setLocation(NEST_INDEX)}
        >
          <ArrowLeft className="me-2 size-4" />
          {t("aiEmployees.backToList")}
        </Button>
        <div className="flex items-center gap-3">
          {effectiveDraftId ? (
            <p className="text-xs text-muted-foreground">{t("aiEmployees.wizard.draftBadge")}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.wizard.stepOf", { current: stepIndex + 1, total: STEPS.length })}
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("aiEmployees.wizard.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("aiEmployees.wizard.subtitle")}
        </p>
      </div>

      <ModulePurposeBanner
        title={t("aiEmployees.wizard.guide.title")}
        body={t("aiEmployees.wizard.guide.body")}
        points={[
          t("aiEmployees.wizard.guide.points.profile"),
          t("aiEmployees.wizard.guide.points.channels"),
          t("aiEmployees.wizard.guide.points.publish"),
          t("aiEmployees.wizard.guide.points.draft"),
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
                  onClick={() => {
                    if (index <= stepIndex) goToStep(index);
                  }}
                  className={cn(
                    "relative w-full px-2 py-2.5 text-start text-sm transition-colors lg:px-3",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "text-foreground/80 hover:text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  <span className="me-1.5 text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  {t(`aiEmployees.wizard.steps.${wizardStep}`)}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="w-full space-y-6 rounded-2xl border border-border/50 bg-transparent p-5 sm:p-6 lg:p-8">
        <div>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            {t(`aiEmployees.wizard.steps.${step}`)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(`aiEmployees.wizard.stepHints.${step}`)}
          </p>
        </div>

        <AiEmployeeFormSections
          step={step}
          values={values}
          companyId={companyId}
          ownerOptions={ownerOptions}
          knowledgeOptions={knowledgeOptions}
          toolOptions={toolOptions}
          onChange={onChange}
          reviewContext={{
            employeeId: effectiveDraftId,
            transferableFlowId: draftQuery.data?.runtimeConfiguration?.transferableFlowId ?? null,
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={stepIndex === 0 || busy}
              onClick={() => goToStep(Math.max(0, stepIndex - 1))}
            >
              {t("aiEmployees.wizard.back")}
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl"
              disabled={busy || !values.displayName.trim() || persistBlocked}
              onClick={() => void handleSaveAndExit()}
            >
              {t("aiEmployees.wizard.saveDraftExit")}
            </Button>
          </div>
          {isLastStep ? (
            <Button
              className="rounded-xl"
              disabled={busy || !canProceed() || persistBlocked}
              onClick={() => void handleFinish()}
            >
              <Check className="me-2 size-4" />
              {effectiveDraftId ? t("aiEmployees.wizard.finish") : t("aiEmployees.wizard.create")}
            </Button>
          ) : (
            <Button
              className="rounded-xl"
              disabled={busy || !canProceed() || persistBlocked}
              onClick={() => void handleNext()}
            >
              {t("aiEmployees.wizard.next")}
              <ArrowRight className="ms-2 size-4" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
