import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeReadinessScore, AiEmployeeValidationResult } from "@/lib/ai-employees/types";
import { hasBlockingPublishIssues } from "@/lib/ai-employees/services/ai-employee-validation-service";

type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: AgentRuntimeConfiguration | null;
  validation: AiEmployeeValidationResult | null;
  readiness: AiEmployeeReadinessScore | null;
  isPublishing: boolean;
  onPublish: (publishNotes: string) => Promise<void>;
};

export function PublishDialog({
  open,
  onOpenChange,
  preview,
  validation,
  readiness,
  isPublishing,
  onPublish,
}: PublishDialogProps) {
  const { t } = useTranslation("common");
  const [step, setStep] = useState<"validate" | "notes" | "success">("validate");
  const [publishNotes, setPublishNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const blockingIssues = useMemo(
    () => (validation?.issues ?? []).filter((issue) => issue.severity === "error"),
    [validation],
  );
  const canPublish =
    Boolean(preview?.ready) &&
    !hasBlockingPublishIssues(validation ?? { ready: false, issues: [] }) &&
    (readiness?.ready ?? false);

  const reset = () => {
    setStep("validate");
    setPublishNotes("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePublish = async () => {
    setError(null);
    try {
      await onPublish(publishNotes);
      setStep("success");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t("aiEmployees.lifecycle.publish.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("aiEmployees.lifecycle.publish.title")}</DialogTitle>
          <DialogDescription>{t("aiEmployees.lifecycle.publish.description")}</DialogDescription>
        </DialogHeader>

        {step === "validate" ? (
          <div className="space-y-4">
            {canPublish ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">{t("aiEmployees.lifecycle.publish.readyTitle")}</p>
                  <p className="mt-1">{t("aiEmployees.lifecycle.publish.readyDescription", { score: readiness?.score ?? 0 })}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">{t("aiEmployees.lifecycle.publish.fixTitle")}</p>
                <ul className="mt-2 space-y-1">
                  {blockingIssues.map((issue) => (
                    <li key={`${issue.field}-${issue.code}`}>• {issue.message}</li>
                  ))}
                  {blockingIssues.length === 0 ? (
                    <li>• {t("aiEmployees.lifecycle.publish.notReady")}</li>
                  ) : null}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {step === "notes" ? (
          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="publish-notes">
              {t("aiEmployees.lifecycle.publish.notesLabel")}
            </label>
            <Textarea
              id="publish-notes"
              value={publishNotes}
              onChange={(event) => setPublishNotes(event.target.value)}
              placeholder={t("aiEmployees.lifecycle.publish.notesPlaceholder")}
              className="min-h-24 rounded-xl"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {step === "success" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p>{t("aiEmployees.lifecycle.publish.success")}</p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "validate" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)}>
                {t("aiEmployees.cancel")}
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={!canPublish}
                onClick={() => setStep("notes")}
              >
                {t("aiEmployees.lifecycle.publish.continue")}
              </Button>
            </>
          ) : null}
          {step === "notes" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("validate")}>
                {t("aiEmployees.lifecycle.publish.back")}
              </Button>
              <Button type="button" className="rounded-xl" disabled={isPublishing} onClick={() => void handlePublish()}>
                {isPublishing ? <Loader2 className="me-2 size-4 animate-spin" /> : <UploadCloud className="me-2 size-4" />}
                {t("aiEmployees.lifecycle.publish.confirm")}
              </Button>
            </>
          ) : null}
          {step === "success" ? (
            <Button type="button" className="rounded-xl" onClick={() => handleOpenChange(false)}>
              {t("aiEmployees.lifecycle.publish.done")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
