import { cn } from "@/lib/utils";

type ValueOrLogoProps = {
  className?: string;
  /** Accessible name; defaults to ValueOR. */
  title?: string;
  /**
   * onLight — official lockup PNG (auth / light plates).
   * onLightSidebar — VR mark + dark wordmark for light system sidebar.
   * onDark — VR mark + white wordmark for dark branded / dark sidebar.
   */
  tone?: "onLight" | "onLightSidebar" | "onDark";
  /** Icon-only VR mark (collapsed sidebar). */
  compact?: boolean;
};

const BASE = import.meta.env.BASE_URL;
const LOGO_CLEAR = `${BASE}assets/images/logo-valueor-clear.png`;
const LOGO_MARK = `${BASE}assets/images/logo-valueor-mark.png`;
const LOGO_MARK_ON_DARK = `${BASE}assets/images/logo-valueor-mark-on-dark.png`;

/**
 * Official ValueOR logo.
 * Sidebar wordmarks intentionally omit the tagline under the name.
 */
export function ValueOrLogo({
  className,
  title = "ValueOR",
  tone = "onLight",
  compact = false,
}: ValueOrLogoProps) {
  if (tone === "onDark") {
    if (compact) {
      return (
        <img
          src={LOGO_MARK_ON_DARK}
          alt={title}
          width={148}
          height={117}
          decoding="async"
          draggable={false}
          className={cn("size-9 select-none object-contain bg-transparent", className)}
        />
      );
    }

    return (
      <div
        dir="ltr"
        role="img"
        aria-label={title}
        className={cn(
          "flex min-w-0 max-w-full items-center gap-2.5 overflow-hidden bg-transparent",
          className,
        )}
      >
        <img
          src={LOGO_MARK_ON_DARK}
          alt=""
          aria-hidden
          width={148}
          height={117}
          decoding="async"
          draggable={false}
          className="h-9 w-auto shrink-0 select-none object-contain"
        />
        <span
          className="truncate text-[1.15rem] font-bold tracking-[-0.02em]"
          style={{ color: "#FFFFFF" }}
        >
          Value
          <span style={{ color: "#3EE6C8" }}>OR</span>
        </span>
      </div>
    );
  }

  if (tone === "onLightSidebar") {
    if (compact) {
      return (
        <img
          src={LOGO_MARK}
          alt={title}
          width={148}
          height={117}
          decoding="async"
          draggable={false}
          className={cn("size-9 select-none object-contain bg-transparent", className)}
        />
      );
    }

    return (
      <div
        dir="ltr"
        role="img"
        aria-label={title}
        className={cn(
          "flex min-w-0 max-w-full items-center gap-2.5 overflow-hidden bg-transparent",
          className,
        )}
      >
        <img
          src={LOGO_MARK}
          alt=""
          aria-hidden
          width={148}
          height={117}
          decoding="async"
          draggable={false}
          className="h-9 w-auto shrink-0 select-none object-contain"
        />
        <span
          className="truncate text-[1.15rem] font-bold tracking-[-0.02em]"
          style={{ color: "#0F172A" }}
        >
          Value
          <span style={{ color: "#0E9BB5" }}>OR</span>
        </span>
      </div>
    );
  }

  return (
    <img
      src={LOGO_CLEAR}
      alt={title}
      width={663}
      height={166}
      decoding="async"
      draggable={false}
      className={cn("h-auto w-full select-none object-contain object-left bg-transparent", className)}
    />
  );
}
