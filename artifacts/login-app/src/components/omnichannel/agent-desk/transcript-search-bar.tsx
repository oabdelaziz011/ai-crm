import { memo } from "react";
import { ChevronDown, ChevronUp, Search, Star, X } from "lucide-react";

type TranscriptSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  activeIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  onToggleBookmarks?: () => void;
  bookmarksOnly?: boolean;
  labels: {
    placeholder: string;
    previous: string;
    next: string;
    clear: string;
    bookmarks: string;
    noMatches: string;
  };
};

export const TranscriptSearchBar = memo(function TranscriptSearchBar({
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onNext,
  onPrevious,
  onClear,
  onToggleBookmarks,
  bookmarksOnly,
  labels,
}: TranscriptSearchBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--ad-border-subtle)]/40 bg-[var(--ad-surface)]/80 px-2 py-1.5 backdrop-blur-sm">
      <Search className="size-3.5 shrink-0 text-[var(--ad-text-muted)]" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={labels.placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--ad-text-muted)]"
        dir="auto"
        aria-label={labels.placeholder}
      />
      {query ? (
        <>
          <span className="text-[10px] tabular-nums text-[var(--ad-text-muted)]" dir="ltr">
            {matchCount === 0 ? labels.noMatches : `${activeIndex + 1}/${matchCount}`}
          </span>
          <button type="button" className="rounded p-1 hover:bg-[var(--ad-accent-dim)]" onClick={onPrevious} aria-label={labels.previous}>
            <ChevronUp className="size-3.5" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-[var(--ad-accent-dim)]" onClick={onNext} aria-label={labels.next}>
            <ChevronDown className="size-3.5" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-[var(--ad-accent-dim)]" onClick={onClear} aria-label={labels.clear}>
            <X className="size-3.5" />
          </button>
        </>
      ) : null}
      {onToggleBookmarks ? (
        <button
          type="button"
          className={`rounded p-1 ${bookmarksOnly ? "bg-[var(--ad-accent-dim)] text-[var(--ad-accent)]" : "hover:bg-[var(--ad-accent-dim)]"}`}
          onClick={onToggleBookmarks}
          aria-label={labels.bookmarks}
          aria-pressed={bookmarksOnly}
        >
          <Star className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});
