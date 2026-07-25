import type { ButtonOptionView } from "@workspace/ai-conversation";
import { TextMessageContent } from "./text-message-content";

type ButtonsMessageContentProps = {
  text: string;
  buttons: ButtonOptionView[];
};

export function ButtonsMessageContent({ text, buttons }: ButtonsMessageContentProps) {
  return (
    <div className="space-y-2">
      <TextMessageContent text={text} />
      <div className="flex flex-wrap gap-1.5 pt-1">
        {buttons.map((button) => (
          <span
            key={button.id}
            className="inline-flex items-center rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-muted-foreground cursor-not-allowed"
            aria-disabled="true"
            title={button.id}
          >
            {button.label}
          </span>
        ))}
      </div>
    </div>
  );
}
