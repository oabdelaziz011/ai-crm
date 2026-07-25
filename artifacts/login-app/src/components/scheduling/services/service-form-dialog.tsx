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
  serviceFormSchema,
  type ServiceFormValues,
} from "@/lib/scheduling/validation/service-schemas";
import {
  SCHEDULING_SERVICE_STATUSES,
  type SchedulingService,
} from "@/lib/scheduling/types";

type Props = {
  open: boolean;
  onClose: () => void;
  service?: SchedulingService | null;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (values: ServiceFormValues) => void;
};

export function ServiceFormDialog({
  open,
  onClose,
  service,
  canEdit,
  isPending,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(service);

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      duration_minutes: 30,
      status: "active",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: service?.name ?? "",
        description: service?.description ?? "",
        duration_minutes: service?.duration_minutes ?? 30,
        status: service?.status ?? "active",
      });
    }
  }, [open, service, form]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md border-white/10 bg-card">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("scheduling.services.editTitle")
              : t("scheduling.services.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-name">{t("scheduling.services.fields.name")}</Label>
            <Input
              id="service-name"
              disabled={!canEdit}
              {...form.register("name")}
              className="bg-background/50 border-white/10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="service-duration">
                {t("scheduling.services.fields.duration")}
              </Label>
              <Input
                id="service-duration"
                type="number"
                min={5}
                disabled={!canEdit}
                {...form.register("duration_minutes")}
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-status">{t("scheduling.services.fields.status")}</Label>
              <select
                id="service-status"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("status")}
              >
                {SCHEDULING_SERVICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`scheduling.services.statuses.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-description">
              {t("scheduling.services.fields.description")}
            </Label>
            <textarea
              id="service-description"
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
