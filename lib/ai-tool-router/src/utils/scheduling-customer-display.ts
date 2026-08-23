const DEFAULT_TIMEZONE = "Africa/Cairo";
const DEFAULT_LOCALE = "ar-EG";

export function formatArabicWeekdayDate(
  isoDate: string,
  timezone: string = DEFAULT_TIMEZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate.trim();
  const parsed = Date.parse(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed)) return isoDate.trim();
  const weekday = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "long",
  }).format(new Date(parsed));
  const gregorian = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(parsed));
  return `${weekday} ${gregorian}`;
}

export function formatArabicTime12h(slotStart: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(slotStart.trim());
  if (!match) return slotStart.trim();
  const hour24 = Number(match[1]);
  const minute = match[2]!.padStart(2, "0");
  if (!Number.isFinite(hour24)) return slotStart.trim();
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "صباحًا" : hour24 < 17 ? "ظهرًا" : "مساءً";
  return `${String(hour12).padStart(2, "0")}:${minute} ${period}`;
}

export function buildAvailabilityCustomerSummary(input: {
  resourceName?: string | null;
  slotsByDate: Map<string, string[]>;
  timezone?: string;
}): string | undefined {
  if (input.slotsByDate.size === 0) return undefined;
  const resourceName = input.resourceName?.trim() || "المختص";
  const lines = [`المواعيد المتاحة${resourceName ? ` مع ${resourceName}` : ""}:`];

  for (const [date, times] of [...input.slotsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dayLabel = formatArabicWeekdayDate(date, input.timezone);
    const formattedTimes = times
      .slice()
      .sort()
      .map((time) => `• ${formatArabicTime12h(time, input.timezone)}`);
    lines.push("", dayLabel, ...formattedTimes);
  }

  return lines.join("\n");
}

export function buildBookingConfirmationMessageAr(input: {
  bookingId: string;
  date: string;
  slotStart: string;
  customerName?: string | null;
  serviceName?: string | null;
  timezone?: string;
}): string {
  const dateLabel = formatArabicWeekdayDate(input.date, input.timezone);
  const timeLabel = formatArabicTime12h(input.slotStart, input.timezone);
  const bookingRef = input.bookingId.replace(/-/g, "").trim().toUpperCase().slice(0, 8);
  const greeting = input.customerName?.trim() ? `تم حجز موعدك بنجاح يا ${input.customerName.trim()} ✅` : "تم حجز موعدك بنجاح ✅";
  const lines = [greeting];
  if (input.serviceName?.trim()) lines.push(`الخدمة: ${input.serviceName.trim()}`);
  lines.push(`اليوم: ${dateLabel}`, `الساعة: ${timeLabel}`, `رقم الحجز: ${bookingRef}`);
  return lines.join("\n");
}

export function buildExistingCustomerGreetingAr(customerName: string): string {
  return `أهلًا يا ${customerName.trim()} 👋\nلقيت بياناتك عندنا، هنكمل الحجز على ملفك الحالي.`;
}

export function buildNewCustomerGreetingAr(customerName: string): string {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName.trim();
  return `أهلًا يا ${firstName} 👋\nدي أول مرة نحجز لك عندنا، هننشئ لك ملف عميل ونربطه بالحجز.`;
}
