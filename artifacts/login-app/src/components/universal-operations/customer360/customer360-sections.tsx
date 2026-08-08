import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  Mic,
  Phone,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import type { OperationsCustomer360WorkspaceData } from "@workspace/universal-operations-engine";
import type { Customer360SectionId } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Customer360Badge,
  Customer360Card,
  Customer360Field,
  Customer360Section,
  fmtDate,
  fmtDateTime,
  fmtMoney,
} from "@/components/universal-operations/customer360/customer360-ui";
import { IntelligenceCommunicationFeed } from "@/components/universal-operations/intelligence/intelligence-context-feed";
import { LazySection } from "@/components/universal-operations/customer360/customer360-lazy-section";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const CHANNEL_ICONS = {
  whatsapp: MessageCircle,
  call: Phone,
  sms: MessageCircle,
  email: Mail,
  internal: MessageCircle,
  voice_note: Mic,
} as const;

function VirtualTimeline({ items }: { items: OperationsCustomer360WorkspaceData["timeline"] }) {
  const [visibleCount, setVisibleCount] = useState(6);
  const visible = items.slice(0, visibleCount);
  return (
    <div className="relative space-y-0 pl-4">
      <div className="absolute bottom-0 left-[7px] top-2 w-px bg-border/70" aria-hidden />
      {visible.map((entry) => (
        <div key={entry.id} className="relative pb-4 last:pb-0">
          <div className="absolute -left-4 top-1.5 size-2.5 rounded-full border-2 border-primary bg-background" />
          <p className="text-sm font-medium">{entry.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{entry.summary}</p>
          <p className="mt-1 text-[10px] text-muted-foreground/80">
            {fmtDateTime(entry.occurredAt)} · {entry.actor}
          </p>
        </div>
      ))}
      {visibleCount < items.length && (
        <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setVisibleCount((c) => c + 8)}>
          Show more
        </Button>
      )}
    </div>
  );
}

export function Customer360Sections({
  data,
  sectionId,
  collapsed,
  onToggle,
  communicationGroups,
  communicationSearch,
  onCommunicationSearchChange,
  onOperationAction,
  operationsReady = false,
}: {
  data: OperationsCustomer360WorkspaceData;
  sectionId: Customer360SectionId;
  collapsed?: boolean;
  onToggle?: () => void;
  communicationGroups?: Array<{ dateLabel: string; items: Array<{ id: string; channel: string; preview: string; occurredAt: string; actor: string }> }>;
  communicationSearch?: string;
  onCommunicationSearchChange?: (v: string) => void;
  onOperationAction?: (
    action: "checkIn" | "checkOut" | "noShow" | "cancel" | "reschedule" | "collect" | "invoice",
  ) => void;
  operationsReady?: boolean;
}) {
  const { t } = useTranslation("common");

  const title = t(`customer360.sections.${sectionId}`);

  switch (sectionId) {
    case "todays_operation":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={200}>
            <Customer360Card accent="primary" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{t("customer360.todaysOperation.today")}</p>
                  <p className="mt-1 text-lg font-bold">{data.todaysOperation.service}</p>
                  <p className="text-xs text-muted-foreground">{data.todaysOperation.reference}</p>
                </div>
                <Customer360Badge label={data.todaysOperation.status} tone="success" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Customer360Field label={t("customer360.todaysOperation.employee")} value={data.todaysOperation.assignedEmployee} />
                <Customer360Field label={t("customer360.todaysOperation.branch")} value={data.todaysOperation.branch} />
                <Customer360Field label={t("customer360.todaysOperation.room")} value={data.todaysOperation.room} />
                <Customer360Field label={t("customer360.todaysOperation.duration")} value={`${data.todaysOperation.durationMinutes} min`} />
                <Customer360Field label={t("customer360.todaysOperation.scheduled")} value={fmtDateTime(data.todaysOperation.scheduledAt)} />
                <Customer360Field label={t("customer360.todaysOperation.countdown")} value={`${data.todaysOperation.countdownMinutes} min`} />
                <Customer360Field label={t("customer360.todaysOperation.arrival")} value={fmtDateTime(data.todaysOperation.arrivalAt)} />
                <Customer360Field label={t("customer360.todaysOperation.payment")} value={`${data.todaysOperation.paymentStatus} · ${fmtMoney(data.todaysOperation.paymentAmountCents)}`} />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
                {(["checkIn", "checkOut", "noShow", "cancel", "reschedule", "collect"] as const).map((action) => (
                  <Button
                    key={action}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!operationsReady || !onOperationAction || action === "reschedule"}
                    onClick={() => onOperationAction?.(action)}
                  >
                    {t(`customer360.todaysOperation.${action}`)}
                  </Button>
                ))}
              </div>
            </Customer360Card>
          </LazySection>
        </Customer360Section>
      );

    case "customer_summary":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={220}>
            <Customer360Card className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {data.customer.tags.map((tag) => (
                  <Customer360Badge key={tag} label={tag} tone={tag === "VIP" ? "vip" : "default"} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Customer360Field label={t("customer360.summary.leadSource")} value={data.lead?.source ?? "—"} />
                <Customer360Field label={t("customer360.summary.campaign")} value={data.lead?.campaign ?? "—"} />
                <Customer360Field label={t("customer360.summary.owner")} value={data.lead?.owner ?? "—"} />
                <Customer360Field label={t("customer360.summary.customerSince")} value={data.summary.customerSince} />
                <Customer360Field label={t("customer360.summary.lastVisit")} value={fmtDate(data.summary.lastVisit)} />
                <Customer360Field label={t("customer360.summary.totalVisits")} value={data.summary.totalVisits} />
                <Customer360Field label={t("customer360.summary.totalRevenue")} value={fmtMoney(data.summary.totalRevenueCents)} />
                <Customer360Field label={t("customer360.summary.ltv")} value={fmtMoney(data.summary.lifetimeValueCents)} />
                <Customer360Field label={t("customer360.summary.preferredEmployee")} value={data.summary.preferredEmployee} />
                <Customer360Field label={t("customer360.summary.preferredTime")} value={data.summary.preferredTime} />
                <Customer360Field label={t("customer360.summary.preferredService")} value={data.summary.preferredService} />
                <Customer360Field label={t("customer360.summary.risk")} value={data.summary.riskLevel} />
                <Customer360Field label={t("customer360.summary.satisfaction")} value={`${data.summary.satisfaction}/5`} />
                <Customer360Field label={t("customer360.summary.aiHealth")} value={`${data.summary.aiHealthScore}/100`} />
              </div>
            </Customer360Card>
          </LazySection>
        </Customer360Section>
      );

    case "communication":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={160}>
            {communicationGroups ? (
              <IntelligenceCommunicationFeed
                groups={communicationGroups}
                search={communicationSearch}
                onSearchChange={onCommunicationSearchChange}
              />
            ) : (
              <div className="space-y-2">
                {data.communications.map((item) => {
                  const Icon = CHANNEL_ICONS[item.channel];
                  return (
                    <Customer360Card key={item.id} className="p-3">
                      <div className="flex gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          <Icon className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold capitalize">{item.channel.replace("_", " ")}</p>
                            <span className="text-[10px] text-muted-foreground">{fmtDateTime(item.occurredAt)}</span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.preview}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{item.actor} · {item.direction}</p>
                        </div>
                      </div>
                    </Customer360Card>
                  );
                })}
              </div>
            )}
          </LazySection>
        </Customer360Section>
      );

    case "timeline":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={200}>
            <Customer360Card>
              <VirtualTimeline items={data.timeline} />
            </Customer360Card>
          </LazySection>
        </Customer360Section>
      );

    case "notes":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={180}>
            <div className="space-y-3">
              <Textarea placeholder={t("customer360.notes.placeholder")} className="min-h-[80px] text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled>{t("customer360.notes.pin")}</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled>{t("customer360.notes.template")}</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled>{t("customer360.notes.aiRewrite")}</Button>
              </div>
              {data.notesExtended.map((note) => (
                <Customer360Card key={note.id} className={cn("p-3", note.pinned && "border-amber-500/30")}>
                  {note.pinned && <Customer360Badge label={t("customer360.notes.pinned")} tone="warning" />}
                  <p className="mt-2 text-sm leading-relaxed">{note.body}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {note.author} · {fmtDateTime(note.createdAt)}
                    {note.isPrivate && ` · ${t("customer360.notes.private")}`}
                  </p>
                </Customer360Card>
              ))}
            </div>
          </LazySection>
        </Customer360Section>
      );

    case "invoices_payments":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={160}>
            <div className="space-y-3">
              <Customer360Card accent="warning" className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("customer360.finance.balance")}</p>
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{fmtMoney(data.outstandingBalanceCents)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    disabled={!operationsReady || !onOperationAction || data.outstandingBalanceCents <= 0}
                    onClick={() => onOperationAction?.("collect")}
                  >
                    {t("customer360.finance.collect")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!operationsReady || !onOperationAction}
                    onClick={() => onOperationAction?.("invoice")}
                  >
                    {t("customer360.finance.generateInvoice")}
                  </Button>
                </div>
              </Customer360Card>
              {data.invoices.map((inv) => (
                <Customer360Card key={inv.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{inv.number}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(inv.issuedAt)}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-mono text-sm font-semibold">{fmtMoney(inv.amountCents)}</p>
                    <Customer360Badge label={inv.status} tone={inv.status === "Paid" ? "success" : "warning"} />
                  </div>
                </Customer360Card>
              ))}
              {data.payments.map((pay) => (
                <div key={pay.id} className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2 text-sm">
                  <span>{pay.method}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">+{fmtMoney(pay.amountCents)}</span>
                </div>
              ))}
            </div>
          </LazySection>
        </Customer360Section>
      );

    case "bookings":
      return (
        <BookingsSection
          data={data}
          sectionId={sectionId}
          title={title}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      );

    case "files":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={140}>
            <div className="space-y-2">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
                <Upload className="size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{t("customer360.files.dropzone")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("customer360.files.dropzoneHint")}</p>
              </div>
              {data.files.map((f) => (
                <Customer360Card key={f.id} className="flex items-center gap-3 p-3">
                  <FileText className="size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{f.type} · {f.sizeKb} KB</p>
                  </div>
                </Customer360Card>
              ))}
            </div>
          </LazySection>
        </Customer360Section>
      );

    case "tasks":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={120}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled>{t("customer360.tasks.create")}</Button>
                <Button size="sm" variant="outline" disabled>{t("customer360.tasks.assign")}</Button>
              </div>
              {data.tasks.map((task) => (
                <Customer360Card key={task.id} className="flex items-center gap-3 p-3">
                  {task.status === "Completed" ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : task.status === "Overdue" ? (
                    <XCircle className="size-4 text-red-500" />
                  ) : (
                    <Clock className="size-4 text-amber-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.assignee} · {fmtDate(task.dueAt)}</p>
                  </div>
                  <Customer360Badge label={task.status} tone={task.status === "Overdue" ? "danger" : "default"} />
                </Customer360Card>
              ))}
            </div>
          </LazySection>
        </Customer360Section>
      );

    case "ai_assistant":
      return (
        <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
          <LazySection minHeight={200}>
            <Customer360Card accent="primary" className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <p className="font-semibold">{t("customer360.ai.title")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("customer360.ai.disclaimer")}</p>
              <div className="grid gap-2">
                {data.aiActions.map((action) => (
                  <Button key={action.id} variant="outline" className="h-auto justify-start px-3 py-2.5 text-left" disabled>
                    <div>
                      <p className="text-sm font-medium">{t(`customer360.${action.labelKey}`)}</p>
                      <p className="text-[10px] text-muted-foreground">{action.description}</p>
                    </div>
                  </Button>
                ))}
              </div>
              {data.aiInsights.slice(0, 2).map((insight) => (
                <div key={insight.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
                </div>
              ))}
            </Customer360Card>
          </LazySection>
        </Customer360Section>
      );

    default:
      return null;
  }
}

function BookingsSection({
  data,
  sectionId,
  title,
  collapsed,
  onToggle,
}: {
  data: OperationsCustomer360WorkspaceData;
  sectionId: Customer360SectionId;
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation("common");
  const groups = useMemo(
    () => ({
      current: data.bookings.filter((b) => b.status === "Checked In" || b.status === "Confirmed"),
      upcoming: data.bookings.filter((b) => new Date(b.scheduledAt) > new Date() && b.status !== "Cancelled"),
      completed: data.bookings.filter((b) => b.status === "Completed"),
      cancelled: data.bookings.filter((b) => b.status === "Cancelled"),
      noShow: data.bookings.filter((b) => b.status === "No Show"),
    }),
    [data.bookings],
  );

  return (
    <Customer360Section id={sectionId} title={title} collapsed={collapsed} onToggle={onToggle}>
      <LazySection minHeight={180}>
        <div className="space-y-3">
          {Object.entries(groups).map(([key, items]) =>
            items.length > 0 ? (
              <div key={key}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(`customer360.bookings.${key}`)}
                </p>
                <div className="space-y-2">
                  {items.map((b) => (
                    <Customer360Card key={b.id} className="flex items-center gap-3 p-3">
                      <Calendar className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{b.service}</p>
                        <p className="text-xs text-muted-foreground">{b.resource} · {fmtDateTime(b.scheduledAt)}</p>
                      </div>
                      <Customer360Badge label={b.status} />
                    </Customer360Card>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          <Button variant="outline" size="sm" className="w-full" disabled>
            {t("customer360.bookings.bookAgain")}
          </Button>
        </div>
      </LazySection>
    </Customer360Section>
  );
}
