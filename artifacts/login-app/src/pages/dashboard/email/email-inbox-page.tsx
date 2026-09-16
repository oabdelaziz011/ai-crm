import { EmailFirstTimeOnboarding } from "@/components/email/email-first-time-onboarding";
import { EmailInboxMetrics } from "@/components/email/email-inbox-metrics";
import { EmailSetupStatusCard } from "@/components/email/email-setup-status-card";
import { EmailWorkspacePanel } from "@/components/email/email-workspace-panel";
import { useEmailControlCenter } from "@/hooks/email/use-email-control-center";

/**
 * Email Inbox landing — workspace-first IA.
 * Delivery activity lives on Sent / dedicated delivery views, not this page.
 *
 * Top chrome (Control Center + metrics) is height-capped and scrolls internally
 * so the conversation list/thread/composer always keep a definite remaining pane.
 */
export function EmailInboxPage() {
  const { snapshot, isLoading } = useEmailControlCenter();
  const showFirstTime = snapshot.settingsLoaded && !snapshot.emailConfigured && !isLoading;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="max-h-[min(28vh,16rem)] shrink-0 space-y-1.5 overflow-y-auto pb-1.5"
        data-testid="email-inbox-top-chrome"
      >
        {showFirstTime ? <EmailFirstTimeOnboarding /> : null}
        <EmailSetupStatusCard />
        {showFirstTime ? null : <EmailInboxMetrics />}
      </div>

      <section
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="email-workspace-height-shell"
      >
        <EmailWorkspacePanel />
      </section>
    </div>
  );
}
