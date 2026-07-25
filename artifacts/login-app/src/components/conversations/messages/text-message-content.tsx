type TextMessageContentProps = {
  text: string;
};

export function TextMessageContent({ text }: TextMessageContentProps) {
  return <p className="whitespace-pre-wrap break-words">{text}</p>;
}
