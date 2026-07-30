import { Redirect } from "wouter";

/** @deprecated Use `/dashboard/settings/platform-ai` — kept for legacy imports. */
export function PlatformAIAdminPage() {
  return <Redirect to="/settings/platform-ai" />;
}
