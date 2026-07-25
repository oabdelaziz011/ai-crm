import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resourceFormSchema,
  type ResourceFormValues,
} from "@/lib/scheduling/validation/schemas";
import {
  SCHEDULING_RESOURCE_STATUSES,
  SCHEDULING_RESOURCE_TYPES,
  type SchedulingResource,
} from "@/lib/scheduling/types";
import type { Branch } from "@/lib/scheduling/types";

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

type Props = {
  open: boolean;
  onClose: () => void;
  resource?: SchedulingResource | null;
  branches: Branch[];
  defaultTimezone?: string;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (values: ResourceFormValues) => void;
};

export function ResourceFormDialog({
  open,
  onClose,
  resource,
  branches,
  defaultTimezone = "UTC",
  canEdit,
  isPending,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(resource);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      resource_type: "employee",
      branch_id: null,
      status: "active",
      timezone: defaultTimezone,
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: resource?.name ?? "",
        resource_type: resource?.resource_type ?? "employee",
        branch_id: resource?.branch_id ?? null,
        status: resource?.status ?? "active",
        timezone: resource?.timezone ?? defaultTimezone,
        description: resource?.description ?? "",
      });
    }
  }, [open, resource, defaultTimezone, form]);

  const handleSubmit = form.handleSubmit((values) => onSubmit(values));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md border-white/10 bg-card">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("scheduling.resources.editTitle")
              : t("scheduling.resources.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resource-name">{t("scheduling.resources.fields.name")}</Label>
            <Input
              id="resource-name"
              disabled={!canEdit}
              {...form.register("name")}
              className="bg-background/50 border-white/10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-type">{t("scheduling.resources.fields.type")}</Label>
            <select
              id="resource-type"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              {...form.register("resource_type")}
            >
              {SCHEDULING_RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`scheduling.resources.types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-branch">{t("scheduling.resources.fields.branch")}</Label>
            <select
              id="resource-branch"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              value={form.watch("branch_id") ?? ""}
              onChange={(e) =>
                form.setValue("branch_id", e.target.value ? e.target.value : null)
              }
            >
              <option value="">{t("scheduling.resources.noBranch")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="resource-status">{t("scheduling.resources.fields.status")}</Label>
              <select
                id="resource-status"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("status")}
              >
                {SCHEDULING_RESOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`scheduling.resources.statuses.${status}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-timezone">{t("scheduling.resources.fields.timezone")}</Label>
              <select
                id="resource-timezone"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("timezone")}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-description">
              {t("scheduling.resources.fields.description")}
            </Label>
            <textarea
              id="resource-description"
              disabled={!canEdit}
              rows={3}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm resize-none"
              {...form.register("description")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
              {t("buttons.cancel")}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? t("buttons.save") : t("buttons.create")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
