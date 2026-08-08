import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateSchedulingHoliday,
  useDeleteSchedulingHoliday,
  useSchedulingHolidays,
  useUpdateSchedulingHoliday,
} from "@/hooks/scheduling/use-scheduling-holidays";
import type { BranchRecord } from "@/lib/company/branches/types";
import type { SchedulingHoliday } from "@/lib/scheduling/types";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  branch: BranchRecord | null;
};

export function BranchHolidaysDialog({ open, onClose, companyId, branch }: Props) {
  const { t } = useTranslation("common");
  const { data: holidays = [], isLoading } = useSchedulingHolidays(companyId);
  const createHoliday = useCreateSchedulingHoliday(companyId);
  const updateHoliday = useUpdateSchedulingHoliday(companyId);
  const deleteHoliday = useDeleteSchedulingHoliday(companyId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingHoliday | null>(null);
  const [title, setTitle] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchedulingHoliday | null>(null);

  const branchHolidays = useMemo(() => {
    if (!branch) return [];
    return holidays.filter(
      (holiday) => holiday.branch_id === branch.id || holiday.branch_id == null,
    );
  }, [branch, holidays]);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setHolidayDate("");
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (holiday: SchedulingHoliday) => {
    setEditing(holiday);
    setTitle(holiday.title);
    setHolidayDate(holiday.holiday_date);
    setError(null);
    setEditorOpen(true);
  };

  const submit = () => {
    if (!branch) return;
    setError(null);
    if (!title.trim() || !holidayDate) {
      setError(t("companyWorkspace.branches.holidays.validation"));
      return;
    }

    const values = {
      title: title.trim(),
      holiday_date: holidayDate,
      branch_id: editing?.branch_id === null ? null : branch.id,
    };

    if (editing) {
      updateHoliday.mutate(
        { id: editing.id, values },
        {
          onSuccess: () => setEditorOpen(false),
          onError: (err) => setError(err.message),
        },
      );
      return;
    }

    createHoliday.mutate(
      { ...values, branch_id: branch.id },
      {
        onSuccess: () => setEditorOpen(false),
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>
              {t("companyWorkspace.branches.holidays.title", { name: branch?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>

          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" />
              {t("companyWorkspace.branches.holidays.add")}
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : branchHolidays.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("companyWorkspace.branches.holidays.empty")}
            </p>
          ) : (
            <div className="divide-y divide-border/50 rounded-xl border border-border/50">
              {branchHolidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{holiday.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(holiday.holiday_date), "MMM d, yyyy")}
                      {holiday.branch_id == null
                        ? ` · ${t("scheduling.holidays.companyWide")}`
                        : ""}
                    </p>
                  </div>
                  {holiday.branch_id != null ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(holiday)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => setDeleteTarget(holiday)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("buttons.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("companyWorkspace.branches.holidays.editTitle")
                : t("companyWorkspace.branches.holidays.addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {error ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                {t("scheduling.holidays.fields.title")}
              </label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                {t("scheduling.holidays.fields.date")}
              </label>
              <Input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              {t("buttons.cancel")}
            </Button>
            <Button type="button" onClick={submit}>
              {createHoliday.isPending || updateHoliday.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("buttons.save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("companyWorkspace.branches.holidays.deleteTitle", {
                title: deleteTarget?.title ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("companyWorkspace.branches.holidays.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteHoliday.mutate(deleteTarget.id, {
                  onSuccess: () => setDeleteTarget(null),
                });
              }}
            >
              {t("buttons.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
