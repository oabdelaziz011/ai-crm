type Props = {
  message: string;
};

export function TimelineEmptyState({ message }: Props) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{message}</p>;
}
