import { forwardRef, memo } from "react";
import { Filter, Maximize2, Minimize2, Search } from "lucide-react";

type StatPill = { key: string; label: string; value: number; tone?: string };

type CommandDeckProps = {
  title: string;
  subtitle: string;
  stats: StatPill[];
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  onOpenInsight: () => void;
  insightOpen: boolean;
  insightLabel: string;
  filterActiveCount: number;
  filtersLabel: string;
  loading?: boolean;
  conversationMaximized?: boolean;
  onToggleMaximize?: () => void;
  maximizeLabel?: string;
};

export const CommandDeck = memo(
  forwardRef<HTMLInputElement, CommandDeckProps>(function CommandDeck(
    {
      title,
      subtitle,
      stats,
      searchValue,
      searchPlaceholder,
      onSearchChange,
      onOpenFilters,
      onOpenInsight,
      insightOpen,
      insightLabel,
      filterActiveCount,
      filtersLabel,
      loading,
      conversationMaximized,
      onToggleMaximize,
      maximizeLabel,
    },
    ref,
  ) {
    return (
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--ad-border)] bg-[var(--ad-surface)] px-3 py-1.5">
        <div className="min-w-[120px]">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ad-accent)]">{subtitle}</p>
          <h1 className="text-base font-semibold leading-tight">{title}</h1>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className="flex items-baseline gap-1.5 rounded-full border border-[var(--ad-border-subtle)] px-2.5 py-1"
              title={stat.label}
            >
              <span className={cnStat(stat.tone, loading)}>{stat.value}</span>
              <span className="text-[9px] text-[var(--ad-text-muted)]">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="ms-auto flex min-w-[200px] flex-1 items-center gap-2 lg:max-w-md">
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute start-2.5 size-3.5 text-[var(--ad-text-muted)]" />
            <input
              ref={ref}
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="agent-desk-input ps-8"
            />
          </div>
          <button
            type="button"
            className="agent-desk-btn relative shrink-0"
            onClick={onOpenFilters}
            aria-label={filtersLabel}
          >
            <Filter className="size-3.5" />
            {filterActiveCount > 0 ? (
              <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[var(--ad-accent)] text-[9px] font-bold text-primary-foreground">
                {filterActiveCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={insightOpen ? "agent-desk-btn agent-desk-btn--primary" : "agent-desk-btn"}
            onClick={onOpenInsight}
            aria-expanded={insightOpen}
          >
            {insightLabel}
          </button>
          {onToggleMaximize ? (
            <button
              type="button"
              className="agent-desk-btn shrink-0"
              onClick={onToggleMaximize}
              aria-label={maximizeLabel}
              title={maximizeLabel}
            >
              {conversationMaximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          ) : null}
        </div>
      </header>
    );
  }),
);

function cnStat(tone: string | undefined, loading?: boolean): string {
  const base = "text-sm font-semibold tabular-nums";
  if (loading) return `${base} opacity-50`;
  if (tone === "danger") return `${base} text-[var(--ad-danger)]`;
  if (tone === "warning") return `${base} text-[var(--ad-warn)]`;
  if (tone === "success") return `${base} text-[var(--ad-success)]`;
  if (tone === "info") return `${base} text-[var(--ad-accent)]`;
  return base;
}
