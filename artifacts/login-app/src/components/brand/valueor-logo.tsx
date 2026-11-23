import {
  VALUEOR_OR_PRIMARY,
  VALUEOR_OR_PRIMARY_ON_DARK,
} from "@/lib/brand/valueor-brand-colors";
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
  /**
   * Sidebar LTR: ValueOR then VR (green ribbon stays on the left).
   * Sidebar RTL / default: VR then ValueOR (Arabic-correct lockup).
   */
  markPlacement?: "beforeWordmark" | "afterWordmark";
};

const BASE = import.meta.env.BASE_URL;
const LOGO_CLEAR = `${BASE}assets/images/logo-valueor-clear.png`;
const LOGO_MARK = `${BASE}assets/images/logo-valueor-mark.png`;
const LOGO_MARK_ON_DARK = `${BASE}assets/images/logo-valueor-mark-on-dark.png`;

/** Sidebar lockup: ~42px brand height, fits the existing 4.25rem chrome. */
/** Same mark/wordmark metrics as the Arabic sidebar lockup. */
const MARK_IMG_CLASS = "h-[42px] w-auto shrink-0 select-none object-contain";
const COMPACT_MARK_CLASS = "size-10 select-none object-contain bg-transparent";
const LOCKUP_CLASS =
  "flex h-[42px] min-w-0 max-w-full flex-row flex-nowrap items-center gap-3 overflow-hidden bg-transparent";
const WORDMARK_CLASS =
  "min-w-0 shrink-0 text-[17px] font-extrabold leading-none tracking-[-0.02em]";

function BrandLockup({
  markSrc,
  title,
  className,
  valueColor,
  orColor,
  markPlacement = "beforeWordmark",
}: {
  markSrc: string;
  title: string;
  className?: string;
  valueColor: string;
  orColor: string;
  markPlacement?: "beforeWordmark" | "afterWordmark";
}) {
  const mark = (
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
  );
  const wordmark = (
    <span className={WORDMARK_CLASS} style={{ color: valueColor }}>
      Value
      <span style={{ color: orColor }}>OR</span>
    </span>
  );

  return (
    <div dir="ltr" role="img" aria-label={title} className={cn(LOCKUP_CLASS, className)}>
      {markPlacement === "afterWordmark" ? (
        <>
          {wordmark}
          {mark}
        </>
      ) : (
        <>
          {mark}
          {wordmark}
        </>
      )}
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
  markPlacement = "beforeWordmark",
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
        orColor={VALUEOR_OR_PRIMARY_ON_DARK}
        markPlacement={markPlacement}
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
        orColor={VALUEOR_OR_PRIMARY}
        markPlacement={markPlacement}
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
