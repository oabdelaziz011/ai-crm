import type {
  CalendarEventColor,
  CalendarEventIcon,
  CalendarEventRecord,
} from "@/lib/calendar/types/calendar-event";
import type {
  SchedulingBookingSource,
  SchedulingBookingStatus,
} from "@/lib/scheduling/booking-domain";

const STATUS_COLORS: Record<SchedulingBookingStatus, CalendarEventColor> = {
  confirmed: {
    bgClass: "bg-emerald-500/15",
    borderClass: "border-emerald-500/40",
    textClass: "text-emerald-100",
    accentClass: "border-l-emerald-400",
  },
  checked_in: {
    bgClass: "bg-amber-500/15",
    borderClass: "border-amber-500/40",
    textClass: "text-amber-100",
    accentClass: "border-l-amber-400",
  },
  with_nurse: {
    bgClass: "bg-teal-500/15",
    borderClass: "border-teal-500/40",
    textClass: "text-teal-100",
    accentClass: "border-l-teal-400",
  },
  in_progress: {
    bgClass: "bg-sky-500/15",
    borderClass: "border-sky-500/40",
    textClass: "text-sky-100",
    accentClass: "border-l-sky-400",
  },
  pending: {
    bgClass: "bg-amber-500/15",
    borderClass: "border-amber-500/40",
    textClass: "text-amber-100",
    accentClass: "border-l-amber-400",
  },
  completed: {
    bgClass: "bg-slate-500/15",
    borderClass: "border-slate-500/40",
    textClass: "text-slate-200",
    accentClass: "border-l-slate-400",
  },
  archived: {
    bgClass: "bg-slate-500/10",
    borderClass: "border-slate-500/30",
    textClass: "text-slate-300",
    accentClass: "border-l-slate-500",
  },
  cancelled: {
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
    textClass: "text-rose-200/70 line-through",
    accentClass: "border-l-rose-400/50",
  },
  no_show: {
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/50 border-dashed",
    textClass: "text-rose-200",
    accentClass: "border-l-rose-500",
  },
  rescheduled: {
    bgClass: "bg-transparent",
    borderClass: "border-transparent",
    textClass: "text-muted-foreground",
    accentClass: "border-l-transparent",
  },
};

const SOURCE_ICONS: Partial<Record<SchedulingBookingSource, CalendarEventIcon>> = {
  whatsapp: "source-whatsapp",
  ai_assistant: "source-ai",
  public_booking: "source-public",
  call_center: "source-call-center",
  api: "source-api",
  crm: "source-crm",
};

export class CalendarColorService {
  getEventColor(status: SchedulingBookingStatus): CalendarEventColor {
    return STATUS_COLORS[status];
  }

  getSourceIcon(source: SchedulingBookingSource): CalendarEventIcon | null {
    return SOURCE_ICONS[source] ?? null;
  }

  resolveIcons(record: Pick<CalendarEventRecord, "source" | "notes">): CalendarEventIcon[] {
    const icons: CalendarEventIcon[] = [];
    const sourceIcon = this.getSourceIcon(record.source);
    if (sourceIcon) {
      icons.push(sourceIcon);
    }
    if (record.notes?.trim()) {
      icons.push("notes");
    }
    return icons;
  }
}
