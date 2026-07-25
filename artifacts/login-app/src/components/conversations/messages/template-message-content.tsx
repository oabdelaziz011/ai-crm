type TemplateMessageContentProps = {
  templateKey: string;
  language?: string;
  variables?: Record<string, unknown>;
};

export function TemplateMessageContent({ templateKey, language, variables }: TemplateMessageContentProps) {
  const variableEntries = variables ? Object.entries(variables) : [];

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template message</p>
      <p className="text-sm font-medium">{templateKey}</p>
      {language ? <p className="text-[11px] text-muted-foreground">Language: {language}</p> : null}
      {variableEntries.length > 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/10 p-2 space-y-1">
          {variableEntries.map(([key, value]) => (
            <p key={key} className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">{key}:</span> {String(value)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
