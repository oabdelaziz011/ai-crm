import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type WizardStepId = 1 | 2 | 3 | 4 | 5 | 6;

export const WIZARD_STEP_IDS: WizardStepId[] = [1, 2, 3, 4, 5, 6];

type CompanyApprovalWizardStepperProps = {
  currentStep: WizardStepId;
  commercialPath: "trial" | "package" | "custom" | "reject" | null;
};

export function CompanyApprovalWizardStepper({
  currentStep,
  commercialPath,
}: CompanyApprovalWizardStepperProps) {
  const { t } = useTranslation("common");

  const labels: Record<WizardStepId, string> = {
    1: t("companies.approval.wizard.steps.review"),
    2: t("companies.approval.wizard.steps.decision"),
    3: t("companies.approval.wizard.steps.features"),
    4: t("companies.approval.wizard.steps.limits"),
    5: t("companies.approval.wizard.steps.pricing"),
    6: t("companies.approval.wizard.steps.final"),
  };

  function isSkipped(step: WizardStepId): boolean {
    return commercialPath === "reject" && step >= 3 && step <= 5;
  }

  function isCompleted(step: WizardStepId): boolean {
    if (commercialPath === "reject") {
      if (step === 1) return currentStep > 1;
      if (step === 2) return currentStep > 2 && currentStep !== 2;
      if (step === 6) return false;
      return false;
    }
    return step < currentStep;
  }

  function isCurrent(step: WizardStepId): boolean {
    return step === currentStep;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("companies.approval.wizard.title")}
        </p>
        <p className="text-sm font-medium text-foreground">
          {t("companies.approval.wizard.stepOf", { current: currentStep, total: 6 })}
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {WIZARD_STEP_IDS.map((step) => {
          const skipped = isSkipped(step);
          const completed = !skipped && isCompleted(step);
          const current = isCurrent(step);
          return (
            <li
              key={step}
              className={cn(
                "rounded-lg border px-3 py-2 transition-colors",
                skipped && "border-dashed border-border/70 bg-muted/20 opacity-60",
                !skipped && completed && "border-primary/30 bg-primary/5",
                !skipped && current && "border-primary bg-primary/10 ring-1 ring-primary/20",
                !skipped && !completed && !current && "border-border bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    completed && "bg-primary text-primary-foreground",
                    current && !completed && "bg-primary text-primary-foreground",
                    !completed && !current && "bg-muted text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="size-3.5" aria-hidden="true" /> : step}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-xs font-medium",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {labels[step]}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
