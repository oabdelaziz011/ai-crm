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
import { useTranslation } from "react-i18next";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";

type AiEmployeeDeleteDialogProps = {
  employee: AiEmployeeRecord | null;
  open: boolean;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function AiEmployeeDeleteDialog({
  employee,
  open,
  isDeleting,
  onOpenChange,
  onConfirm,
}: AiEmployeeDeleteDialogProps) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("aiEmployees.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("aiEmployees.delete.description", { name: employee?.displayName ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t("aiEmployees.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={isDeleting} onClick={() => void onConfirm()}>
            {t("aiEmployees.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
