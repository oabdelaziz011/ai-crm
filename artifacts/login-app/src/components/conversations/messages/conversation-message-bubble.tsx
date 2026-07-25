import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { parseConversationMessageView } from "@workspace/ai-conversation";
import { ButtonsMessageContent } from "./buttons-message-content";
import { InteractiveReplyMessageContent } from "./interactive-reply-message-content";
import { ListMessageContent } from "./list-message-content";
import { MediaMessageContent } from "./media-message-content";
import { TemplateMessageContent } from "./template-message-content";
import { TextMessageContent } from "./text-message-content";
import { UnknownMessageContent } from "./unknown-message-content";

type ConversationMessageBubbleProps = {
  message: ConversationMessageRecord;
};

export function ConversationMessageBubble({ message }: ConversationMessageBubbleProps) {
  const view = parseConversationMessageView(message);

  switch (view.kind) {
    case "text":
      return <TextMessageContent text={view.text} />;
    case "buttons":
      return <ButtonsMessageContent text={view.text} buttons={view.buttons} />;
    case "list":
      return (
        <ListMessageContent
          title={view.title}
          body={view.body}
          buttonLabel={view.buttonLabel}
          sections={view.sections}
        />
      );
    case "media":
      return <MediaMessageContent url={view.url} caption={view.caption} mediaType={view.mediaType} />;
    case "template":
      return (
        <TemplateMessageContent
          templateKey={view.templateKey}
          language={view.language}
          variables={view.variables}
        />
      );
    case "interactive_reply":
      return (
        <InteractiveReplyMessageContent
          replyId={view.replyId}
          title={view.title}
          interactionType={view.interactionType}
        />
      );
    case "unknown":
      return <UnknownMessageContent text={view.text} />;
    default:
      return <TextMessageContent text={message.content} />;
  }
}
