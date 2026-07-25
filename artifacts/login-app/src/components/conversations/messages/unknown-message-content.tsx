import { TextMessageContent } from "./text-message-content";

type UnknownMessageContentProps = {
  text: string;
};

export function UnknownMessageContent({ text }: UnknownMessageContentProps) {
  return (
    <div className="space-y-1">
      <TextMessageContent text={text} />
      <p className="text-[10px] text-muted-foreground italic">Structured message preview unavailable</p>
    </div>
  );
}
