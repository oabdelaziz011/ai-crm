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
  /** @deprecated Use isPending */
  pending?: boolean;
  itemName?: string;
  title?: string;
  description?: string;
}

export function DeleteDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  pending,
  itemName,
  title,
  description,
}: Props) {
  const { t } = useTranslation("common");
  const loading = isPending ?? pending ?? false;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="bg-card border-white/10 text-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title ??
              t("dialogs.delete.title", { item: itemName ?? t("dialogs.delete.defaultItem") })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {description ?? t("dialogs.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 hover:bg-white/5">{t("buttons.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("buttons.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
