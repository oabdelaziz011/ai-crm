import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, MapPin, Pause, Play, Plus, Shield, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandIcon } from "@/components/website/website-brand-icon";
import { WebsiteProductShowcase } from "@/components/website/website-product-showcase";
import { WebsiteGalleryReel } from "@/components/website/website-gallery-reel";
import {
  visibleWebsiteServices,
  visibleWebsiteProducts,
  websiteProductDisplayImages,
  WEBSITE_HEADER_NAV,
  type WebsitePreviewProduct,
  websiteChannelHref,
  websiteServiceImage,
  type WebsiteBodySectionKey,
  type WebsiteContent,
  type WebsiteGallery,
  type WebsiteHeaderItem,
  type WebsiteHeroSlot,
  type WebsiteSections,
} from "@/lib/website/website-model";

const INNER_DRAG = new Set([
  "application/x-website-hero",
  "application/x-website-feature",
  "application/x-website-service",
  "application/x-website-slide",
  "application/x-website-channel",
]);

const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type WebsitePreviewService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

export type WebsitePreviewHour = {
  key: string;
  open: string;
  close: string;
};

function sectionFrame(size: "sm" | "md" | "lg" | undefined, coloredHeading: boolean): string {
  const scale = size === "lg" ? "py-8 [&_h2]:text-3xl" : size === "sm" ? "py-1 [&_h2]:text-lg" : "[&_h2]:text-xl";
  return coloredHeading ? `${scale} [&_h2]:[color:var(--website-heading)]` : scale;
}

export function orderedPreviewHours(
  hours: Record<string, { open: string; close: string } | null> | null | undefined,
): WebsitePreviewHour[] {
  if (!hours) return [];
  const keys = Object.keys(hours);
  const ordered = [
    ...DAY_ORDER.filter((day) => keys.includes(day)),
    ...keys.filter((key) => !DAY_ORDER.includes(key as (typeof DAY_ORDER)[number])),
  ];
  return ordered.flatMap((key) => {
    const value = hours[key];
    if (!value?.open || !value.close) return [];
    return [{ key, open: value.open, close: value.close }];
  });
}

export type WebsiteVisitorModel = {
  companyName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string | null;
  headline: string;
  description: string;
  sections: WebsiteSections;
  services: WebsitePreviewService[];
  products?: WebsitePreviewProduct[];
  locationLine: string | null;
  branchLines?: string[];
  hours: WebsitePreviewHour[];
  gallery: WebsiteGallery;
  content: WebsiteContent;
  greeting?: string;
};

function safeAccent(color: string | null): string | undefined {
  if (!color || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return undefined;
  return color;
}

function lightInk(color: string | undefined) {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "ffffff";
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 170;
}

function HeroCtas({
  model,
  accent,
  secondary,
  radius,
  centered = false,
  bookingOn,
  onBook,
}: {
  model: WebsiteVisitorModel;
  accent?: string;
  secondary?: string;
  radius: string;
  centered?: boolean;
  bookingOn: boolean;
  onBook?: (serviceId: string | null) => void;
}) {
  const items = [
    { text: model.content.hero.primaryCta, action: model.content.hero.primaryAction, primary: true },
    { text: model.content.hero.secondaryCta, action: model.content.hero.secondaryAction, primary: false },
  ].filter((item) => item.text.trim() && (item.action !== "booking" || bookingOn));
  if (!items.length) return null;
  return (
    <div className={`mt-5 flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
      {items.map((item) => (
        <button
          key={`${item.action}-${item.text}`}
          type="button"
          className="px-4 py-2 text-sm font-medium"
          style={{
            borderRadius: radius,
            background: item.primary ? (model.content.appearance.button === "soft" ? `${accent ?? "transparent"}22` : accent) : "transparent",
            color: item.primary && model.content.appearance.button !== "soft" ? "#fff" : secondary || accent,
            border: item.primary ? "none" : `1px solid ${secondary || accent || "currentColor"}`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (item.action === "booking") {
              onBook?.(null);
              return;
            }
            if (item.action === "none") return;
            document.getElementById(`website-${item.action}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}

export function WebsiteVisitorBody({
  model,
  mode = "published",
  booking,
  contact,
  onBook,
  onReorder,
  editor,
}: {
  model: WebsiteVisitorModel;
  mode?: "preview" | "published";
  booking?: ReactNode;
  contact?: ReactNode;
  onBook?: (serviceId: string | null) => void;
  onReorder?: (from: WebsiteBodySectionKey, to: WebsiteBodySectionKey) => void;
  editor?: {
    selected: string | null;
    locked?: boolean;
    onSelect: (id: string) => void;
    onCommitText?: (field: "headline" | "description", value: string) => void;
    onDropBlock?: (block: string, before: WebsiteBodySectionKey) => void;
    onMoveHero?: (from: WebsiteHeroSlot, to: WebsiteHeroSlot) => void;
    onMoveFeature?: (from: number, to: number) => void;
    onMoveService?: (fromId: string, toId: string) => void;
    onMoveSlide?: (fromId: string, toId: string) => void;
    onMoveChannel?: (fromId: string, toId: string) => void;
    onAddPlace?: () => void;
    renderToolbar?: (id: string) => ReactNode;
  };
}) {
  const { t, i18n } = useTranslation("common");
  const [dropHint, setDropHint] = useState<string | null>(null);
  const accent = safeAccent(model.content.appearance.primary) ?? safeAccent(model.primaryColor);
  const secondary = safeAccent(model.content.appearance.secondary);
  const headingColor = safeAccent(model.content.appearance.heading) ?? safeAccent(model.content.appearance.text);
  const textColor = safeAccent(model.content.appearance.text);
  const pageStyle = {
    background: safeAccent(model.content.appearance.background),
    color: safeAccent(model.content.appearance.text),
    fontFamily: model.content.appearance.template === "editorial" ? "Georgia, 'Times New Roman', serif" : undefined,
    fontSize: model.content.appearance.bodyScale === "sm" ? "14px" : model.content.appearance.bodyScale === "lg" ? "18px" : "16px",
  };
  const titleClass = model.content.appearance.titleScale === "xl"
    ? "text-5xl sm:text-6xl"
    : model.content.appearance.titleScale === "md"
      ? "text-3xl sm:text-4xl"
      : "text-4xl sm:text-5xl";
  const radius = model.content.appearance.radius === "full" ? "999px" : model.content.appearance.radius === "md" ? "12px" : "20px";
  const cover = model.content.hero.imageUrl || model.coverImageUrl;
  const heroPicture = cover || model.logoUrl || null;
  const heroImagePosition = model.content.hero.imagePosition ?? "center";
  const services = visibleWebsiteServices(model.services, model.content);
  const products = visibleWebsiteProducts(model.products ?? [], model.content).map((product) => {
    const override = model.content.products?.images?.[product.id] ?? null;
    const catalogImages = product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
    const imageUrls = websiteProductDisplayImages(catalogImages, override);
    return {
      ...product,
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      description: model.content.products?.descriptions?.[product.id]?.trim() || product.description,
    };
  });
  const initial = (model.companyName || model.headline || "?").trim().charAt(0).toUpperCase();
  const title = model.headline.trim() || model.companyName;
  const filled = (key: WebsiteVisitorModel["content"]["order"][number]) => {
    if (key === "about") return Boolean(model.description.trim() || model.content.about.heading || model.content.about.bullets.length || model.content.about.imageUrl);
    if (key === "features") return model.content.features.items.length > 0;
    if (key === "gallery") return model.gallery.slides.length > 0;
    if (key === "testimonials") return model.content.testimonials.items.length > 0;
    if (key === "hours") return model.hours.length > 0;
    if (key === "location") return Boolean(model.locationLine || model.branchLines?.length || model.content.place?.label.trim() || model.content.place?.pins.some((pin) => pin.label.trim()));
    if (key === "video") return Boolean(model.content.video?.url);
    if (key === "products") return products.length > 0;
    return true;
  };
  const show = (key: WebsiteVisitorModel["content"]["order"][number]) =>
    model.sections[key] && (mode === "preview" || filled(key));

  const bookLabel = model.content.booking.cta || t("websiteBuilder.visitor.book");
  const headerStyle = model.content.appearance.headerStyle;
  const headerInk = headerStyle === "classic" || headerStyle === "transparent" || headerStyle === "overlay";
  const iconShape = model.content.appearance.iconShape;
  const iconFill = model.content.appearance.iconFill;
  const bookingOn = Boolean(model.sections.booking) && model.content.header.showBooking !== false;
  const bookControl = bookingOn
    ? booking ?? (
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-2 px-4 py-2 text-sm font-medium ${headerStyle === "minimal" ? "rounded-md bg-transparent px-2 text-foreground underline-offset-4 hover:underline" : "rounded-full"} ${headerStyle === "classic" ? "bg-white text-slate-900" : headerStyle === "transparent" || headerStyle === "overlay" ? "border border-white/80 bg-white/15 text-white" : headerStyle === "minimal" ? "" : "bg-primary text-primary-foreground"}`}
          style={headerStyle !== "classic" && headerStyle !== "transparent" && headerStyle !== "overlay" && headerStyle !== "minimal" && accent ? { background: accent } : undefined}
          onClick={(event) => { event.stopPropagation(); onBook?.(null); }}
        >
          <Calendar className="size-4" aria-hidden />
          {bookLabel}
        </button>
      )
    : null;
  const social = model.content.social;
  const socialLinks = model.content.channels.flatMap((channel) => {
    const href = websiteChannelHref(channel) ?? "";
    if (!href && mode !== "preview") return [];
    return [{ id: channel.id, href }];
  });
  const showSocial = (place: typeof social.placement) => social.placement === place && socialLinks.length > 0;
  const frames = model.content.frames ?? {
    hero: "classic" as const,
    services: "four" as const,
    gallery: "reel" as const,
    about: "text-image" as const,
    contact: "details" as const,
    booking: "cta" as const,
    reviews: "cards" as const,
    hours: "list" as const,
  };
  const heroFrame = frames.hero === "classic" ? "image-right" : frames.hero;
  const overlayHero = heroFrame === "overlay";
  const bannerHero = heroFrame === "full";
  const stackedHero = heroFrame === "centered";
  const flushHero = heroFrame === "split";
  const rtl = i18n.dir() === "rtl";
  const imageOnRight = heroFrame !== "image-left";
  const imageOrder = imageOnRight === rtl ? "@md:order-1" : "@md:order-2";
  const textOrder = imageOnRight === rtl ? "@md:order-2" : "@md:order-1";
  const centered = headerStyle === "center" || model.content.hero.align === "center";
  const emphasis = model.content.hero.emphasis === "italic" ? "italic" : model.content.hero.emphasis === "bold" ? "font-bold not-italic" : "";
  const chosen = (id: string) => (editor?.selected === id ? "rounded-xl outline outline-2 outline-offset-4 outline-primary" : "");
  const float = (id: string) => editor?.selected === id && editor.renderToolbar ? (
    <div className="sticky top-2 z-30 mb-2 flex w-fit max-w-full" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
      {editor.renderToolbar(id)}
    </div>
  ) : null;
  const select = (id: string) => (event: { stopPropagation: () => void }) => {
    if (!editor) return;
    event.stopPropagation();
    editor.onSelect(id);
  };
  const nudge = (kind: "hero" | "feature" | "service" | "slide" | "channel", token: string, direction: -1 | 1) => {
    if (kind === "hero") {
      const stack = heroStack;
      const target = stack[stack.indexOf(token as WebsiteHeroSlot) + direction];
      if (target) editor?.onMoveHero?.(token as WebsiteHeroSlot, target);
      return;
    }
    if (kind === "feature") {
      const index = Number(token);
      editor?.onMoveFeature?.(index, index + direction);
      return;
    }
    if (kind === "service") {
      const ids = services.map((service) => service.id);
      const target = ids[ids.indexOf(token) + direction];
      if (target) editor?.onMoveService?.(token, target);
      return;
    }
    if (kind === "slide") {
      const ids = model.gallery.slides.map((slide) => slide.id);
      const target = ids[ids.indexOf(token) + direction];
      if (target) editor?.onMoveSlide?.(token, target);
      return;
    }
    const ids = socialLinks.map((link) => link.id);
    const index = ids.findIndex((id) => id === token);
    const current = index >= 0 ? ids[index] : undefined;
    const target = index >= 0 ? ids[index + direction] : undefined;
    if (current && target) editor?.onMoveChannel?.(current, target);
  };
  const slotMove = (kind: "hero" | "feature" | "service" | "slide" | "channel") => {
    if (!editor || editor.locked) return undefined;
    if (kind === "hero" && editor.onMoveHero) return (from: string, to: string) => editor.onMoveHero?.(from as WebsiteHeroSlot, to as WebsiteHeroSlot);
    if (kind === "feature" && editor.onMoveFeature) return (from: string, to: string) => editor.onMoveFeature?.(Number(from), Number(to));
    if (kind === "service") return editor.onMoveService;
    if (kind === "slide") return editor.onMoveSlide;
    if (kind === "channel") return editor.onMoveChannel;
    return undefined;
  };
  const moveProps = (kind: "hero" | "feature" | "service" | "slide" | "channel", mime: string, token: string, label: string) => ({
    mime,
    token,
    label,
    locked: editor?.locked,
    hint: dropHint,
    onHint: setDropHint,
    onMove: slotMove(kind),
    onNudge: (value: string, direction: -1 | 1) => nudge(kind, value, direction),
    showHandle: kind === "hero"
      ? editor?.selected === "hero" || editor?.selected?.startsWith("hero-")
      : editor?.selected === (kind === "service" ? `service:${token}` : kind === "slide" ? `slide:${token}` : kind === "feature" ? `feature:${token}` : "social"),
  });
  const heroStack = model.content.hero.stack?.length ? model.content.hero.stack : (["title", "text", "buttons"] as const);
  const heroHidden = new Set(model.content.hero.hidden ?? []);
  const heroPieces = (variant: "overlay" | "plain") => heroStack.map((slot) => {
    if (heroHidden.has(slot)) return null;
    if (slot === "text" && !model.description.trim() && mode !== "preview") return null;
    if (slot === "buttons") {
      const visible = [
        { text: model.content.hero.primaryCta, action: model.content.hero.primaryAction },
        { text: model.content.hero.secondaryCta, action: model.content.hero.secondaryAction },
      ].some((item) => item.text && item.action !== "none" && (item.action !== "booking" || bookingOn));
      if (!visible && !editor) return null;
    }
    if (slot === "title") {
      return (
        <MoveSlot key={slot} tag="div" {...moveProps("hero", "application/x-website-hero", slot, t("websiteBuilder.builder.visual.slot.title"))}>
          {float("hero-title")}
          <h1
            className={`${variant === "overlay" ? "max-w-3xl" : centered ? "mx-auto" : "max-w-xl"} ${variant === "overlay" && !headingColor ? "text-white" : ""} font-semibold tracking-tight ${titleClass} ${emphasis} ${chosen("hero-title")}`}
            style={headingColor ? { color: headingColor } : undefined}
            onClick={select("hero-title")}
          >{title}</h1>
        </MoveSlot>
      );
    }
    if (slot === "text") {
      return (
        <MoveSlot key={slot} tag="div" {...moveProps("hero", "application/x-website-hero", slot, t("websiteBuilder.builder.visual.slot.text"))}>
          {float("hero-text")}
          <p
            className={`mt-4 leading-7 ${variant === "overlay" ? "max-w-xl" : centered ? "mx-auto max-w-lg" : "max-w-lg"} ${variant === "overlay" && !textColor ? "text-white/85" : "text-muted-foreground"} ${chosen("hero-text")}`}
            style={textColor ? { color: textColor } : undefined}
            onClick={select("hero-text")}
          >{model.description.trim() || (mode === "preview" ? t("websiteBuilder.builder.emptyAbout") : "")}</p>
        </MoveSlot>
      );
    }
    return (
      <MoveSlot key={slot} tag="div" {...moveProps("hero", "application/x-website-hero", slot, t("websiteBuilder.builder.visual.slot.buttons"))}>
        {float("hero-buttons")}
        <div onClick={select("hero-buttons")} className={chosen("hero-buttons")}>
          <HeroCtas model={model} accent={accent} secondary={secondary} radius={radius} centered={centered && variant === "plain"} bookingOn={bookingOn} onBook={onBook} />
        </div>
      </MoveSlot>
    );
  });
  const channelReorder = editor?.onMoveChannel
    ? { hint: dropHint, onHint: setDropHint, onMove: editor.onMoveChannel, onNudge: (token: string, direction: -1 | 1) => nudge("channel", token, direction), label: t("websiteBuilder.builder.dragSection"), locked: editor.locked }
    : undefined;

  return (
    <div className="@container relative min-h-full bg-background text-foreground" style={pageStyle}>
      <header
        className={`${overlayHero || headerStyle === "transparent" || headerStyle === "overlay" ? "absolute inset-x-0 top-0 z-20" : headerStyle === "classic" ? "sticky top-0 z-20 bg-primary text-white" : headerStyle === "minimal" || headerStyle === "modern" || headerStyle === "pill" ? "sticky top-0 z-20" : "sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur"} ${chosen("header")}`}
        style={headerStyle === "classic" && accent ? { background: accent } : undefined}
        onClick={select("header")}
      >
        <div className={headerStyle === "pill" ? "mx-auto mt-3 mb-1 flex min-h-12 max-w-3xl flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 text-foreground shadow-lg backdrop-blur" : headerStyle === "modern" ? "mx-auto mt-3 mb-1 flex min-h-14 max-w-6xl flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 text-foreground shadow-md backdrop-blur" : headerStyle === "center" ? "mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-3" : headerStyle === "overlay" ? "mx-auto mt-3 flex min-h-14 max-w-6xl flex-wrap items-center gap-3 rounded-2xl bg-slate-950/55 px-4 py-2 text-white shadow-lg backdrop-blur" : headerStyle === "transparent" ? "mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-white @md:px-6" : headerStyle === "minimal" ? "mx-auto flex min-h-12 max-w-6xl flex-wrap items-center gap-4 px-4 py-2 @md:px-6" : "mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-4 py-2 @md:px-6"}>
          <div className="flex min-w-0 items-center gap-2" data-fixed={editor ? "true" : undefined} title={editor ? t("websiteBuilder.builder.visual.fixed") : undefined}>
            {editor ? <FixedChip label={t("websiteBuilder.builder.visual.fixed")} /> : null}
            {model.logoUrl ? (
              <img src={model.logoUrl} alt="" className={`size-9 object-cover ${iconShape === "square" ? "rounded-lg" : "rounded-full"} ${iconFill === "outline" ? "bg-transparent ring-2 ring-current" : ""}`} />
            ) : (
              <div className={`flex size-9 items-center justify-center text-sm font-semibold ${iconShape === "square" ? "rounded-lg" : "rounded-full"} ${iconFill === "outline" ? "border bg-transparent" : "bg-primary text-primary-foreground"}`} style={iconFill === "outline" ? { color: accent, borderColor: accent } : accent ? { background: accent } : undefined}>
                {initial}
              </div>
            )}
            <span className="truncate text-sm font-semibold">{model.companyName}</span>
          </div>
          <nav className={headerStyle === "center" ? "flex flex-wrap items-center justify-center gap-1" : "flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1"}>
            <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-medium ${headerInk ? "text-white" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              {t("websiteBuilder.builder.homeTitle")}
            </button>
            {WEBSITE_HEADER_NAV.filter((key) => model.sections[key] && !(model.content.header.hiddenNav ?? []).includes(key)).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm ${headerInk ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => document.getElementById(`website-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {t(`websiteBuilder.section.${key}`)}
              </button>
            ))}
            {model.content.header.items.map((item) => (
              <HeaderItem key={item.id} item={item} bookingOn={bookingOn} onBook={onBook} />
            ))}
          </nav>
          {showSocial("header") ? <SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} onSelect={editor ? () => editor.onSelect("social") : undefined} reorder={channelReorder} /> : null}
          {bookControl}
        </div>
      </header>

      {overlayHero ? (
        <section className="relative min-h-[32rem] overflow-hidden border-b border-border/60">
          {heroPicture && !heroHidden.has("image") ? (
            <img src={heroPicture} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: heroImagePosition }} />
          ) : (
            <div className="absolute inset-0 bg-primary" style={accent ? { background: accent } : undefined} />
          )}
          <div className={`absolute inset-0 bg-gradient-to-t ${lightInk(headingColor) ? "from-black/70 via-black/25 to-black/10" : "from-white/85 via-white/40 to-transparent"}`} />
          <div className="relative mx-auto flex min-h-[32rem] max-w-6xl flex-col justify-end gap-4 px-4 pb-14 pt-28 @md:px-6">
            {editor ? <FixedChip label={t("websiteBuilder.builder.visual.fixedImage")} /> : null}
            {heroPieces("overlay")}
          </div>
        </section>
      ) : bannerHero ? (
        <section className="border-b border-border/60">
          {heroHidden.has("image") ? null : heroPicture ? (
            <img src={heroPicture} alt="" className="h-80 w-full object-cover @md:h-[28rem]" style={{ objectPosition: heroImagePosition }} />
          ) : (
            <div className="h-80 w-full bg-primary @md:h-[28rem]" style={accent ? { background: accent } : undefined} />
          )}
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 text-center @md:px-6" onClick={select("hero")}>
            {heroPieces("plain")}
          </div>
        </section>
      ) : (
        <section className="border-b border-border/60">
          <div className={`${heroHidden.has("image") || stackedHero ? "mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-14 text-center @md:px-6" : flushHero ? "grid items-stretch @md:grid-cols-2" : "mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 @md:grid-cols-2 @md:px-6 @md:py-14"}`}>
            {stackedHero && !heroHidden.has("image") ? (
              <HeroStill cover={cover} logoUrl={model.logoUrl} initial={initial} accent={accent} rounded chosen={chosen("hero-image")} editor={Boolean(editor)} fixedLabel={t("websiteBuilder.builder.visual.fixedImage")} onSelect={select("hero-image")} />
            ) : null}
            <div className={`flex flex-col gap-4 ${stackedHero || heroHidden.has("image") ? "" : textOrder} ${flushHero ? "justify-center px-6 py-12 @md:px-10" : ""}`} onClick={select("hero")}>
              {heroPieces("plain")}
            </div>
            {!stackedHero && !heroHidden.has("image") ? (
              <HeroStill cover={cover} logoUrl={model.logoUrl} initial={initial} accent={accent} rounded={!flushHero} bleed={flushHero} className={imageOrder} chosen={chosen("hero-image")} editor={Boolean(editor)} fixedLabel={t("websiteBuilder.builder.visual.fixedImage")} onSelect={select("hero-image")} />
            ) : null}
          </div>
        </section>
      )}
      {show("features") && model.content.features.items.length > 0 ? (
        <div className="mx-auto max-w-6xl px-4 py-8 @md:px-6">
          {editor ? <FixedChip label={t("websiteBuilder.builder.visual.fixedStrip")} /> : null}
          <ul className="grid gap-4 @md:grid-cols-3">
            {model.content.features.items.map((item, index) => {
              const Icon = [Shield, Users, Sparkles][index % 3]!;
              return (
                <MoveSlot key={`${item.title}-${index}`} tag="li" className="rounded-2xl bg-muted/40 px-4 py-5 text-center" {...moveProps("feature", "application/x-website-feature", String(index), t("websiteBuilder.builder.dragSection"))}>
                  <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full text-primary-foreground" style={{ background: accent ?? "var(--primary)" }}>
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="font-medium">{item.title}</div>
                  {item.text ? <p className="mt-1 text-sm text-muted-foreground">{item.text}</p> : null}
                </MoveSlot>
              );
            })}
          </ul>
        </div>
      ) : null}
      {showSocial("hero") ? (
        <div className="mx-auto flex max-w-6xl justify-center px-4 pb-2">
          <SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} onSelect={editor ? () => editor.onSelect("social") : undefined} />
        </div>
      ) : null}

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 @md:px-6 @md:py-10">
        {model.content.order.filter((key) => key !== "features").map((key) => show(key) ? (
          <section
            key={key}
            id={`website-${key}`}
            className={`${sectionFrame(model.content.layout.sizes[key], Boolean(headingColor))} ${chosen(`section:${key}`)} ${dropHint === `section:${key}` ? "rounded-xl outline outline-2 outline-primary" : ""}`}
            style={headingColor ? ({ "--website-heading": headingColor } as CSSProperties) : undefined}
            draggable={Boolean(onReorder) && !editor}
            onClick={select(`section:${key}`)}
            onDragStart={(event) => event.dataTransfer.setData("text/plain", key)}
            onDragOver={(event) => {
              if ([...event.dataTransfer.types].some((type) => INNER_DRAG.has(type))) return;
              if (!(onReorder || editor)) return;
              event.preventDefault();
              if (dropHint !== `section:${key}`) setDropHint(`section:${key}`);
            }}
            onDragLeave={() => setDropHint((current) => current === `section:${key}` ? null : current)}
            onDrop={(event) => {
              if ([...event.dataTransfer.types].some((type) => INNER_DRAG.has(type))) return;
              setDropHint(null);
              const block = event.dataTransfer.getData("application/x-website-block");
              if (block && editor?.onDropBlock) {
                event.preventDefault();
                editor.onDropBlock(block, key);
                return;
              }
              const from = event.dataTransfer.getData("text/plain");
              if (!onReorder || !model.content.order.includes(from as WebsiteBodySectionKey)) return;
              event.preventDefault();
              onReorder(from as WebsiteBodySectionKey, key);
            }}
          >
            {float(`section:${key}`)}
            {dropHint === `section:${key}` ? <span data-drop-indicator="true" className="mb-2 block h-1 rounded-full bg-primary" /> : null}
            {editor && onReorder && editor.selected === `section:${key}` ? (
              <button
                type="button"
                draggable={!editor.locked}
                className="mb-2 cursor-grab rounded-md border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                aria-label={t("websiteBuilder.builder.dragSection")}
                onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/plain", key); event.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => setDropHint(null)}
                onClick={select(`section:${key}`)}
                onKeyDown={(event) => {
                  const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
                  if (!direction || editor.locked) return;
                  event.preventDefault();
                  const keys = model.content.order.filter((item) => item !== "features");
                  const target = keys[keys.indexOf(key) + direction];
                  if (target) onReorder(key, target);
                }}
              >
                {t("websiteBuilder.builder.dragSection")}
              </button>
            ) : null}
            {key === "gallery" ? (
              <div>
                {editor?.onMoveSlide && model.gallery.slides.length > 0 ? (
                  <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {model.gallery.slides.map((slide) => (
                      <MoveSlot key={slide.id} tag="li" className="w-28 shrink-0" {...moveProps("slide", "application/x-website-slide", slide.id, t("websiteBuilder.builder.dragSection"))}>
                        <img src={slide.url} alt={slide.alt || ""} className="aspect-[4/3] w-full rounded-lg object-cover" />
                        {slide.alt ? <span className="mt-1 block truncate text-[10px] text-muted-foreground">{slide.alt}</span> : null}
                      </MoveSlot>
                    ))}
                  </ul>
                ) : null}
                {frames.gallery === "grid" || frames.gallery === "masonry" || frames.gallery === "featured" ? (
                  <ul className={frames.gallery === "masonry" ? "columns-1 gap-3 @md:columns-2 @3xl:columns-3" : frames.gallery === "featured" ? "grid gap-3 @3xl:grid-cols-3" : "grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3"}>
                    {model.gallery.slides.map((slide, index) => (
                      <li key={slide.id} className={frames.gallery === "featured" && index === 0 ? "@md:col-span-2" : frames.gallery === "masonry" ? "mb-3 break-inside-avoid" : ""}>
                        <img src={slide.url} alt={slide.alt || ""} className="w-full rounded-xl object-cover" style={{ objectPosition: model.gallery.position ?? "center" }} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <WebsiteGalleryReel gallery={model.gallery} placeholder={mode === "preview"} />
                )}
              </div>
            ) : null}
            {key === "products" ? (
              <div onClick={select("section:products")}>
                <WebsiteProductShowcase
                  products={products}
                  frame={model.content.frames?.products ?? "shelf"}
                  showPrice={model.content.products?.showPrice !== false}
                  accent={accent}
                  language={i18n.language}
                  title={t("websiteBuilder.section.products")}
                  empty={t("websiteBuilder.builder.emptyProducts")}
                  selectedId={editor?.selected?.startsWith("product:") ? editor.selected.slice("product:".length) : null}
                  onSelect={editor ? (id) => editor.onSelect(`product:${id}`) : undefined}
                />
              </div>
            ) : null}
            {key === "services" ? (
              <div className="text-center">
                <h2 className="text-2xl font-semibold">{t("websiteBuilder.section.services")}</h2>
                {showSocial("services") ? <div className="mt-4 flex justify-center"><SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} /></div> : null}
                {services.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("websiteBuilder.visitor.noServices")}</p>
                ) : (
                  <ul className={`mt-6 grid gap-4 text-start ${frames.services === "two" || frames.services === "cards" ? "@md:grid-cols-2" : frames.services === "three" || frames.services === "images" ? "@md:grid-cols-2 @3xl:grid-cols-3" : frames.services === "minimal" ? "max-w-xl" : "@md:grid-cols-2 @4xl:grid-cols-4"}`}>
                    {services.map((service) => {
                      const image = websiteServiceImage(model.content, service.id);
                      const price = service.priceCents > 0 ? `${(service.priceCents / 100).toFixed(0)} ${service.currency}` : null;
                      return (
                        <MoveSlot key={service.id} tag="li" className={`overflow-hidden rounded-2xl border border-border bg-card text-center ${chosen(`service:${service.id}`)}`} {...moveProps("service", "application/x-website-service", service.id, t("websiteBuilder.builder.dragSection"))}>
                          <div style={{ borderRadius: radius }} onClick={select(`service:${service.id}`)}>
                            {frames.services !== "minimal" && image ? (
                              <img src={image} alt="" className="aspect-[4/3] w-full object-cover" />
                            ) : frames.services === "minimal" ? null : (
                              <div className="aspect-[4/3] w-full bg-muted" style={accent ? { background: `linear-gradient(160deg, ${accent}, ${accent}55)` } : undefined} />
                            )}
                            <div className="space-y-2 p-4">
                              <div className="font-medium">{service.name}</div>
                              {service.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{service.description}</p> : null}
                              {price ? <p className="text-sm font-semibold" style={{ color: accent }}>{price}</p> : null}
                              {bookingOn ? (
                                <Button type="button" size="sm" variant="outline" className="w-full" onClick={(event) => { event.stopPropagation(); onBook?.(service.id); }} style={accent ? { borderColor: accent, color: accent } : undefined}>
                                  {bookLabel}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </MoveSlot>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {key === "about" ? (
              <div className={frames.about === "centered" ? "mx-auto max-w-2xl text-center" : frames.about === "columns" ? "grid gap-6 @md:grid-cols-2" : `grid items-center gap-6 @md:grid-cols-[minmax(0,1fr)_16rem] ${frames.about === "image-text" ? "@md:[&>*:last-child]:order-first" : ""}`}>
                <div>
                  <h2 className="text-xl font-semibold">{model.content.about.heading || t("websiteBuilder.section.about")}</h2>
                  {model.description.trim() ? <p className="mt-3 text-sm leading-7 text-muted-foreground">{model.description}</p> : mode === "preview" ? <p className="mt-3 text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyAbout")}</p> : null}
                  {model.content.about.bullets.length ? (
                    <ul className="mt-4 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                      {model.content.about.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  ) : null}
                </div>
                {model.content.about.imageUrl ? <img src={model.content.about.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover" /> : null}
              </div>
            ) : null}
            {key === "testimonials" ? (
              <>
                <h2 className="text-xl font-semibold">{t("websiteBuilder.section.testimonials")}</h2>
                {model.content.testimonials.items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyTestimonials")}</p> : (
                  <ul className={frames.reviews === "carousel" ? "mt-4 flex gap-3 overflow-x-auto pb-2" : frames.reviews === "rating" ? "mx-auto mt-4 max-w-xl space-y-4 text-center" : "mt-4 grid gap-3 @md:grid-cols-2"}>
                    {model.content.testimonials.items.map((item) => (
                      <li key={item.quote} className="rounded-2xl border border-border bg-card p-5">
                        <p className="text-sm leading-6">“{item.quote}”</p>
                        {item.name ? <p className="mt-3 text-sm text-muted-foreground">{item.name}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
            {key === "hours" ? (
              <>
                <h2 className="text-xl font-semibold">{t("websiteBuilder.section.hours")}</h2>
                {editor ? <FixedChip label={t("websiteBuilder.builder.visual.fixedHours")} /> : null}
                {showSocial("hours") ? <div className="mt-3"><SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} /></div> : null}
                <HoursBoard hours={model.hours} frame={frames.hours} empty={t("websiteBuilder.builder.emptyHours")} label={(day) => t(`websiteBuilder.builder.days.${day}`, { defaultValue: day })} />
              </>
            ) : null}
            {key === "location" ? (
              <LocationCard
                systemLine={model.locationLine}
                branchLines={model.branchLines}
                place={model.content.place}
                empty={t("websiteBuilder.builder.emptyLocation")}
                title={t("websiteBuilder.section.location")}
                fixed={editor ? t("websiteBuilder.builder.visual.fixedLocation") : null}
                addLabel={editor?.onAddPlace ? t("websiteBuilder.builder.addPlace") : null}
                canAdd={Boolean(editor?.onAddPlace) && !editor?.locked && (model.content.place?.pins.length ?? 0) < 6}
                onAdd={editor?.onAddPlace}
              />
            ) : null}
            {key === "contact" ? (
              <div className="max-w-lg rounded-2xl border border-border bg-card p-6">
                <h2 className="text-xl font-semibold">{model.content.contact.heading || t("websiteBuilder.section.contact")}</h2>
                {model.content.contact.description ? <p className="mt-2 text-sm text-muted-foreground">{model.content.contact.description}</p> : null}
                <div className="mt-4" data-fixed={editor ? "true" : undefined}>
                  {editor ? <FixedChip label={t("websiteBuilder.builder.visual.fixedForm")} /> : null}
                  {contact ?? (
                  <div className="space-y-3">
                    <Label>{t("websiteBuilder.visitor.name")}</Label>
                    <Input disabled />
                    <Label>{t("websiteBuilder.visitor.email")}</Label>
                    <Input type="email" disabled />
                    <Label>{t("websiteBuilder.visitor.phone")}</Label>
                    <Input disabled />
                    <Label>{t("websiteBuilder.visitor.message")}</Label>
                    <Textarea disabled />
                    <Button type="button" disabled>{t("websiteBuilder.visitor.sendContact")}</Button>
                  </div>
                )}</div>
              </div>
            ) : null}
            {key === "video" ? (
              <div>
                <h2 className="text-xl font-semibold">{t("websiteBuilder.section.video")}</h2>
                {model.content.video?.url ? (
                  <WebsiteVideoPlayer video={model.content.video} />
                ) : mode === "preview" ? <p className="mt-3 text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyVideo")}</p> : null}
                {model.content.video?.caption ? <p className="mt-2 text-sm text-muted-foreground">{model.content.video.caption}</p> : null}
              </div>
            ) : null}
            {key === "booking" ? (
              <div className={`rounded-2xl border border-border bg-card p-6 ${frames.booking === "compact" ? "max-w-md" : ""}`}>
                <h2 className="text-xl font-semibold">{model.content.booking.heading || t("websiteBuilder.section.booking")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("websiteBuilder.builder.sectionBody.booking")}</p>
                {frames.booking === "cards" || frames.booking === "inline" || frames.booking === "full" ? (
                  <ul className="mt-4 grid gap-2 @md:grid-cols-2">
                    {services.map((service) => (
                      <li key={service.id}>
                        <button type="button" className="w-full rounded-xl border px-3 py-3 text-start text-sm" onClick={(event) => { event.stopPropagation(); onBook?.(service.id); }}>
                          {service.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4">{bookControl}</div>
              </div>
            ) : null}
          </section>
        ) : null)}
        {showSocial("contact") ? (
          <div className="flex justify-center">
            <SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} onSelect={editor ? () => editor.onSelect("social") : undefined} />
          </div>
        ) : null}
      </main>
      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 @md:px-6">
          <p className="text-sm font-medium">{model.companyName}</p>
          {showSocial("footer") ? <SocialRow links={socialLinks} shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} onSelect={editor ? () => editor.onSelect("social") : undefined} /> : null}
        </div>
      </footer>
      {showSocial("floating") ? (
        <div className="sticky bottom-6 z-30 ms-4 w-fit">
          <SocialRow links={socialLinks} stacked shape={model.content.appearance.iconShape} fill={model.content.appearance.iconFill} reorder={channelReorder} onSelect={editor ? () => editor.onSelect("social") : undefined} />
        </div>
      ) : null}
      {mode === "preview" && model.sections.chat && model.content.chat.anchor === "flow" ? (
        <div className="mx-auto max-w-6xl px-4 pb-8">
          <PreviewChatCard greeting={model.greeting} side={model.content.chat.side} />
        </div>
      ) : null}
    </div>
  );
}

function HeaderItem({ item, bookingOn, onBook }: { item: WebsiteHeaderItem; bookingOn: boolean; onBook?: (serviceId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  if (item.action === "booking" && !bookingOn) return null;
  const scroll = () => {
    if (item.action === "booking") {
      onBook?.(null);
      setOpen(false);
      return;
    }
    if (item.action === "url" || item.action === "none") return;
    document.getElementById(`website-${item.action}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };
  return (
    <div className="relative" onMouseEnter={() => { if (item.detail) setOpen(true); }} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (!item.detail) {
            scroll();
            return;
          }
          setOpen(true);
        }}
      >
        {item.label}
      </button>
      {open && item.detail ? (
        <div className="absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-border bg-card p-4 text-start shadow-xl">
          <p className="text-sm leading-6 text-foreground">{item.detail}</p>
          {item.action !== "url" && item.action !== "none" ? (
            <button type="button" className="mt-3 text-xs font-medium text-primary" onClick={scroll}>{item.label}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function locationLabels(systemLine: string | null, branchLines: string[] | undefined, place?: WebsiteContent["place"]): string[] {
  const extras = (place?.pins ?? []).map((pin) => pin.label.trim()).filter(Boolean);
  const unique = (lines: string[]) => [...new Set(lines)];
  if (place?.source === "custom") {
    const custom = place.label.trim();
    return unique([...(custom ? [custom] : []), ...extras]);
  }
  const system = (branchLines ?? []).map((line) => line.trim()).filter(Boolean);
  const base = system.length ? system : systemLine ? [systemLine] : [];
  return unique([...base, ...extras]);
}

function LocationCard({
  systemLine,
  branchLines,
  place,
  empty,
  title,
  fixed,
  addLabel,
  canAdd,
  onAdd,
}: {
  systemLine: string | null;
  branchLines?: string[];
  place?: WebsiteContent["place"];
  empty: string;
  title: string;
  fixed: string | null;
  addLabel: string | null;
  canAdd: boolean;
  onAdd?: () => void;
}) {
  const labels = locationLabels(systemLine, branchLines, place);
  return (
    <>
      <h2 className="text-xl font-semibold">{title}</h2>
      {fixed ? <FixedChip label={fixed} /> : null}
      {labels.length ? (
        <ul className="mt-3 space-y-2">
          {labels.map((label) => (
            <li key={label}>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{empty}</span>
        </p>
      )}
      {canAdd && addLabel && onAdd ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 rounded-full border border-primary px-3 py-1 text-sm font-medium text-primary"
          onClick={(event) => { event.stopPropagation(); onAdd(); }}
        >
          <Plus className="size-4" aria-hidden />
          {addLabel}
        </button>
      ) : null}
    </>
  );
}

export function WebsiteVideoPlayer({ video }: { video: WebsiteContent["video"] }) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(Boolean(video.autoplay));
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.muted = video.muted || video.autoplay;
    node.loop = video.loop;
    if (video.autoplay) {
      void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [video.autoplay, video.loop, video.muted, video.url]);
  const toggle = () => {
    const node = ref.current;
    if (!node) return;
    if (node.paused) {
      void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }
    node.pause();
    setPlaying(false);
  };
  return (
    <div className="mt-4 space-y-2" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <video
        ref={ref}
        className="w-full rounded-2xl bg-black"
        src={video.url ?? undefined}
        poster={video.poster ?? undefined}
        controls={video.controls}
        autoPlay={video.autoplay}
        loop={video.loop}
        muted={video.muted || video.autoplay}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={(event) => event.stopPropagation()}
      />
      <Button type="button" size="sm" variant="outline" onClick={toggle}>
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {playing ? t("websiteBuilder.builder.frame.pause") : t("websiteBuilder.builder.frame.play")}
      </Button>
    </div>
  );
}

function HoursBoard({ hours, frame, empty, label }: { hours: WebsitePreviewHour[]; frame: WebsiteContent["frames"]["hours"]; empty: string; label: (day: string) => string }) {
  if (hours.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  if (frame === "cards") {
    return (
      <ul className="mt-4 grid gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
        {hours.map((row) => (
          <li key={row.key} className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-sm font-medium">{label(row.key)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.open} – {row.close}</p>
          </li>
        ))}
      </ul>
    );
  }
  if (frame === "pills") {
    return (
      <ul className="mt-4 flex flex-wrap gap-2">
        {hours.map((row) => (
          <li key={row.key} className="rounded-full border bg-card px-3 py-1.5 text-sm">
            <span className="font-medium">{label(row.key)}</span>
            <span className="ms-2 text-muted-foreground">{row.open}–{row.close}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (frame === "columns") {
    return (
      <ul className="mt-4 grid gap-2 @md:grid-cols-2">
        {hours.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
            <span>{label(row.key)}</span>
            <span className="text-muted-foreground">{row.open} – {row.close}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="mt-3 max-w-md space-y-2">
      {hours.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-4 text-sm">
          <span>{label(row.key)}</span>
          <span className="text-muted-foreground">{row.open} – {row.close}</span>
        </li>
      ))}
    </ul>
  );
}

function PreviewChatCard({ greeting, side }: { greeting?: string; side: "start" | "end" }) {
  const { t } = useTranslation("common");
  return (
    <section className={`w-[min(100%,22rem)] overflow-hidden rounded-3xl border bg-card shadow-xl ${side === "start" ? "" : "ms-auto"}`}>
      <header className="bg-primary px-4 py-3 text-primary-foreground">
        <p className="text-sm font-semibold">{t("websiteBuilder.visitor.chatTitle")}</p>
      </header>
      <p className="px-4 py-4 text-sm leading-6 text-muted-foreground">{greeting || t("websiteBuilder.visitor.assistant")}</p>
    </section>
  );
}

function SocialRow({
  links,
  stacked = false,
  shape = "round",
  fill = "filled",
  onSelect,
  reorder,
}: {
  links: { id: string; href: string }[];
  stacked?: boolean;
  shape?: "round" | "square";
  fill?: "filled" | "outline";
  onSelect?: () => void;
  reorder?: {
    locked?: boolean;
    hint: string | null;
    onHint: (value: string | null) => void;
    onMove?: (from: string, to: string) => void;
    onNudge?: (token: string, direction: -1 | 1) => void;
    label: string;
  };
}) {
  const radius = shape === "square" ? 8 : 14;
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"} onClick={(event) => { event.stopPropagation(); onSelect?.(); }}>
      {links.map((link) => {
        const mark = <BrandIcon name={link.id} radius={fill === "outline" ? 14 : radius} className={`size-11 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${fill === "outline" ? "opacity-90" : ""}`} />;
        const icon = link.href ? (
          <a href={link.href} target={link.href.startsWith("tel:") || link.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" aria-label={link.id} className="inline-flex" onClick={(event) => event.stopPropagation()}>
            {mark}
          </a>
        ) : (
          <span aria-label={link.id} className="inline-flex">
            {mark}
          </span>
        );
        if (!reorder?.onMove) return <span key={link.id}>{icon}</span>;
        return (
          <MoveSlot key={link.id} tag="div" {...reorder} mime="application/x-website-channel" token={link.id}>
            {icon}
          </MoveSlot>
        );
      })}
    </div>
  );
}

function HeroStill({
  cover,
  logoUrl,
  initial,
  accent,
  rounded = true,
  bleed = false,
  className,
  chosen,
  editor,
  fixedLabel,
  onSelect,
}: {
  cover: string | null | undefined;
  logoUrl: string | null;
  initial: string;
  accent?: string;
  rounded?: boolean;
  bleed?: boolean;
  className?: string;
  chosen: string;
  editor: boolean;
  fixedLabel: string;
  onSelect: (event: { stopPropagation: () => void }) => void;
}) {
  const frame = bleed ? "h-full min-h-80 w-full object-cover" : `aspect-[5/4] w-full object-cover ${rounded ? "rounded-3xl" : ""}`;
  return (
    <div className={className} data-fixed={editor ? "true" : undefined} title={editor ? fixedLabel : undefined} onClick={onSelect}>
      {editor ? <FixedChip label={fixedLabel} /> : null}
      {cover ? (
        <img src={cover} alt="" className={`${frame} ${chosen}`} />
      ) : logoUrl ? (
        <img src={logoUrl} alt="" className={`mx-auto aspect-square w-full max-w-sm object-cover ${rounded ? "rounded-3xl" : ""}`} />
      ) : (
        <div className={`flex items-center justify-center bg-primary text-6xl font-semibold text-primary-foreground ${bleed ? "h-full min-h-80" : "aspect-[5/4]"} ${rounded ? "rounded-3xl" : ""}`} style={accent ? { background: accent } : undefined}>
          {initial}
        </div>
      )}
    </div>
  );
}

function FixedChip({ label }: { label: string }) {
  return <span data-fixed="true" className="mb-1 inline-flex rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>;
}

function MoveSlot({
  tag,
  mime,
  token,
  label,
  locked,
  hint,
  onHint,
  onMove,
  onNudge,
  showHandle = true,
  className,
  children,
}: {
  tag: "div" | "li";
  mime: string;
  token: string;
  label: string;
  locked?: boolean;
  hint: string | null;
  onHint: (value: string | null) => void;
  onMove?: (from: string, to: string) => void;
  onNudge?: (token: string, direction: -1 | 1) => void;
  showHandle?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const mark = `${mime}:${token}`;
  const enabled = Boolean(onMove) && !locked;
  const Tag = tag;
  const startDrag = (event: DragEvent) => {
    event.stopPropagation();
    event.dataTransfer.setData(mime, token);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <Tag
      className={`relative ${enabled && showHandle ? "cursor-grab" : ""} ${className ?? ""} ${hint === mark ? "rounded-xl outline outline-2 outline-offset-2 outline-primary" : ""}`}
      draggable={enabled && showHandle}
      data-slot={mark}
      onDragStart={(event) => {
        if (!enabled || !showHandle) return;
        startDrag(event);
      }}
      onDragOver={(event) => {
        if (!enabled || ![...event.dataTransfer.types].includes(mime)) return;
        event.preventDefault();
        event.stopPropagation();
        if (hint !== mark) onHint(mark);
      }}
      onDrop={(event) => {
        if (!enabled) return;
        const from = event.dataTransfer.getData(mime);
        if (!from) return;
        event.preventDefault();
        event.stopPropagation();
        onHint(null);
        if (from !== token) onMove?.(from, token);
      }}
    >
      {hint === mark ? <span data-drop-indicator="true" className="pointer-events-none absolute -top-1 start-2 z-20 h-1 w-8 rounded-full bg-primary" /> : null}
      {enabled && showHandle ? (
        <button
          type="button"
          draggable
          aria-label={label}
          className="absolute -top-2 start-0 z-20 cursor-grab rounded border bg-card px-1 text-[10px] leading-4 text-muted-foreground"
          onMouseDown={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData(mime, token);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => onHint(null)}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
            if (!direction) return;
            event.preventDefault();
            onNudge?.(token, direction);
          }}
        >
          ⋮⋮
        </button>
      ) : null}
      {children}
    </Tag>
  );
}

