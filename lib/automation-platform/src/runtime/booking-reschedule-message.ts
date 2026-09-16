import { readConversationLanguage, type ConversationLanguage } from "./conversation-language.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatBookingRescheduleMessage(input: {
  language: ConversationLanguage;
  confirmationCode: string;
  displayDate?: string | null;
  displayTime?: string | null;
  resourceName?: string | null;
}): string {
  const isArabic = input.language === "ar";
  const lines = [isArabic ? "تم تغيير ميعاد الكشف بنجاح ✅" : "Your appointment was rescheduled successfully ✅"];
  if (input.resourceName) lines.push(isArabic ? `مع: ${input.resourceName}` : `With: ${input.resourceName}`);
  if (input.displayDate) lines.push(isArabic ? `التاريخ الجديد: ${input.displayDate}` : `New date: ${input.displayDate}`);
  if (input.displayTime) lines.push(isArabic ? `الوقت الجديد: ${input.displayTime}` : `New time: ${input.displayTime}`);
  lines.push(isArabic ? `رقم الحجز: ${input.confirmationCode}` : `Booking number: ${input.confirmationCode}`);
  return lines.join("\n");
}

export function buildDefaultBookingRescheduleText(variables: Record<string, unknown>): string | null {
  const booking =
    variables.booking && typeof variables.booking === "object" && !Array.isArray(variables.booking)
      ? (variables.booking as Record<string, unknown>)
      : null;
  if (!booking) return null;
  const confirmationCode =
    readString(booking.confirmation_number) ?? readString(booking.confirmation_code);
  if (!confirmationCode) return null;
  return formatBookingRescheduleMessage({
    language: readConversationLanguage(variables) ?? "ar",
    confirmationCode,
    displayDate: readString(booking.display_date) ?? readString(booking.date),
    displayTime: readString(booking.display_time) ?? readString(booking.time),
    resourceName: readString(booking.resource_name) ?? readString(booking.doctor_name),
  });
}
