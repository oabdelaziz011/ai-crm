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
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  itemName?: string;
}

export function DeleteDialog({ open, onClose, onConfirm, isPending, itemName }: Props) {
  const { t } = useTranslation("common");
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="bg-card border-white/10 text-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("dialogs.delete.title", { item: itemName ?? t("dialogs.delete.defaultItem") })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("dialogs.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 hover:bg-white/5">{t("buttons.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("buttons.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
