import { CheckCircle2, Circle, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  hasUnsavedDraft: boolean;
  isPublished: boolean;
};

export function OperationsConfigWorkflowGuide({ hasUnsavedDraft, isPublished }: Props) {
  const { t } = useTranslation("common");

  const steps = [
    {
      key: "edit",
      done: hasUnsavedDraft || isPublished,
      label: t("universalOperations.configuration.workflow.edit"),
    },
    {
      key: "save",
      done: hasUnsavedDraft,
      label: t("universalOperations.configuration.workflow.save"),
    },
    {
      key: "publish",
      done: isPublished && !hasUnsavedDraft,
      label: t("universalOperations.configuration.workflow.publish"),
    },
  ] as const;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
      <p className="text-sm font-medium">{t("universalOperations.configuration.workflow.title")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("universalOperations.configuration.workflow.subtitle")}</p>
      <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
            <span className={step.done ? "text-foreground" : "text-muted-foreground"}>
              <span className="font-medium">{index + 1}.</span> {step.label}
            </span>
            {index < steps.length - 1 ? (
              <Send className="hidden size-3 rotate-90 text-muted-foreground/40 sm:inline sm:rotate-0" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
