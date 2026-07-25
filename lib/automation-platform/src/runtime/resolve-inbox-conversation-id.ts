/**
 * Resolves the Team Inbox conversation id from automation run variables.
 * Channel inbound pipeline sets conversationId; some flows also expose conversation.id.
 */
export function resolveInboxConversationId(variables: Record<string, unknown>): string | null {
  const direct = variables.conversationId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const conversation = variables.conversation;
  if (conversation && typeof conversation === "object" && !Array.isArray(conversation)) {
    const id = (conversation as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }

  return null;
}
