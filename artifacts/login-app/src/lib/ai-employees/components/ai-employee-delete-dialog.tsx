import { Link } from "wouter";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { agentLifecycleHref } from "@/config/agents-route-registry";
import type { AiEmployeeDeleteDependencyResult } from "@/lib/ai-employees/services/assert-ai-employee-safe-to-archive";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";

type AiEmployeeDeleteDialogProps = {
  employee: AiEmployeeRecord | null;
  open: boolean;
  isDeleting: boolean;
  isChecking: boolean;
  dependencyResult: AiEmployeeDeleteDependencyResult | null;
  checkError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onRecheck: () => void;
};

export function AiEmployeeDeleteDialog({
  employee,
  open,
  isDeleting,
  isChecking,
  dependencyResult,
  checkError,
  onOpenChange,
  onConfirm,
  onRecheck,
}: AiEmployeeDeleteDialogProps) {
  const { t } = useTranslation("common");

  const isActiveBlocked = Boolean(dependencyResult?.isActiveEmployee);
  const isArchivedBlocked = Boolean(dependencyResult?.alreadyArchived);
  const isNotFoundBlocked =
    Boolean(dependencyResult) &&
    !dependencyResult?.canDelete &&
    !isActiveBlocked &&
    !isArchivedBlocked;
  const blocked = isActiveBlocked || isArchivedBlocked || isNotFoundBlocked;
  const effectiveChannelNames = dependencyResult?.effectiveChannelNames ?? [];
  const readyToConfirm =
    Boolean(dependencyResult) && !isChecking && !checkError && !blocked;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActiveBlocked
              ? t("aiEmployees.delete.activeBlockedTitle")
              : isArchivedBlocked
                ? t("aiEmployees.delete.archivedBlockedTitle")
                : blocked
                  ? t("aiEmployees.delete.blockedTitle")
                  : t("aiEmployees.delete.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {isChecking ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {t("aiEmployees.delete.checking")}
                </p>
              ) : null}

              {checkError ? <p className="text-destructive">{checkError}</p> : null}

              {!isChecking && !checkError && isActiveBlocked ? (
                <>
                  <p>{t("aiEmployees.delete.activeBlockedDescription")}</p>
                  {effectiveChannelNames.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">
                        {t("aiEmployees.delete.connectedChannelsLabel")}
                      </p>
                      <ul className="list-inside list-disc space-y-1 text-foreground">
                        {effectiveChannelNames.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p>{t("aiEmployees.delete.disableFirstHint")}</p>
                  {employee ? (
                    <Button asChild variant="outline" size="sm" className="rounded-lg">
                      <Link href={agentLifecycleHref(employee.id)}>
                        <ExternalLink className="me-1 size-3.5" />
                        {t("aiEmployees.delete.actions.openLifecycle")}
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : null}

              {!isChecking && !checkError && isArchivedBlocked ? (
                <>
                  <p>{t("aiEmployees.delete.archivedBlockedDescription")}</p>
                  {employee ? (
                    <Button asChild variant="outline" size="sm" className="rounded-lg">
                      <Link href={agentLifecycleHref(employee.id)}>
                        <ExternalLink className="me-1 size-3.5" />
                        {t("aiEmployees.lifecycle.actions.restore")}
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : null}

              {!isChecking && !checkError && isNotFoundBlocked ? (
                <p>{t("aiEmployees.delete.notFoundDescription")}</p>
              ) : null}

              {!isChecking && !checkError && !blocked && dependencyResult ? (
                <p>{t("aiEmployees.delete.description", { name: employee?.displayName ?? "" })}</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={isDeleting}>
            {isActiveBlocked || isArchivedBlocked
              ? t("aiEmployees.delete.close")
              : t("aiEmployees.cancel")}
          </AlertDialogCancel>
          {isActiveBlocked || isArchivedBlocked ? null : checkError || isNotFoundBlocked ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={isChecking || isDeleting}
              onClick={() => onRecheck()}
            >
              {t("aiEmployees.delete.recheck")}
            </Button>
          ) : (
            <AlertDialogAction
              disabled={isDeleting || isChecking || !readyToConfirm}
              onClick={() => void onConfirm()}
            >
              {isDeleting ? t("aiEmployees.delete.deleting") : t("aiEmployees.delete.confirm")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
