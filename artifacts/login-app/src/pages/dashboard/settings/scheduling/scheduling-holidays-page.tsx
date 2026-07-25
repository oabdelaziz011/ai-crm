import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarHeart, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSchedulingHoliday,
  useDeleteSchedulingHoliday,
  useSchedulingHolidays,
  useUpdateSchedulingHoliday,
} from "@/hooks/scheduling/use-scheduling-holidays";
import { useSchedulingBranches } from "@/hooks/scheduling/use-scheduling-resources";
import type { SchedulingHoliday } from "@/lib/scheduling/types";
import type { HolidayFormValues } from "@/lib/scheduling/validation/schemas";

export function SchedulingHolidaysPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: branches = [] } = useSchedulingBranches(companyId);
  const { data: holidays = [], isLoading, error } = useSchedulingHolidays(companyId);
  const createHoliday = useCreateSchedulingHoliday(companyId);
  const updateHoliday = useUpdateSchedulingHoliday(companyId);
  const deleteHoliday = useDeleteSchedulingHoliday(companyId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingHoliday | null>(null);
  const [deleting, setDeleting] = useState<SchedulingHoliday | null>(null);
  const [form, setForm] = useState<HolidayFormValues>({
    holiday_date: "",
    title: "",
    branch_id: null,
  });

  useEffect(() => {
    if (open) {
      setForm({
        holiday_date: editing?.holiday_date ?? "",
        title: editing?.title ?? "",
        branch_id: editing?.branch_id ?? null,
      });
    }
  }, [open, editing]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (holiday: SchedulingHoliday) => {
    setEditing(holiday);
    setOpen(true);
  };

  const submit = () => {
    const onError = (message: string) =>
      toast({ variant: "destructive", title: t("scheduling.errors.title"), description: message });

    if (editing) {
      updateHoliday.mutate(
        { id: editing.id, values: form },
        {
          onSuccess: () => {
            setOpen(false);
            toast({ title: t("scheduling.holidays.updated") });
          },
          onError: (e) => onError(e.message),
        },
      );
      return;
    }

    createHoliday.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        toast({ title: t("scheduling.holidays.created") });
      },
      onError: (e) => onError(e.message),
    });
  };

  return (
    <DashboardCard className="overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CalendarHeart className="w-4 h-4 text-primary" />
            {t("scheduling.holidays.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("scheduling.holidays.subtitle")}</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("scheduling.holidays.add")}
          </Button>
        )}
      </div>

      {error && (
        <div className="p-5">
          <DashboardErrorBanner message={error.message} />
        </div>
      )}

      {isLoading ? (
        <DashboardTableSkeleton />
      ) : holidays.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t("scheduling.holidays.empty")}
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {holidays.map((holiday) => (
            <div key={holiday.id} className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{holiday.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(holiday.holiday_date), "MMM d, yyyy")}
                  {holiday.branches?.name
                    ? ` · ${holiday.branches.name}`
                    : ` · ${t("scheduling.holidays.companyWide")}`}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(holiday)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleting(holiday)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("scheduling.holidays.editTitle") : t("scheduling.holidays.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("scheduling.holidays.fields.title")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("scheduling.holidays.fields.date")}</Label>
              <Input
                type="date"
                value={form.holiday_date}
                onChange={(e) => setForm((prev) => ({ ...prev, holiday_date: e.target.value }))}
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("scheduling.holidays.fields.branch")}</Label>
              <select
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                value={form.branch_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    branch_id: e.target.value ? e.target.value : null,
                  }))
                }
              >
                <option value="">{t("scheduling.holidays.companyWide")}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-white/10">
              {t("buttons.cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={createHoliday.isPending || updateHoliday.isPending}
            >
              {(createHoliday.isPending || updateHoliday.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin me-2" />
              )}
              {editing ? t("buttons.save") : t("buttons.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteHoliday.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast({ title: t("scheduling.holidays.deleted") });
            },
          });
        }}
        title={t("scheduling.holidays.deleteTitle")}
        description={t("scheduling.holidays.deleteDescription", { title: deleting?.title ?? "" })}
        pending={deleteHoliday.isPending}
      />
    </DashboardCard>
  );
}
