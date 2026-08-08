import { cn } from "@/lib/utils";

const LIFECYCLE_TONE: Record<string, { chip: string; dot: string }> = {
  new: {
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  contacted: {
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  nurturing: {
    chip: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  qualified: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  proposal: {
    chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  converted: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  won: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  lost: {
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  archived: {
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

const FALLBACK = {
  chip: "bg-muted/70 text-foreground/80",
  dot: "bg-foreground/35",
};

export function LeadsStageBadge({
  label,
  lifecycleStatus,
  className,
}: {
  label: string;
  lifecycleStatus?: string | null;
  className?: string;
}) {
  const key = (lifecycleStatus ?? label).trim().toLowerCase();
  const tone = LIFECYCLE_TONE[key] ?? FALLBACK;

  return (
    <span
      className={cn(
        "inline-flex max-w-[160px] items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium tracking-tight",
        tone.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      <span className="truncate">{label}</span>
    </span>
  );
}
