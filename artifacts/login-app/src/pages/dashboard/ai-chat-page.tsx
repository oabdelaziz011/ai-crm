import { useHasPermission } from "@/hooks/use-rbac";
import { AiChatWorkspace } from "@/components/ai-chat/ai-chat-workspace";

export default function AiChatPage() {
  const canViewAi = useHasPermission("ai_chat.view");

  if (!canViewAi) {
    return null;
  }

  return <AiChatWorkspace />;
}
