import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useExecuteBusinessApologyException,
  usePreviewBusinessApologyException,
} from "@/hooks/scheduling/use-business-appointment-exception";
import { useSchedulingServices } from "@/hooks/scheduling/use-scheduling-services";
import {
  BusinessApologyExceptionError,
  type BusinessApologyExecuteResult,
  type BusinessApologyPreviewResult,
  type BusinessExceptionScope,
} from "@/lib/scheduling/business-exceptions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Draft = {
  exceptionDate: string;
  serviceId: string;
  scope: BusinessExceptionScope;
  startTime: string;
  endTime: string;
  comment: string;
};

const EMPTY_DRAFT: Draft = {
  exceptionDate: "",
  serviceId: "",
  scope: "full_day",
  startTime: "09:00",
  endTime: "12:00",
  comment: "",
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `apology-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function BusinessApologyExceptionCard() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEditScheduling = useSchedulingEditAccess();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canExecute =
    canEditScheduling && (isSuperAdmin || hasPermission("bookings.edit"));

  const { data: services = [], isLoading: servicesLoading } = useSchedulingServices(companyId);
  const previewMutation = usePreviewBusinessApologyException();
  const executeMutation = useExecuteBusinessApologyException();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<BusinessApologyPreviewResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [result, setResult] = useState<BusinessApologyExecuteResult | null>(null);

  const selectedServiceName = useMemo(
    () => services.find((s) => s.id === draft.serviceId)?.name ?? "",
    [services, draft.serviceId],
  );

  const validateDraft = (): string | null => {
    if (!draft.exceptionDate) return t("scheduling.apology.errors.dateRequired");
    if (!draft.serviceId) return t("scheduling.apology.errors.serviceRequired");
    if (!draft.comment.trim()) return t("scheduling.apology.errors.commentRequired");
    if (draft.scope === "hours") {
      if (!draft.startTime || !draft.endTime) return t("scheduling.apology.errors.hoursRequired");
      if (draft.startTime >= draft.endTime) return t("scheduling.apology.errors.invalidTimeRange");
    }
    return null;
  };

  const onSubmitClick = () => {
    const error = validateDraft();
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    if (!canExecute) {
      toast({ title: t("scheduling.apology.errors.unauthorized"), variant: "destructive" });
      return;
    }

    setResult(null);
    previewMutation.mutate(
      {
        exceptionDate: draft.exceptionDate,
        serviceId: draft.serviceId,
        scope: draft.scope,
        startTime: draft.scope === "hours" ? draft.startTime : null,
        endTime: draft.scope === "hours" ? draft.endTime : null,
        comment: draft.comment,
      },
      {
        onSuccess: (data) => {
          setPreview(data);
          setIdempotencyKey(newIdempotencyKey());
          setConfirmOpen(true);
        },
        onError: (err) => {
          const message =
            err instanceof BusinessApologyExceptionError
              ? t(`scheduling.apology.errors.${err.code}`, { defaultValue: err.message })
              : err instanceof Error
                ? err.message
                : t("scheduling.apology.errors.generic");
          toast({ title: message, variant: "destructive" });
        },
      },
    );
  };

  const onConfirm = () => {
    if (!preview || !idempotencyKey) return;
    executeMutation.mutate(
      {
        exceptionDate: draft.exceptionDate,
        serviceId: draft.serviceId,
        scope: draft.scope,
        startTime: draft.scope === "hours" ? draft.startTime : null,
        endTime: draft.scope === "hours" ? draft.endTime : null,
        comment: draft.comment,
        idempotencyKey,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setConfirmOpen(false);
          setDraft(EMPTY_DRAFT);
          toast({ title: t("scheduling.apology.result.successTitle") });
        },
        onError: (err) => {
          const message =
            err instanceof BusinessApologyExceptionError
              ? t(`scheduling.apology.errors.${err.code}`, { defaultValue: err.message })
              : err instanceof Error
                ? err.message
                : t("scheduling.apology.errors.generic");
          toast({ title: message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="overflow-hidden border border-border bg-background">
      <div className="p-5 border-b border-border/40">
        <h3 className="font-semibold text-sm">{t("scheduling.apology.title")}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t("scheduling.apology.subtitle")}</p>
      </div>

      <div className="p-5 space-y-4">
        {!canExecute ? (
          <p className="text-sm text-muted-foreground">{t("scheduling.apology.errors.unauthorized")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("scheduling.apology.fields.date")}</Label>
                <Input
                  type="date"
                  value={draft.exceptionDate}
                  onChange={(e) => setDraft((d) => ({ ...d, exceptionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("scheduling.apology.fields.service")}</Label>
                <select
                  className="w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm"
                  value={draft.serviceId}
                  disabled={servicesLoading}
                  onChange={(e) => setDraft((d) => ({ ...d, serviceId: e.target.value }))}
                >
                  <option value="">{t("scheduling.apology.fields.servicePlaceholder")}</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("scheduling.apology.fields.scope")}</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="apology-scope"
                    checked={draft.scope === "full_day"}
                    onChange={() => setDraft((d) => ({ ...d, scope: "full_day" }))}
                  />
                  {t("scheduling.apology.fields.fullDay")}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="apology-scope"
                    checked={draft.scope === "hours"}
                    onChange={() => setDraft((d) => ({ ...d, scope: "hours" }))}
                  />
                  {t("scheduling.apology.fields.hours")}
                </label>
              </div>
            </div>

            {draft.scope === "hours" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("scheduling.apology.fields.startTime")}</Label>
                  <Input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("scheduling.apology.fields.endTime")}</Label>
                  <Input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>{t("scheduling.apology.fields.comment")}</Label>
              <Textarea
                rows={4}
                value={draft.comment}
                onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                placeholder={t("scheduling.apology.fields.commentPlaceholder")}
              />
            </div>

            <Button
              type="button"
              onClick={onSubmitClick}
              disabled={previewMutation.isPending || executeMutation.isPending}
            >
              {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("scheduling.apology.submit")}
            </Button>
          </>
        )}

        {result ? (
          <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm space-y-1">
            <p className="font-medium">{t("scheduling.apology.result.successTitle")}</p>
            <p>
              {t("scheduling.apology.result.affected")}: {result.affectedAppointmentsCount}
            </p>
            <p>
              {t("scheduling.apology.result.cancelled")}: {result.cancelledAppointmentsCount}
            </p>
            <p>
              {t("scheduling.apology.result.whatsappQueued")}: {result.notificationQueuedCount}
            </p>
            <p>
              {t("scheduling.apology.result.whatsappSent")}: {result.notificationSentCount}
            </p>
            <p>
              {t("scheduling.apology.result.whatsappFailed")}: {result.notificationFailedCount}
            </p>
            {result.notificationSkippedCount > 0 ? (
              <p>
                {t("scheduling.apology.result.whatsappSkipped")}: {result.notificationSkippedCount}
              </p>
            ) : null}
            {result.messageKey === "zero_affected" ? (
              <p className="text-muted-foreground">{t("scheduling.apology.result.zeroAffected")}</p>
            ) : null}
            {result.messageKey === "notifications_queued" ? (
              <p className="text-muted-foreground">
                {t("scheduling.apology.result.queuedDetail", {
                  cancelled: result.cancelledAppointmentsCount,
                  queued: result.notificationQueuedCount,
                })}
              </p>
            ) : null}
            {result.messageKey === "partial_notifications" ? (
              <p className="text-amber-700 dark:text-amber-300">
                {t("scheduling.apology.result.partial")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{t("scheduling.apology.confirm.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                {t("scheduling.apology.confirm.warning", {
                  appointments: preview?.affectedAppointmentsCount ?? 0,
                  customers: preview?.affectedCustomersCount ?? 0,
                })}
              </p>
            </div>
            <p>
              <span className="text-muted-foreground">{t("scheduling.apology.fields.date")}: </span>
              {draft.exceptionDate}
            </p>
            <p>
              <span className="text-muted-foreground">{t("scheduling.apology.fields.service")}: </span>
              {selectedServiceName}
            </p>
            <p>
              <span className="text-muted-foreground">{t("scheduling.apology.fields.scope")}: </span>
              {draft.scope === "full_day"
                ? t("scheduling.apology.fields.fullDay")
                : `${draft.startTime} – ${draft.endTime}`}
            </p>
            <p className="whitespace-pre-wrap">
              <span className="text-muted-foreground">{t("scheduling.apology.fields.comment")}: </span>
              {draft.comment}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("scheduling.apology.confirm.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={executeMutation.isPending || (preview?.affectedAppointmentsCount ?? 0) < 0}
            >
              {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("scheduling.apology.confirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
