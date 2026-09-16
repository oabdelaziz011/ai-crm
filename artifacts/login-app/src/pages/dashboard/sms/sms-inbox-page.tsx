import { SmsSetupStatusCard } from "@/components/sms/sms-setup-status-card";
import { SmsWorkspacePanel } from "@/components/sms/sms-workspace-panel";

/**
 * SMS Inbox landing — setup status strip above the workspace.
 * The status strip is height-capped so the list/thread/composer always keep a
 * definite remaining pane.
 */
export function SmsInboxPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="max-h-[min(20vh,10rem)] shrink-0 overflow-y-auto pb-1.5"
        data-testid="sms-inbox-top-chrome"
      >
        <SmsSetupStatusCard />
      </div>

      <section
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="sms-workspace-height-shell"
      >
        <SmsWorkspacePanel />
      </section>
    </div>
  );
}
