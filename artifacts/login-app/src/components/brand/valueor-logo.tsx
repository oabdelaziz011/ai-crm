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

/** Sidebar lockup: ~42px brand height, fits the existing 4.25rem chrome. */
const MARK_IMG_CLASS = "h-[42px] w-auto shrink-0 select-none object-contain";
const COMPACT_MARK_CLASS = "size-10 select-none object-contain bg-transparent";
const LOCKUP_CLASS =
  "flex h-[42px] min-w-0 max-w-full items-center gap-3 overflow-hidden bg-transparent";
const WORDMARK_CLASS =
  "min-w-0 truncate text-[17px] font-bold leading-none tracking-[-0.02em]";

function BrandLockup({
  markSrc,
  title,
  className,
  valueColor,
  orColor,
}: {
  markSrc: string;
  title: string;
  className?: string;
  valueColor: string;
  orColor: string;
}) {
  return (
    <div dir="ltr" role="img" aria-label={title} className={cn(LOCKUP_CLASS, className)}>
      <img
        src={markSrc}
        alt=""
        aria-hidden
        width={148}
        height={117}
        decoding="async"
        draggable={false}
        className={MARK_IMG_CLASS}
      />
      <span className={WORDMARK_CLASS} style={{ color: valueColor }}>
        Value
        <span style={{ color: orColor }}>OR</span>
      </span>
    </div>
  );
}

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
          className={cn(COMPACT_MARK_CLASS, className)}
        />
      );
    }

    return (
      <BrandLockup
        markSrc={LOGO_MARK_ON_DARK}
        title={title}
        className={className}
        valueColor="#FFFFFF"
        orColor="#3EE6C8"
      />
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
          className={cn(COMPACT_MARK_CLASS, className)}
        />
      );
    }

    return (
      <BrandLockup
        markSrc={LOGO_MARK}
        title={title}
        className={className}
        valueColor="#0F172A"
        orColor="#0E9BB5"
      />
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
