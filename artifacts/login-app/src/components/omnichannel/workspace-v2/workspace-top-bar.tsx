import { forwardRef, memo } from "react";
import { Search } from "lucide-react";

export type WorkspaceTenantContext = {
  companyName: string | null;
  companyId: string | null;
  userEmail: string | null;
  developerMode: boolean;
  companyLabel: string;
  signedInLabel: string;
};

type WorkspaceTopBarProps = {
  title: string;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  tenant?: WorkspaceTenantContext | null;
};

/** Workspace-local toolbar — not a second application shell. */
export const WorkspaceTopBar = memo(
  forwardRef<HTMLInputElement, WorkspaceTopBarProps>(function WorkspaceTopBar(
    { title, searchValue, searchPlaceholder, onSearchChange, tenant },
    ref,
  ) {
    return (
      <header className="flex min-h-[var(--ws-top-height)] shrink-0 items-center gap-3 border-b border-[var(--ws-border)] bg-[var(--ws-surface)] px-3 py-2">
        <div className="flex min-w-0 shrink-0 flex-col gap-0.5 pe-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
          {tenant ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-[var(--ws-muted)]">
              <span className="truncate">
                {tenant.companyLabel}:{" "}
                <span className="font-medium text-[var(--ws-fg)]">{tenant.companyName ?? "—"}</span>
              </span>
              {tenant.userEmail ? (
                <span className="truncate" title={tenant.userEmail}>
                  {tenant.signedInLabel}:{" "}
                  <span className="font-medium text-[var(--ws-fg)]">{tenant.userEmail}</span>
                </span>
              ) : null}
              {tenant.developerMode && tenant.companyId ? (
                <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400" title={tenant.companyId}>
                  {tenant.companyId}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative mx-2 min-w-0 flex-1 max-w-xl">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
          <input
            ref={ref}
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="ws-input ps-8"
          />
        </div>
      </header>
    );
  }),
);
