import { EmailWorkspacePanel } from "@/components/email/email-workspace-panel";

/**
 * Sent folder — same workspace as Inbox, locked to outbound (agent-last) threads.
 */
export function EmailSentPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <section
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="email-workspace-height-shell"
      >
        <EmailWorkspacePanel forcedMetric="sent" />
      </section>
    </div>
  );
}
