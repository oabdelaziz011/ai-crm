import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function LeadsAssignOwnerDialog({
  open,
  onOpenChange,
  leadName,
  ownerOptions,
  currentOwnerId,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  ownerOptions: readonly { id: string; label: string }[];
  currentOwnerId?: string | null;
  isPending: boolean;
  onConfirm: (ownerId: string) => void;
}) {
  const { t } = useTranslation("common");
  const [ownerId, setOwnerId] = useState(currentOwnerId ?? "");

  useEffect(() => {
    if (open) setOwnerId(currentOwnerId ?? "");
  }, [currentOwnerId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leads.table.rowActions.assign")}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          {t("leads.table.assignOwnerHint", { name: leadName })}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="lead-assign-owner">{t("leads.columns.owner")}</Label>
          <Select value={ownerId || undefined} onValueChange={setOwnerId}>
            <SelectTrigger id="lead-assign-owner" className="h-10">
              <SelectValue placeholder={t("leads.workspace.placeholders.select")} />
            </SelectTrigger>
            <SelectContent>
              {ownerOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!ownerId || isPending}
            onClick={() => onConfirm(ownerId)}
          >
            {t("leads.table.rowActions.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadsCreateActivityDialog({
  open,
  onOpenChange,
  leadName,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  isPending: boolean;
  onConfirm: (body: string) => void;
}) {
  const { t } = useTranslation("common");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) setBody("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leads.table.rowActions.createActivity")}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          {t("leads.table.createActivityHint", { name: leadName })}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="lead-activity-body">{t("leads.workspace.fields.notes")}</Label>
          <Textarea
            id="lead-activity-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder={t("leads.workspace.placeholders.notes")}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!body.trim() || isPending}
            onClick={() => onConfirm(body.trim())}
          >
            {t("leads.table.rowActions.createActivity")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadsDeleteConfirmDialog({
  open,
  onOpenChange,
  leadName,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("leads.table.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("leads.table.deleteConfirmBody", { name: leadName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("buttons.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {t("leads.table.rowActions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
