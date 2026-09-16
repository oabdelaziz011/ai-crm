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
  const showCode = developerMode || showDescription;

  return (
    <span className="min-w-0 flex-1">
      <span className="block font-medium leading-snug text-foreground">{displayName}</span>
      {showDescription || developerMode ? (
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      ) : null}
      {showCode ? (
        <span
          className="mt-1 block truncate font-mono text-[11px] leading-none text-muted-foreground/70"
          dir="ltr"
        >
          {code}
        </span>
      ) : null}
    </span>
  );
}
