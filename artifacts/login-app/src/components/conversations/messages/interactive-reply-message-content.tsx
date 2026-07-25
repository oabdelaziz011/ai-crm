type InteractiveReplyMessageContentProps = {
  replyId: string;
  title?: string;
  interactionType?: string;
};

export function InteractiveReplyMessageContent({
  replyId,
  title,
  interactionType,
}: InteractiveReplyMessageContentProps) {
  const label = title ?? replyId;

  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer selection</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground">
        {interactionType ? interactionType.replace(/_/g, " ") : "interactive reply"} · {replyId}
      </p>
    </div>
  );
}
