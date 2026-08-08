import { cn } from "@/lib/utils";

const PALETTES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/20",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/20",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/20",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-cyan-500/20",
] as const;

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function paletteFor(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return PALETTES[0]!;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length]!;
}

export function LeadsAvatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "size-8 text-[11px]"
      : size === "lg"
        ? "size-12 text-sm"
        : size === "xl"
          ? "size-14 text-base"
          : "size-9 text-xs";

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ring-1 ring-inset",
        sizeClass,
        paletteFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
