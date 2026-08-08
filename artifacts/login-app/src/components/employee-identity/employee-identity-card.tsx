import { memo, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { resolveAvatarDisplayUrl } from "@/lib/avatar-url";
import { avatarColorFromId } from "@/lib/company-workspace/employees/avatar-color";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";
import { cn } from "@/lib/utils";

type Props = {
  /** Profile id or auth user id. */
  userId?: string | null;
  /** Optional preloaded identity (skips fetch when provided). */
  identity?: EmployeeIdentity | null;
  /** Fallback display when identity is missing. */
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  showEmail?: boolean;
  showJobTitle?: boolean;
  showDepartment?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Optional trailing meta (e.g. time). */
  meta?: ReactNode;
  /** When set, full name becomes a focusable control (e.g. open quick profile). */
  onNameClick?: () => void;
  nameAriaLabel?: string;
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return (name.charAt(0) || "U").toUpperCase();
}

/**
 * Shared employee identity card — Avatar · Full Name · Job Title · Email.
 * Never renders a blank job-title row.
 */
export const EmployeeIdentityCard = memo(function EmployeeIdentityCard({
  userId,
  identity: provided,
  fallbackName,
  fallbackEmail,
  showEmail = true,
  showJobTitle = true,
  showDepartment = false,
  size = "sm",
  className,
  meta,
  onNameClick,
  nameAriaLabel,
}: Props) {
  const query = useEmployeeIdentity(provided ? null : userId);
  const identity = provided ?? query.data ?? null;

  const fullName =
    identity?.fullName ||
    fallbackName?.trim() ||
    fallbackEmail?.trim() ||
    identity?.email ||
    "Unknown";
  const jobTitle = showJobTitle ? identity?.jobTitle : null;
  const department = showDepartment ? identity?.department : null;
  const email = showEmail ? identity?.email || fallbackEmail?.trim() || null : null;
  const avatarSrc = resolveAvatarDisplayUrl(identity?.avatarUrl ?? null);
  const colorSeed = identity?.id || userId || fullName;
  const fallbackBg = avatarColorFromId(colorSeed);

  const avatarSize = size === "md" ? "size-10" : "size-8";
  const nameClass = size === "md" ? "text-sm" : "text-[12px]";

  const avatarNode = (
    <Avatar className={cn(avatarSize, "shrink-0")}>
      {avatarSrc ? (
        <AvatarImage key={avatarSrc} src={avatarSrc} alt={fullName} />
      ) : (
        <AvatarFallback
          delayMs={0}
          className="text-[10px] font-semibold text-white"
          style={{ backgroundColor: fallbackBg }}
          aria-hidden
        >
          {initials(fullName)}
        </AvatarFallback>
      )}
    </Avatar>
  );

  return (
    <div className={cn("flex min-w-0 items-start gap-2.5", className)}>
      {onNameClick ? (
        <button
          type="button"
          onClick={onNameClick}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={nameAriaLabel ?? fullName}
        >
          {avatarNode}
        </button>
      ) : (
        avatarNode
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {onNameClick ? (
              <button
                type="button"
                onClick={onNameClick}
                className={cn(
                  "truncate text-start font-semibold leading-tight text-foreground",
                  "rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  nameClass,
                )}
                aria-label={nameAriaLabel ?? fullName}
              >
                {fullName}
              </button>
            ) : (
              <p className={cn("truncate font-semibold leading-tight text-foreground", nameClass)}>
                {fullName}
              </p>
            )}
            {jobTitle ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{jobTitle}</p>
            ) : null}
            {department ? (
              <p className="truncate text-[11px] text-muted-foreground/80">{department}</p>
            ) : null}
            {email ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{email}</p>
            ) : null}
          </div>
          {meta ? (
            <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{meta}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});
