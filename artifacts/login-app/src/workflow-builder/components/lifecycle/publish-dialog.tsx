import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
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
import { validateWorkflow } from "../../core/validation/workflow-validator";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";

type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controller: WorkflowBuilderController;
  onPublish: (releaseNotes: string) => Promise<void>;
};

export function PublishDialog({ open, onOpenChange, controller, onPublish }: PublishDialogProps) {
  const { validationMessage, wb } = useWorkflowBuilderI18n();
  const [step, setStep] = useState<"validate" | "summary" | "notes" | "success">("validate");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const issues = useMemo(() => validateWorkflow(controller.state.document), [controller.state.document]);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");

  const reset = () => {
    setStep("validate");
    setReleaseNotes("");
    setError(null);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{wb("publishDialog.title")}</DialogTitle>
          <DialogDescription>{wb("publishDialog.description")}</DialogDescription>
        </DialogHeader>

        {step === "validate" ? (
          <div className="space-y-4">
            {blockingIssues.length === 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="font-medium">{wb("publishDialog.readyTitle")}</p>
                  <p className="mt-1">{wb("publishDialog.readyDescription")}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">{wb("publishDialog.fixTitle")}</p>
                <ul className="mt-2 space-y-1">
                  {blockingIssues.map((issue) => (
                    <li key={issue.id}>• {validationMessage(issue)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {step === "summary" ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-4 text-sm">
            <p><span className="font-medium">{wb("publishDialog.workflowLabel")}</span> {controller.state.document.name}</p>
            <p><span className="font-medium">{wb("publishDialog.stepsLabel")}</span> {controller.state.document.nodes.length}</p>
            <p><span className="font-medium">{wb("publishDialog.connectionsLabel")}</span> {controller.state.document.edges.length}</p>
            <p><span className="font-medium">{wb("publishDialog.nextVersionLabel")}</span> {(controller.state.document.activeVersionNumber ?? 0) + 1}</p>
          </div>
        ) : null}

        {step === "notes" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{wb("publishDialog.releaseNotesLabel")}</p>
            <Textarea
              value={releaseNotes}
              onChange={(event) => setReleaseNotes(event.target.value)}
              placeholder={wb("publishDialog.releaseNotesPlaceholder")}
              className="min-h-28 rounded-xl"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {step === "success" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <UploadCloud className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-medium">{wb("publishDialog.successTitle")}</p>
              <p className="mt-1">{wb("publishDialog.successDescription")}</p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "validate" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)}>
                {wb("actions.cancel")}
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={blockingIssues.length > 0}
                onClick={() => setStep("summary")}
              >
                {wb("actions.continue")}
              </Button>
            </>
          ) : null}
          {step === "summary" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("validate")}>
                {wb("actions.back")}
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => setStep("notes")}>
                {wb("publishDialog.addReleaseNotes")}
              </Button>
            </>
          ) : null}
          {step === "notes" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("summary")}>
                {wb("actions.back")}
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void onPublish(releaseNotes)
                    .then(() => setStep("success"))
                    .catch((publishError) =>
                      setError(publishError instanceof Error ? publishError.message : wb("publishDialog.failed")),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                {wb("actions.publish")}
              </Button>
            </>
          ) : null}
          {step === "success" ? (
            <Button type="button" className="rounded-xl" onClick={() => handleOpenChange(false)}>
              {wb("actions.done")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
