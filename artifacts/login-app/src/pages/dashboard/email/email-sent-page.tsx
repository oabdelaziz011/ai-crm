import { EmailCommunicationPanel } from "@/components/email/email-communication-panel";

export function EmailSentPage() {
  return <EmailCommunicationPanel defaultStatus="sent" hintKey="emailModule.sent.hint" />;
}
