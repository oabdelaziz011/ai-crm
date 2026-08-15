import { Redirect } from "wouter";

/**
 * Settings → Calendar entry. Opens the full calendar module (kept at /dashboard/calendar
 * for full-bleed layout) without listing it in the main sidebar.
 */
export function SettingsCalendarPage() {
  return <Redirect to="~/dashboard/calendar" />;
}
