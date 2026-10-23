import { splitTextLinks } from "@/lib/ai-employees/utilities/linkify-text";

type TextMessageContentProps = {
  text: string;
};

export function TextMessageContent({ text }: TextMessageContentProps) {
  const parts = splitTextLinks(text);
  return (
    <p className="whitespace-pre-wrap break-words" dir="auto">
      {parts.map((part, index) =>
        part.href ? (
          <a
            key={`${part.href}-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="text-blue-600 underline"
            style={{ unicodeBidi: "isolate" }}
          >
            {part.text}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.text}</span>
        ),
      )}
    </p>
  );
}
