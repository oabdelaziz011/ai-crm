import type { OperationsRow, OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import {
  formatOperationsQueueMoney,
  resolveOperationsPaymentKey,
  resolveOperationsStatusKey,
  translateOperationsPaymentLabel,
  translateOperationsStatusLabel,
  translateOperationsVisitTypeLabel,
} from "@/lib/i18n/operations-queue-labels";
import { resolveAppointmentTiming, resolvePriorityDisplay } from "@/lib/universal-operations/appointment-timing";
import type { TFunction } from "i18next";

export type AppointmentTimelineStep = {
  id: string;
  labelKey: string;
  reached: boolean;
  current: boolean;
  at: string | null;
};

export type AppointmentDrawerModel = {
  patient: {
    name: string;
    phone: string;
    email: string;
    customerType: string;
    visitCount: number | null;
    lastVisit: string | null;
  };
  appointment: {
    queueNumber: string;
    appointmentTime: string | null;
    visitType: string;
    service: string;
    durationMinutes: number | null;
    status: string;
    waitingMinutes: number;
    timingLabel: string | null;
    timingKind: "late" | "starting_soon" | null;
    priority: ReturnType<typeof resolvePriorityDisplay>;
  };
  payment: {
    amountLabel: string;
    paidLabel: string;
    remainingLabel: string;
    invoiceStatus: string;
    paymentStatus: string;
  };
  timeline: AppointmentTimelineStep[];
  notes: {
    internal: string;
    customer: string;
  };
};

function fmtDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

function statusRank(key: string | null): number {
  if (!key) return 0;
  if (key === "waiting" || key === "scheduled" || key === "pending" || key === "booked" || key === "confirmed") return 1;
  if (key === "checked_in") return 2;
  if (key === "in_progress" || key === "with_nurse" || key === "with_doctor") return 3;
  if (key === "completed") return 4;
  if (key === "cancelled" || key === "archived" || key === "no_show") return 0;
  return 1;
}

type SoftCustomer = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  tags?: string[];
  isVip?: boolean;
  totalVisits?: number;
  lastVisit?: string | null;
  notes?: Array<{ body?: string; content?: string; isInternal?: boolean; pinned?: boolean }>;
  outstandingBalanceCents?: number;
  invoiceStatus?: string | null;
  paidCents?: number;
};

/** Build drawer view-model from queue row + optional soft customer enrichment (no booking mutations). */
export function buildAppointmentDrawerModel(
  row: OperationsRow,
  t: TFunction,
  config: OperationsWorkspaceConfig | undefined,
  soft?: SoftCustomer | null,
): AppointmentDrawerModel {
  const currency = String(row.values.currency ?? "USD");
  const amountCents = Math.max(0, Number(row.values.amount) || 0);
  const paymentKey = resolveOperationsPaymentKey(row.paymentStatusId, row.values.payment_status, config);
  const remainingCents =
    soft?.outstandingBalanceCents != null
      ? Math.max(0, Number(soft.outstandingBalanceCents) || 0)
      : paymentKey === "paid"
        ? 0
        : paymentKey === "partial"
          ? Math.max(0, Math.round(amountCents / 2))
          : amountCents;
  const paidCents =
    soft?.paidCents != null
      ? Math.max(0, Number(soft.paidCents) || 0)
      : Math.max(0, amountCents - remainingCents);
  const statusKey = resolveOperationsStatusKey(row.statusId, row.values.status, config);
  const rank = statusRank(statusKey);
  const timing = resolveAppointmentTiming(row);

  let timingLabel: string | null = null;
  let timingKind: "late" | "starting_soon" | null = null;
  if (timing.kind === "late") {
    timingKind = "late";
    timingLabel = t("universalOperations.appointment.lateMinutes", {
      defaultValue: "Late {{minutes}} min",
      minutes: timing.minutes,
    });
  } else if (timing.kind === "starting_soon") {
    timingKind = "starting_soon";
    timingLabel = t("universalOperations.appointment.startingSoon", { defaultValue: "Starting Soon" });
  }

  const tags = soft?.tags ?? (Array.isArray(row.tags) ? row.tags : []);
  const customerType = soft?.isVip
    ? t("universalOperations.appointment.customerType.vip", { defaultValue: "VIP" })
    : tags.length
      ? String(tags[0])
      : t("universalOperations.appointment.customerType.standard", { defaultValue: "Standard" });

  const internalNotes =
    soft?.notes
      ?.filter((n) => n.isInternal || n.pinned)
      .map((n) => n.body ?? n.content ?? "")
      .filter(Boolean)
      .join("\n") ||
    String(row.values.internal_notes ?? "").trim() ||
    t("universalOperations.appointment.notes.empty", { defaultValue: "No internal notes" });

  const customerNotes =
    soft?.notes
      ?.filter((n) => !n.isInternal)
      .map((n) => n.body ?? n.content ?? "")
      .filter(Boolean)
      .join("\n") ||
    String(row.values.customer_notes ?? row.values.notes ?? "").trim() ||
    t("universalOperations.appointment.notes.emptyCustomer", { defaultValue: "No customer notes" });

  const createdAt = row.createdAt;
  const updatedAt = row.updatedAt;

  const timeline: AppointmentTimelineStep[] = [
    {
      id: "created",
      labelKey: "universalOperations.appointment.timeline.created",
      reached: true,
      current: rank <= 1,
      at: createdAt,
    },
    {
      id: "checked_in",
      labelKey: "universalOperations.appointment.timeline.checkedIn",
      reached: rank >= 2,
      current: rank === 2,
      at: rank >= 2 ? updatedAt : null,
    },
    {
      id: "started",
      labelKey: "universalOperations.appointment.timeline.started",
      reached: rank >= 3,
      current: rank === 3,
      at: rank >= 3 ? updatedAt : null,
    },
    {
      id: "completed",
      labelKey: "universalOperations.appointment.timeline.completed",
      reached: rank >= 4,
      current: rank === 4,
      at: rank >= 4 ? updatedAt : null,
    },
  ];

  return {
    patient: {
      name: soft?.name || String(row.values.customer ?? "—"),
      phone: soft?.phone || String(row.values.phone ?? "—"),
      email: soft?.email || String(row.values.email ?? "—"),
      customerType,
      visitCount: soft?.totalVisits ?? null,
      lastVisit: soft?.lastVisit ?? null,
    },
    appointment: {
      queueNumber: String(row.values.queue_number ?? "—"),
      appointmentTime: String(row.values.appointment_time ?? row.values.scheduled_at ?? "") || null,
      visitType: translateOperationsVisitTypeLabel(t, row.values.visit_type),
      service: String(row.values.service ?? "—"),
      durationMinutes:
        row.values.duration_minutes == null || row.values.duration_minutes === ""
          ? null
          : Number(row.values.duration_minutes) || null,
      status: translateOperationsStatusLabel(t, row.statusId, row.values.status, config),
      waitingMinutes: Math.max(0, Number(row.values.waiting_minutes) || 0),
      timingLabel,
      timingKind,
      priority: resolvePriorityDisplay(row.priority),
    },
    payment: {
      amountLabel: formatOperationsQueueMoney(t, amountCents, currency),
      paidLabel: formatOperationsQueueMoney(t, paidCents, currency),
      remainingLabel: formatOperationsQueueMoney(t, remainingCents, currency),
      invoiceStatus:
        soft?.invoiceStatus ||
        (paymentKey === "paid"
          ? t("universalOperations.appointment.invoice.paid", { defaultValue: "Paid" })
          : paymentKey === "partial"
            ? t("universalOperations.appointment.invoice.partial", { defaultValue: "Partially paid" })
            : t("universalOperations.appointment.invoice.open", { defaultValue: "Open" })),
      paymentStatus: translateOperationsPaymentLabel(t, row.paymentStatusId, row.values.payment_status, config),
    },
    timeline,
    notes: {
      internal: internalNotes,
      customer: customerNotes,
    },
  };
}

export function formatDrawerTimestamp(value: string | null): string {
  return fmtDateTime(value) ?? "—";
}
