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

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  itemName?: string;
}

export function DeleteDialog({ open, onClose, onConfirm, isPending, itemName }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="bg-card border-white/10 text-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemName ?? "item"}?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This action cannot be undone. The record will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
