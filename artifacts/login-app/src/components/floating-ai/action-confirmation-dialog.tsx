import { memo } from "react";
import { AlertTriangle } from "lucide-react";
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
import type { PendingConfirmation } from "@/lib/floating-ai/action-confirmation";

type ActionConfirmationDialogProps = {
  pending: PendingConfirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ActionConfirmationDialog = memo(function ActionConfirmationDialog({
  pending,
  onConfirm,
  onCancel,
}: ActionConfirmationDialogProps) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" aria-hidden="true" />
            {t("floatingAi.confirmation.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("floatingAi.confirmation.description")}
            {pending && (
              <span className="mt-2 block rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
                {pending.actionLabel}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("floatingAi.confirmation.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("floatingAi.confirmation.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
