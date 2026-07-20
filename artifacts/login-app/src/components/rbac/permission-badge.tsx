import type { PermissionRecord } from "@/hooks/use-rbac";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
import {
  resolvePermissionDescription,
  resolvePermissionDisplayName,
} from "@/lib/rbac/permission-display-i18n";
import { cn } from "@/lib/utils";

type PermissionBadgeProps = {
  code: string;
  permission?: PermissionRecord | null;
  className?: string;
  title?: boolean;
};

export function PermissionBadge({ code, permission, className, title }: PermissionBadgeProps) {
  const { developerMode } = useRbacDeveloperMode();
  const displayName = resolvePermissionDisplayName(code, permission ?? null);
  const description = resolvePermissionDescription(code, permission ?? null);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border border-white/10 bg-black/20 px-2.5 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
      title={title ? description : undefined}
    >
      <span className="truncate">{displayName}</span>
      {developerMode ? (
        <span className="ms-1 truncate font-mono text-[10px] text-muted-foreground" dir="ltr">
          ({code})
        </span>
      ) : null}
    </span>
  );
}

type PermissionLabelProps = {
  code: string;
  permission?: PermissionRecord | null;
  showDescription?: boolean;
};

export function PermissionLabel({ code, permission, showDescription = false }: PermissionLabelProps) {
  const { developerMode } = useRbacDeveloperMode();
  const displayName = resolvePermissionDisplayName(code, permission ?? null);
  const description = resolvePermissionDescription(code, permission ?? null);

  return (
    <span className="min-w-0 flex-1">
      <span className="block font-medium text-foreground">{displayName}</span>
      {developerMode || showDescription ? (
        <span className="block text-xs text-muted-foreground">{description}</span>
      ) : null}
      {developerMode ? (
        <span className="block truncate font-mono text-[10px] text-muted-foreground/80" dir="ltr">
          {code}
        </span>
      ) : null}
    </span>
  );
}
