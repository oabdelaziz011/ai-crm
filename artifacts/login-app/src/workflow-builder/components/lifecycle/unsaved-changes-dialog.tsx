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
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { wb } = useWorkflowBuilderI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{wb("unsavedChanges.title")}</AlertDialogTitle>
          <AlertDialogDescription>{wb("unsavedChanges.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">{wb("unsavedChanges.continueEditing")}</AlertDialogCancel>
          <AlertDialogAction className="rounded-xl" onClick={onDiscard}>
            {wb("unsavedChanges.discard")}
          </AlertDialogAction>
          <AlertDialogAction className="rounded-xl" onClick={onSave}>
            {wb("unsavedChanges.saveDraft")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
