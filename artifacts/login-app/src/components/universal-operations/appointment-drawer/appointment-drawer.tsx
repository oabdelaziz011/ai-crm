import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationsRow, OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCustomer360Workspace } from "@/hooks/universal-operations/use-customer360-workspace";
import {
  buildAppointmentDrawerModel,
  formatDrawerTimestamp,
} from "@/lib/universal-operations/appointment-drawer-model";
import { PRIORITY_COLORS } from "@/lib/universal-operations/appointment-timing";
import {
  formatAppointmentTime,
  formatWaitingDuration,
} from "@/lib/universal-operations/operations-queue-date-range";
import type { ResolvedOperationsAction } from "@/lib/universal-operations/action-registry";
import { cn } from "@/lib/utils";

const DRAWER_ACTION_ORDER = [
  "appointments.check_in",
  "appointments.send_to_doctor",
  "appointments.complete_visit",
  "appointments.cancel",
  "billing.collect_payment",
  "crm.open_customer360",
  "communication.whatsapp",
  "communication.call",
  "billing.print_receipt",
] as const;

const DRAWER_TITLE_KEYS: Record<string, string> = {
  "appointments.check_in": "universalOperations.appointment.actions.checkIn",
  "appointments.send_to_doctor": "universalOperations.appointment.actions.start",
  "appointments.complete_visit": "universalOperations.appointment.actions.complete",
  "appointments.cancel": "universalOperations.appointment.actions.cancel",
  "billing.collect_payment": "universalOperations.appointment.actions.collectPayment",
  "crm.open_customer360": "universalOperations.appointment.actions.customer360",
  "communication.whatsapp": "universalOperations.appointment.actions.whatsapp",
  "communication.call": "universalOperations.appointment.actions.call",
  "billing.print_receipt": "universalOperations.appointment.actions.print",
};

export type AppointmentDrawerActionApi = {
  getAvailableActions: (row: OperationsRow) => ResolvedOperationsAction[];
  requestAction: (action: ResolvedOperationsAction, row: OperationsRow) => void;
  executingId?: string | null;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border/60 bg-card/40 px-3 py-2.5">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Meta({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-end font-medium", accent)}>{value}</span>
    </div>
  );
}

export function AppointmentDrawer({
  row,
  rows,
  open,
  onClose,
  onSelectRow,
  config,
  actions,
}: {
  row: OperationsRow | null;
  rows: OperationsRow[];
  open: boolean;
  onClose: () => void;
  onSelectRow: (row: OperationsRow) => void;
  config?: OperationsWorkspaceConfig;
  actions: AppointmentDrawerActionApi;
}) {
  const { t } = useTranslation("common");
  // Soft enrichment only while drawer is open — does not reload the queue page.
  const { data: customer360 } = useCustomer360Workspace(open ? row : null, "manager");

  const soft = useMemo(() => {
    if (!customer360 || ("isEmpty" in customer360 && customer360.isEmpty)) return null;
    return {
      email: customer360.customer?.email,
      phone: customer360.customer?.phone,
      name: customer360.customer?.name,
      tags: customer360.customer?.tags,
      isVip: customer360.summary?.isVip,
      totalVisits: customer360.summary?.totalVisits,
      lastVisit: customer360.summary?.lastVisit,
      notes: (customer360.notesExtended ?? []).map((note) => ({
        body: String(note.body ?? ""),
        isInternal: Boolean(note.isPrivate),
        pinned: Boolean(note.pinned),
      })),
      outstandingBalanceCents: customer360.outstandingBalanceCents,
      invoiceStatus: customer360.invoices?.[0]?.status ?? null,
      paidCents: undefined as number | undefined,
    };
  }, [customer360]);

  const model = useMemo(
    () => (row ? buildAppointmentDrawerModel(row, t, config, soft) : null),
    [row, t, config, soft],
  );

  const index = row ? rows.findIndex((item) => item.id === row.id) : -1;
  const prevRow = index > 0 ? rows[index - 1] : null;
  const nextRow = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null;

  const quickActions = useMemo(() => {
    if (!row) return [];
    const available = actions.getAvailableActions(row);
    const byId = new Map(available.map((action) => [action.id, action]));
    return DRAWER_ACTION_ORDER.map((id) => byId.get(id)).filter(Boolean) as ResolvedOperationsAction[];
  }, [actions, row]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="relative flex h-full w-[min(440px,100vw)] max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px] [&>button.absolute]:hidden"
      >
        {!row || !model ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t("universalOperations.appointment.empty", { defaultValue: "Select an appointment" })}
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-border/60 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-base font-semibold tracking-tight">{model.patient.name}</p>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: `${PRIORITY_COLORS[model.appointment.priority]}22`,
                        color: PRIORITY_COLORS[model.appointment.priority],
                      }}
                    >
                      {t(`universalOperations.appointment.priority.${model.appointment.priority}`, {
                        defaultValue: model.appointment.priority,
                      })}
                    </span>
                    {model.appointment.timingLabel && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          model.appointment.timingKind === "late"
                            ? "bg-red-500/15 text-red-700 dark:text-red-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {model.appointment.timingLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatAppointmentTime(model.appointment.appointmentTime)} · {model.appointment.service}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!prevRow}
                    onClick={() => prevRow && onSelectRow(prevRow)}
                    aria-label={t("universalOperations.appointment.previous", { defaultValue: "Previous" })}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!nextRow}
                    onClick={() => nextRow && onSelectRow(nextRow)}
                    aria-label={t("universalOperations.appointment.next", { defaultValue: "Next" })}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={onClose}
                    aria-label={t("universalOperations.workspace.close", { defaultValue: "Close" })}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
              <Section title={t("universalOperations.appointment.sections.patient", { defaultValue: "Patient" })}>
                <Meta label={t("universalOperations.appointment.fields.name", { defaultValue: "Name" })} value={model.patient.name} />
                <Meta label={t("universalOperations.appointment.fields.phone", { defaultValue: "Phone" })} value={model.patient.phone} />
                <Meta label={t("universalOperations.appointment.fields.email", { defaultValue: "Email" })} value={model.patient.email || "—"} />
                <Meta
                  label={t("universalOperations.appointment.fields.customerType", { defaultValue: "Customer Type" })}
                  value={model.patient.customerType}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.visitCount", { defaultValue: "Visit Count" })}
                  value={model.patient.visitCount ?? "—"}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.lastVisit", { defaultValue: "Last Visit" })}
                  value={formatDrawerTimestamp(model.patient.lastVisit)}
                />
              </Section>

              <Section title={t("universalOperations.appointment.sections.appointment", { defaultValue: "Appointment" })}>
                <Meta
                  label={t("universalOperations.appointment.fields.queueNumber", { defaultValue: "Queue Number" })}
                  value={model.appointment.queueNumber}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.appointmentTime", { defaultValue: "Appointment Time" })}
                  value={formatAppointmentTime(model.appointment.appointmentTime)}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.visitType", { defaultValue: "Visit Type" })}
                  value={model.appointment.visitType}
                />
                <Meta label={t("universalOperations.appointment.fields.service", { defaultValue: "Service" })} value={model.appointment.service} />
                <Meta
                  label={t("universalOperations.appointment.fields.duration", { defaultValue: "Duration" })}
                  value={
                    model.appointment.durationMinutes != null
                      ? t("universalOperations.appointment.durationMinutes", {
                          defaultValue: "{{minutes}} min",
                          minutes: model.appointment.durationMinutes,
                        })
                      : "—"
                  }
                />
                <Meta label={t("universalOperations.appointment.fields.status", { defaultValue: "Status" })} value={model.appointment.status} />
                <Meta
                  label={t("universalOperations.appointment.fields.waitingTime", { defaultValue: "Waiting Time" })}
                  value={formatWaitingDuration(model.appointment.waitingMinutes)}
                />
              </Section>

              <Section title={t("universalOperations.appointment.sections.payment", { defaultValue: "Payment" })}>
                <Meta label={t("universalOperations.appointment.fields.amount", { defaultValue: "Amount" })} value={model.payment.amountLabel} />
                <Meta label={t("universalOperations.appointment.fields.paid", { defaultValue: "Paid" })} value={model.payment.paidLabel} />
                <Meta
                  label={t("universalOperations.appointment.fields.remaining", { defaultValue: "Remaining" })}
                  value={model.payment.remainingLabel}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.invoiceStatus", { defaultValue: "Invoice Status" })}
                  value={model.payment.invoiceStatus}
                />
                <Meta
                  label={t("universalOperations.appointment.fields.paymentStatus", { defaultValue: "Payment Status" })}
                  value={model.payment.paymentStatus}
                />
              </Section>

              <Section title={t("universalOperations.appointment.sections.timeline", { defaultValue: "Timeline" })}>
                <ol className="space-y-2">
                  {model.timeline.map((step, stepIndex) => (
                    <li key={step.id} className="flex gap-2">
                      <div className="flex w-4 flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-2.5 rounded-full",
                            step.reached ? "bg-primary" : "bg-muted-foreground/30",
                            step.current && "ring-2 ring-primary/40",
                          )}
                        />
                        {stepIndex < model.timeline.length - 1 && (
                          <span className="mt-1 flex-1 w-px bg-border" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pb-2">
                        <p className={cn("text-sm font-medium", !step.reached && "text-muted-foreground")}>
                          {t(step.labelKey)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{formatDrawerTimestamp(step.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>

              <Section title={t("universalOperations.appointment.sections.notes", { defaultValue: "Notes" })}>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {t("universalOperations.appointment.fields.internalNotes", { defaultValue: "Internal Notes" })}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{model.notes.internal}</p>
                </div>
                <div className="border-t border-border/50 pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {t("universalOperations.appointment.fields.customerNotes", { defaultValue: "Customer Notes" })}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{model.notes.customer}</p>
                </div>
              </Section>
            </div>

            <footer className="shrink-0 border-t border-border/60 bg-background/95 px-3 py-2">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("universalOperations.appointment.sections.quickActions", { defaultValue: "Quick Actions" })}
              </p>
              <TooltipProvider delayDuration={200}>
                <div className="flex flex-wrap gap-1.5">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    const busy = actions.executingId === action.id;
                    const title = t(DRAWER_TITLE_KEYS[action.id] ?? action.titleKey, { defaultValue: action.title });
                    const button = (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.destructive ? "destructive" : "outline"}
                        className={cn("h-8 gap-1.5 px-2.5 text-xs", !action.enabled && "opacity-60")}
                        disabled={!action.enabled || busy}
                        onClick={() => actions.requestAction(action, row)}
                      >
                        <Icon className="size-3.5" />
                        {title}
                      </Button>
                    );
                    if (action.enabled) return button;
                    return (
                      <Tooltip key={action.id}>
                        <TooltipTrigger asChild>
                          <span>{button}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {action.disabledReasonKey ? t(action.disabledReasonKey) : title}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
