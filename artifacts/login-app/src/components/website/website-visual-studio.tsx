import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Clock, ImageIcon, Images, LayoutTemplate, Mail, MapPin, MessageSquare, MessagesSquare, PanelTop, Plus, ShoppingBag, Sparkles, Star, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BrandIcon } from "@/components/website/website-brand-icon";
import { WebsiteGalleryEditor } from "@/components/website/website-gallery-editor";
import { ImageField } from "@/components/website/website-studio-controls";
import { uploadCompanyBrandAsset } from "@/lib/company-workspace/services/company-brand-upload";
import { WebsiteBuilderPreview, type WebsiteBuilderPreviewModel } from "@/components/website/website-builder-preview";
import { WebsiteVideoPlayer } from "@/components/website/website-visitor-body";
import { ProductFramePicker } from "@/components/website/website-product-showcase";
import {
  WEBSITE_PALETTE_BLOCKS,
  WEBSITE_UNSUPPORTED_BLOCKS,
} from "@/lib/website/website-editor-state";
import {
  defaultWebsiteFrames,
  defaultWebsiteVideo,
  addWebsitePlacePin,
  applySectionFrame,
  applyWebsiteTemplate,
  WEBSITE_ABOUT_FRAMES,
  WEBSITE_BOOKING_FRAMES,
  WEBSITE_GALLERY_FRAMES,
  WEBSITE_REVIEW_FRAMES,
  WEBSITE_SERVICE_FRAMES,
  moveWebsiteSection,
  placeWebsiteBlock,
  reorderChannels,
  reorderGallerySlides,
  reorderHeroSlots,
  reorderIndexed,
  reorderWebsiteSections,
  reorderWebsiteServices,
  reorderWebsiteProducts,
  visibleWebsiteServices,
  visibleWebsiteProducts,
  WEBSITE_CHANNEL_IDS,
  WEBSITE_HEADER_NAV,
  WEBSITE_HEADER_STYLES,
  WEBSITE_HOURS_FRAMES,
  WEBSITE_SOCIAL_PLACEMENTS,
  WEBSITE_TEMPLATE_PRESETS,
  WEBSITE_TEMPLATES,
  type WebsiteBodySectionKey,
  type WebsiteChannelId,
  type WebsiteContent,
  type WebsitePreviewProduct,
  type WebsiteCtaAction,
  type WebsiteHeaderStyle,
  type WebsiteBodyScale,
  type WebsiteHeroFrame,
  type WebsiteImagePosition,
  type WebsiteTitleScale,
  type WebsiteHeroPiece,
  type WebsiteTemplate,
  type WebsiteVideo,
} from "@/lib/website/website-model";
import { useActiveAutomationFlows } from "@/hooks/channels/use-channel-workflow-binding";
import type { WebsiteStudioSnapshot } from "@/lib/website/website-studio";

type ServiceRow = { id: string; name: string; priceCents?: number; currency?: string };

const fieldSelectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50";

function withBooking(draft: WebsiteStudioSnapshot, enabled: boolean): WebsiteStudioSnapshot {
  return {
    ...draft,
    sections: { ...draft.sections, booking: enabled },
    content: {
      ...draft.content,
      header: { ...draft.content.header, showBooking: enabled },
    },
  };
}

function setSectionVisible(draft: WebsiteStudioSnapshot, key: WebsiteBodySectionKey | "chat", visible: boolean): WebsiteStudioSnapshot {
  if (key === "chat") return { ...draft, sections: { ...draft.sections, chat: visible } };
  if (!visible) {
    const next: WebsiteStudioSnapshot = {
      ...draft,
      sections: { ...draft.sections, [key]: false },
      content: { ...draft.content, order: draft.content.order.filter((item) => item !== key) },
    };
    return key === "booking" ? withBooking(next, false) : next;
  }
  const placed = placeWebsiteBlock(draft.content.order, draft.sections, key, null);
  if (!placed) return draft;
  const next: WebsiteStudioSnapshot = {
    ...draft,
    sections: placed.sections,
    content: { ...draft.content, order: placed.order },
  };
  return key === "booking" ? withBooking(next, true) : next;
}

export function WebsiteVisualStudio({
  companyId,
  draft,
  locked,
  preview,
  services,
  hours,
  selection,
  viewport,
  onSelect,
  onChange,
  onBook,
}: {
  companyId: string;
  draft: WebsiteStudioSnapshot;
  locked: boolean;
  preview: WebsiteBuilderPreviewModel;
  services: ServiceRow[];
  hours: { key: string; open: string; close: string }[];
  selection: string | null;
  viewport: "desktop" | "tablet" | "mobile";
  onSelect: (id: string | null) => void;
  onChange: (next: WebsiteStudioSnapshot) => void;
  onBook: (serviceId: string) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [tab, setTab] = useState<"elements" | "templates" | "selected">("elements");
  const content = draft.content;

  const patchContent = (partial: Partial<WebsiteContent>) => {
    onChange({ ...draft, content: { ...content, ...partial } });
  };
  const choose = (id: string) => {
    setTab("selected");
    onSelect(id);
  };

  const dropBlock = (block: string, before: WebsiteBodySectionKey) => {
    if (block === "hero-title" || block === "hero-text" || block === "hero-image") {
      choose(block);
      return;
    }
    if (block === "social") {
      choose("social");
      return;
    }
    const placed = placeWebsiteBlock(content.order, draft.sections, block, before);
    if (!placed) return;
    const next = { ...draft, sections: placed.sections, content: { ...content, order: placed.order } };
    onChange(block === "booking" ? withBooking(next, true) : next);
    choose(block === "chat" ? "chat" : `section:${placed.order.includes(before) ? block : block}`);
  };

  const openBlock = (block: string) => {
    if (block === "header" || block === "hero" || block === "hero-title" || block === "hero-text" || block === "hero-image" || block === "social") {
      choose(block === "hero-title" || block === "hero-text" || block === "hero-image" ? "hero" : block);
      return;
    }
    const placed = placeWebsiteBlock(content.order, draft.sections, block, null);
    if (placed) {
      const next = { ...draft, sections: placed.sections, content: { ...content, order: placed.order } };
      onChange(block === "booking" ? withBooking(next, true) : next);
    }
    choose(block === "chat" ? "chat" : `section:${block}`);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]" dir="ltr">
      <div className="flex min-h-0 flex-col overflow-hidden bg-muted/30" dir={i18n.dir()} onClick={() => { onSelect(null); setTab("elements"); }}>
        <div className="min-h-0 flex-1 overflow-hidden p-3">
        <WebsiteBuilderPreview
          model={preview}
          framed={false}
          viewport={viewport}
          onBook={onBook}
          onReorder={(from, to) => patchContent({ order: reorderWebsiteSections(content.order, from, to) })}
          editor={{
            selected: selection,
            locked,
            onSelect: choose,
            onCommitText: (field, value) => onChange({ ...draft, [field]: value }),
            onDropBlock: dropBlock,
            onMoveHero: (from, to) => patchContent({ hero: { ...content.hero, stack: reorderHeroSlots(content.hero.stack, from, to) } }),
            onMoveFeature: (from, to) => patchContent({ features: { items: reorderIndexed(content.features.items, from, to) } }),
            onMoveService: (fromId, toId) => patchContent({ services: reorderWebsiteServices(content, preview.services.map((service) => service.id), fromId, toId) }),
            onMoveSlide: (fromId, toId) => onChange({ ...draft, gallery: reorderGallerySlides(draft.gallery, fromId, toId) }),
            onMoveChannel: (fromId, toId) => {
              const channels = reorderChannels(content.channels, fromId as WebsiteChannelId, toId as WebsiteChannelId);
              const value = (id: WebsiteChannelId) => channels.find((channel) => channel.id === id)?.value ?? "";
              onChange({
                ...draft,
                content: { ...content, channels, social: { ...content.social, facebook: value("facebook"), instagram: value("instagram"), whatsapp: value("whatsapp") } },
              });
            },
            onAddPlace: () => {
              const place = content.place ?? { source: "branch" as const, label: "", pins: [] };
              choose("section:location");
              patchContent({ place: addWebsitePlacePin(place) });
            },
            renderToolbar: (id) => (
              <CanvasToolbar
                id={id}
                locked={locked}
                content={content}
                onPatch={patchContent}
                onMoveSection={(key, direction) => patchContent({ order: moveWebsiteSection(content.order, key, direction) })}
                onToggleSection={(key) => onChange(setSectionVisible(draft, key, !draft.sections[key]))}
              />
            ),
          }}
        />
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-s bg-background p-3" dir={i18n.dir()} onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex gap-1">
          <Button type="button" size="sm" variant={tab === "elements" ? "default" : "ghost"} onClick={() => setTab("elements")}>{t("websiteBuilder.builder.visual.blocks")}</Button>
          <Button type="button" size="sm" variant={tab === "selected" ? "default" : "ghost"} onClick={() => setTab("selected")}>{t("websiteBuilder.builder.visual.selected")}</Button>
          <Button type="button" size="sm" variant={tab === "templates" ? "default" : "ghost"} onClick={() => setTab("templates")}>{t("websiteBuilder.builder.visual.templates")}</Button>
        </div>
        {tab === "elements" ? (
          <ul className="space-y-1.5">
            {(["header", "hero"] as const).map((block) => (
              <li key={block}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-start hover:border-primary ${selection === block ? "border-primary bg-primary/5" : "bg-card"}`}
                  onClick={() => openBlock(block)}
                >
                  <PaletteMark block={block} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{block === "header" ? t("websiteBuilder.builder.visual.headerTitle") : t("websiteBuilder.builder.visual.heroTitle")}</span>
                    <span className="block text-[11px] text-muted-foreground">{t("websiteBuilder.builder.visual.shown")}</span>
                  </span>
                </button>
              </li>
            ))}
            {WEBSITE_PALETTE_BLOCKS.filter((block) => block !== "hero-title" && block !== "hero-text" && block !== "hero-image").map((block) => {
              const removable = block !== "social";
              const active = block === "chat" ? draft.sections.chat : removable ? draft.sections[block as WebsiteBodySectionKey] : true;
              return (
                <li key={block} className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 ${active ? "bg-card" : "border-dashed bg-muted/40"} ${selection === `section:${block}` || (block === "chat" && selection === "chat") || (block === "social" && selection === "social") ? "border-primary" : ""}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1 text-start" onClick={() => openBlock(block)}>
                    <PaletteMark block={block} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t(`websiteBuilder.builder.visual.block.${block}`)}</span>
                      <span className="block text-[11px] text-muted-foreground">{removable ? (active ? t("websiteBuilder.builder.visual.shown") : t("websiteBuilder.builder.visual.hidden")) : t("websiteBuilder.builder.visual.shown")}</span>
                    </span>
                  </button>
                  {removable ? (
                    <Button type="button" size="sm" variant={active ? "ghost" : "default"} disabled={locked} className="shrink-0" onClick={() => onChange(setSectionVisible(draft, block as WebsiteBodySectionKey | "chat", !active))}>
                      {active ? t("websiteBuilder.builder.visual.hide") : t("websiteBuilder.builder.visual.show")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {WEBSITE_UNSUPPORTED_BLOCKS.map((block) => (
              <li key={block}>
                <button type="button" disabled className="flex w-full items-center gap-2 rounded-xl border border-dashed px-2 py-2 text-start text-muted-foreground" title={t("websiteBuilder.builder.visual.unsupported")}>
                  <PaletteMark block={block} />
                  <span className="text-sm">{t(`websiteBuilder.builder.visual.block.${block}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "templates" ? (
          <div className="space-y-3">
            <TemplateCards current={content.appearance.template} locked={locked} onPick={(template) => onChange({ ...draft, content: applyWebsiteTemplate(content, template) })} />
            <HeaderTemplatePicker value={content.appearance.headerStyle} locked={locked} onChange={(headerStyle) => patchContent({ appearance: { ...content.appearance, headerStyle } })} />
            <ColorFields appearance={content.appearance} locked={locked} onChange={(appearance) => patchContent({ appearance })} />
            <IconStylePicker
              shape={content.appearance.iconShape}
              fill={content.appearance.iconFill}
              color={content.appearance.primary || "#0D9488"}
              locked={locked}
              onShape={(iconShape) => patchContent({ appearance: { ...content.appearance, iconShape } })}
              onFill={(iconFill) => patchContent({ appearance: { ...content.appearance, iconFill } })}
            />
          </div>
        ) : null}
        {tab === "selected" ? (
          <div className="space-y-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => setTab("elements")}>{t("websiteBuilder.builder.visual.blocks")}</Button>
            <SelectedInspector
              companyId={companyId}
              draft={draft}
              locked={locked}
              services={services}
              hours={hours}
              products={preview.products ?? []}
              locationLine={preview.locationLine}
              branchLines={preview.branchLines ?? []}
              selection={selection}
              onChange={onChange}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function CanvasToolbar({
  id,
  locked,
  content,
  onPatch,
  onMoveSection,
  onToggleSection,
}: {
  id: string;
  locked: boolean;
  content: WebsiteContent;
  onPatch: (partial: Partial<WebsiteContent>) => void;
  onMoveSection: (key: WebsiteBodySectionKey, direction: -1 | 1) => void;
  onToggleSection: (key: WebsiteBodySectionKey) => void;
}) {
  const { t } = useTranslation("common");
  const bar = "flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm";
  if (id === "hero-title" || id === "hero-text") {
    return (
      <div className={bar}>
        <Button type="button" size="sm" variant={content.hero.emphasis === "bold" ? "default" : "ghost"} disabled={locked} onClick={() => onPatch({ hero: { ...content.hero, emphasis: content.hero.emphasis === "bold" ? "none" : "bold" } })}>B</Button>
        <Button type="button" size="sm" variant={content.hero.emphasis === "italic" ? "default" : "ghost"} disabled={locked} onClick={() => onPatch({ hero: { ...content.hero, emphasis: content.hero.emphasis === "italic" ? "none" : "italic" } })}>I</Button>
        <Button type="button" size="sm" variant={content.hero.align === "center" ? "default" : "ghost"} disabled={locked} onClick={() => onPatch({ hero: { ...content.hero, align: content.hero.align === "center" ? "start" : "center" } })}>{t("websiteBuilder.builder.visual.align")}</Button>
      </div>
    );
  }
  if (id === "hero-buttons") {
    return (
      <div className={bar}>
        <Input className="h-8 w-36" value={content.hero.primaryCta} disabled={locked} onChange={(event) => onPatch({ hero: { ...content.hero, primaryCta: event.target.value } })} />
        <ActionSelect value={content.hero.primaryAction} disabled={locked} onChange={(primaryAction) => onPatch({ hero: { ...content.hero, primaryAction } })} />
      </div>
    );
  }
  if (id.startsWith("section:")) {
    const key = id.slice("section:".length) as WebsiteBodySectionKey;
    return (
      <div className={bar}>
        <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onMoveSection(key, -1)}>↑</Button>
        <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onMoveSection(key, 1)}>↓</Button>
        <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onToggleSection(key)}>{t("websiteBuilder.builder.visual.hide")}</Button>
      </div>
    );
  }
  return null;
}

function PageTopInspector({
  companyId,
  draft,
  locked,
  focus,
  onChange,
}: {
  companyId: string;
  draft: WebsiteStudioSnapshot;
  locked: boolean;
  focus: "header" | "hero";
  onChange: (next: WebsiteStudioSnapshot) => void;
}) {
  const { t } = useTranslation("common");
  const content = { ...draft.content, frames: draft.content.frames ?? defaultWebsiteFrames(), video: draft.content.video ?? defaultWebsiteVideo() };
  const hero = { ...content.hero, hidden: content.hero.hidden ?? [] };
  const header = { ...content.header, hiddenNav: content.header.hiddenNav ?? [], showBooking: content.header.showBooking !== false };
  const patchContent = (partial: Partial<WebsiteContent>) => onChange({ ...draft, content: { ...content, ...partial } });
  const togglePiece = (piece: WebsiteHeroPiece) => {
    const hidden = hero.hidden.includes(piece) ? hero.hidden.filter((item) => item !== piece) : [...hero.hidden, piece];
    patchContent({ hero: { ...hero, hidden } });
  };
  const headerPanel = (
    <div className="space-y-3 rounded-xl border p-3">
      <p className="text-sm font-semibold">{t("websiteBuilder.builder.visual.headerTitle")}</p>
      <HeaderTemplatePicker value={content.appearance.headerStyle} locked={locked} onChange={(headerStyle) => patchContent({ appearance: { ...content.appearance, headerStyle } })} />
      <div className="flex items-center justify-between gap-2">
        <Label>{t("websiteBuilder.builder.visual.showBooking")}</Label>
        <Switch checked={header.showBooking && draft.sections.booking} disabled={locked} onCheckedChange={(showBooking) => onChange(withBooking({ ...draft, content }, showBooking))} />
      </div>
      {header.showBooking ? (
        <Field label={t("websiteBuilder.builder.bookingCta")}>
          <Input value={content.booking.cta} disabled={locked} onChange={(event) => patchContent({ booking: { ...content.booking, cta: event.target.value } })} />
        </Field>
      ) : null}
      <p className="text-xs font-medium text-muted-foreground">{t("websiteBuilder.builder.visual.headerNav")}</p>
      {WEBSITE_HEADER_NAV.filter((key) => draft.sections[key]).map((key) => {
        const hidden = header.hiddenNav.includes(key);
        return (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-sm">{t(`websiteBuilder.section.${key}`)}</span>
            <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => patchContent({ header: { ...header, hiddenNav: hidden ? header.hiddenNav.filter((item) => item !== key) : [...header.hiddenNav, key] } })}>
              {hidden ? t("websiteBuilder.builder.visual.show") : t("websiteBuilder.builder.visual.hide")}
            </Button>
          </div>
        );
      })}
      {header.items.map((item, index) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-2">
          <Input value={item.label} disabled={locked} onChange={(event) => patchContent({ header: { ...header, items: header.items.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) } })} />
          <ActionSelect value={item.action === "url" ? "none" : item.action} disabled={locked} onChange={(action) => patchContent({ header: { ...header, items: header.items.map((row, rowIndex) => rowIndex === index ? { ...row, action, url: "" } : row) } })} />
          <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => patchContent({ header: { ...header, items: header.items.filter((_, rowIndex) => rowIndex !== index) } })}>{t("websiteBuilder.builder.visual.removePiece")}</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={locked || header.items.length >= 6} onClick={() => patchContent({ header: { ...header, items: [...header.items, { id: crypto.randomUUID(), label: t("websiteBuilder.builder.headerLabel"), action: "booking", url: "", detail: "" }] } })}>
        {t("websiteBuilder.builder.headerAdd")}
      </Button>
    </div>
  );
  const heroPanel = (
    <div className="space-y-3 rounded-xl border p-3">
      <p className="text-sm font-semibold">{t("websiteBuilder.builder.visual.heroTitle")}</p>
      <HeroLayoutPicker value={content.frames.hero} locked={locked} onChange={(frame) => patchContent({ ...applySectionFrame(content, "hero", frame), hero: { ...hero, imagePosition: frame === "image-left" ? "left" : frame === "image-right" ? "right" : frame === "centered" ? "center" : hero.imagePosition } })} />
      <PieceRow label={t("websiteBuilder.builder.heroImage")} hidden={hero.hidden.includes("image")} locked={locked} onToggle={() => togglePiece("image")} />
      <ImageField label={t("websiteBuilder.builder.heroImage")} url={hero.imageUrl} companyId={companyId} locked={locked} onChange={(imageUrl) => patchContent({ hero: { ...hero, imageUrl, hidden: imageUrl ? hero.hidden.filter((piece) => piece !== "image") : hero.hidden } })} />
      {hero.hidden.includes("image") ? null : (
        <ImagePositionChoices label={t("websiteBuilder.builder.visual.imagePlace")} value={hero.imagePosition ?? "center"} locked={locked} onChange={(imagePosition) => patchContent({ hero: { ...hero, imagePosition }, frames: { ...content.frames, hero: imagePosition === "center" ? "centered" : imagePosition === "left" ? "image-left" : "image-right" } })} />
      )}
      <PieceRow label={t("websiteBuilder.headline")} hidden={hero.hidden.includes("title")} locked={locked} onToggle={() => togglePiece("title")} />
      {hero.hidden.includes("title") ? null : (
        <>
          <Input value={draft.headline} disabled={locked} onChange={(event) => onChange({ ...draft, headline: event.target.value })} />
          <ScaleChoices<WebsiteTitleScale> label={t("websiteBuilder.builder.titleScale")} value={content.appearance.titleScale} options={["md", "lg", "xl"]} locked={locked} onChange={(titleScale) => patchContent({ appearance: { ...content.appearance, titleScale } })} />
          <FontColor label={t("websiteBuilder.builder.color.heading")} value={content.appearance.heading} fallback="#0F172A" locked={locked} onChange={(heading) => patchContent({ appearance: { ...content.appearance, heading } })} />
        </>
      )}
      <PieceRow label={t("websiteBuilder.description")} hidden={hero.hidden.includes("text")} locked={locked} onToggle={() => togglePiece("text")} />
      {hero.hidden.includes("text") ? null : (
        <>
          <Textarea value={draft.description} disabled={locked} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
          <ScaleChoices<WebsiteBodyScale> label={t("websiteBuilder.builder.bodyScale")} value={content.appearance.bodyScale} options={["sm", "md", "lg"]} locked={locked} onChange={(bodyScale) => patchContent({ appearance: { ...content.appearance, bodyScale } })} />
          <FontColor label={t("websiteBuilder.builder.color.text")} value={content.appearance.text} fallback="#0F172A" locked={locked} onChange={(text) => patchContent({ appearance: { ...content.appearance, text } })} />
        </>
      )}
      <PieceRow label={t("websiteBuilder.builder.primaryCta")} hidden={hero.hidden.includes("buttons")} locked={locked} onToggle={() => togglePiece("buttons")} />
      {hero.hidden.includes("buttons") ? null : (
        <>
          <Input value={hero.primaryCta} disabled={locked} placeholder={t("websiteBuilder.builder.primaryCta")} onChange={(event) => patchContent({ hero: { ...hero, primaryCta: event.target.value, primaryAction: hero.primaryAction === "none" && event.target.value.trim() ? "booking" : hero.primaryAction } })} />
          <ActionSelect value={hero.primaryAction} disabled={locked} onChange={(primaryAction) => patchContent({ hero: { ...hero, primaryAction } })} />
          <Input value={hero.secondaryCta} disabled={locked} placeholder={t("websiteBuilder.builder.secondaryCta")} onChange={(event) => patchContent({ hero: { ...hero, secondaryCta: event.target.value } })} />
          <ActionSelect value={hero.secondaryAction} disabled={locked} onChange={(secondaryAction) => patchContent({ hero: { ...hero, secondaryAction } })} />
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.dragSection")}</p>
    </div>
  );
  return focus === "header" ? headerPanel : heroPanel;
}

function PieceRow({ label, hidden, locked, onToggle }: { label: string; hidden: boolean; locked: boolean; onToggle: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Button type="button" size="sm" variant={hidden ? "default" : "ghost"} disabled={locked} onClick={onToggle}>
        {hidden ? t("websiteBuilder.builder.visual.show") : t("websiteBuilder.builder.visual.hide")}
      </Button>
    </div>
  );
}

function SectionVisibilityRow({
  label,
  visible,
  locked,
  onChange,
}: {
  label: string;
  visible: boolean;
  locked: boolean;
  onChange: (visible: boolean) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Button type="button" size="sm" variant={visible ? "ghost" : "default"} disabled={locked} onClick={() => onChange(!visible)}>
        {visible ? t("websiteBuilder.builder.visual.hide") : t("websiteBuilder.builder.visual.show")}
      </Button>
    </div>
  );
}

function TemplateCards({ current, locked, onPick }: { current: WebsiteTemplate; locked: boolean; onPick: (template: WebsiteTemplate) => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-1.5">
      <Label>{t("websiteBuilder.builder.visual.templates")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {WEBSITE_TEMPLATES.map((template) => {
          const preset = WEBSITE_TEMPLATE_PRESETS[template];
          return (
            <button
              key={template}
              type="button"
              disabled={locked}
              className={`rounded-xl border p-2 text-start ${current === template ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary"}`}
              onClick={() => onPick(template)}
            >
              <span className="flex h-12 flex-col justify-between overflow-hidden rounded-lg border p-1.5" style={{ background: preset.background ?? undefined }}>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: preset.primary ?? undefined }} />
                  <span className="h-1 flex-1 rounded" style={{ background: preset.heading ?? undefined }} />
                </span>
                <span className="h-3 w-8 rounded-full" style={{ background: preset.primary ?? undefined }} />
              </span>
              <span className="mt-1 block text-xs font-medium">{t(`websiteBuilder.builder.template.${template}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HeaderTemplatePicker({ value, locked, onChange }: { value: WebsiteHeaderStyle; locked: boolean; onChange: (style: WebsiteHeaderStyle) => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-1.5">
      <Label>{t("websiteBuilder.builder.headerStyle")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {WEBSITE_HEADER_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            disabled={locked}
            className={`rounded-xl border p-2 text-start ${value === style ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary"}`}
            onClick={() => onChange(style)}
          >
            <HeaderTemplateMini style={style} />
            <span className="mt-1 block text-xs font-medium">{t(`websiteBuilder.builder.headerStyleValue.${style}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeaderTemplateMini({ style }: { style: WebsiteHeaderStyle }) {
  const mark = <span className="size-2 shrink-0 rounded-full bg-primary" />;
  const links = <span className="h-1 flex-1 rounded bg-foreground/25" />;
  const button = <span className="h-2 w-4 shrink-0 rounded-full bg-primary" />;
  if (style === "center") {
    return (
      <span className="flex h-12 flex-col items-center justify-center gap-1 rounded-lg bg-muted px-2">
        {mark}
        <span className="flex w-full items-center gap-1">{links}{button}</span>
      </span>
    );
  }
  if (style === "classic") {
    return (
      <span className="flex h-12 items-center gap-1 rounded-lg bg-primary px-2">
        <span className="size-2 shrink-0 rounded-full bg-white" />
        <span className="h-1 flex-1 rounded bg-white/50" />
        <span className="h-2 w-4 shrink-0 rounded-full bg-white" />
      </span>
    );
  }
  if (style === "modern") {
    return (
      <span className="flex h-12 items-center rounded-lg bg-muted px-1">
        <span className="flex h-7 w-full items-center gap-1 rounded-md border bg-background px-1.5 shadow-sm">{mark}{links}{button}</span>
      </span>
    );
  }
  if (style === "pill") {
    return (
      <span className="flex h-12 items-center justify-center rounded-lg bg-muted px-2">
        <span className="flex h-6 w-4/5 items-center gap-1 rounded-full border bg-background px-1.5 shadow-sm">{mark}{links}{button}</span>
      </span>
    );
  }
  if (style === "minimal") {
    return (
      <span className="flex h-12 items-center gap-1 rounded-lg bg-background px-2">
        {mark}
        <span className="h-px flex-1 bg-foreground/20" />
      </span>
    );
  }
  if (style === "transparent") {
    return (
      <span className="flex h-12 items-center gap-1 rounded-lg bg-gradient-to-l from-sky-300 to-teal-500 px-2">
        <span className="size-2 shrink-0 rounded-full bg-white" />
        <span className="h-1 flex-1 rounded bg-white/70" />
        <span className="h-2 w-4 shrink-0 rounded-full border border-white" />
      </span>
    );
  }
  if (style === "overlay") {
    return (
      <span className="flex h-12 items-end rounded-lg bg-gradient-to-l from-sky-300 to-teal-600 p-1.5">
        <span className="flex h-5 w-full items-center gap-1 rounded-md bg-slate-950/60 px-1.5">
          <span className="size-2 shrink-0 rounded-full bg-white" />
          <span className="h-1 flex-1 rounded bg-white/60" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-12 items-center gap-1 rounded-lg border-b-2 border-border bg-background px-2">
      {mark}{links}{button}
    </span>
  );
}

function IconStylePicker({
  shape,
  fill,
  color,
  locked,
  onShape,
  onFill,
}: {
  shape: "round" | "square";
  fill: "filled" | "outline";
  color: string;
  locked: boolean;
  onShape: (shape: "round" | "square") => void;
  onFill: (fill: "filled" | "outline") => void;
}) {
  const { t } = useTranslation("common");
  const preview = `inline-flex size-7 items-center justify-center text-[10px] font-semibold ${shape === "square" ? "rounded-md" : "rounded-full"}`;
  return (
    <div className="space-y-2 rounded-xl border p-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{t("websiteBuilder.builder.visual.iconShape")}</Label>
        <span className={preview} style={fill === "outline" ? { color, border: `1.5px solid ${color}` } : { background: color, color: "#fff" }}>V</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(["round", "square"] as const).map((option) => (
          <button key={option} type="button" disabled={locked} className={`rounded-lg border px-2 py-1.5 text-xs ${shape === option ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`} onClick={() => onShape(option)}>
            {t(`websiteBuilder.builder.visual.${option}`)}
          </button>
        ))}
      </div>
      <Label>{t("websiteBuilder.builder.visual.iconFill")}</Label>
      <div className="grid grid-cols-2 gap-1">
        {(["filled", "outline"] as const).map((option) => (
          <button key={option} type="button" disabled={locked} className={`rounded-lg border px-2 py-1.5 text-xs ${fill === option ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`} onClick={() => onFill(option)}>
            {t(`websiteBuilder.builder.visual.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScaleChoices<T extends string>({
  label,
  value,
  options,
  locked,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  locked: boolean;
  onChange: (value: T) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className={`grid gap-1 ${options.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={locked}
            className={`rounded-lg border px-2 py-1.5 text-xs ${value === option ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}
            onClick={() => onChange(option)}
          >
            {t(`websiteBuilder.builder.scale.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontColor({
  label,
  value,
  fallback,
  locked,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <input
        type="color"
        aria-label={label}
        disabled={locked}
        value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback}
        className="h-8 w-10 cursor-pointer rounded border bg-transparent"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ColorFields({
  appearance,
  locked,
  onChange,
}: {
  appearance: WebsiteContent["appearance"];
  locked: boolean;
  onChange: (appearance: WebsiteContent["appearance"]) => void;
}) {
  const { t } = useTranslation("common");
  const swatch = (key: "primary" | "background" | "heading" | "text", fallback: string) => (
    <label key={key} className="flex items-center justify-between gap-2 text-sm">
      <span>{t(`websiteBuilder.builder.color.${key}`)}</span>
      <input
        type="color"
        aria-label={t(`websiteBuilder.builder.color.${key}`)}
        disabled={locked}
        value={appearance[key] && /^#[0-9a-f]{6}$/i.test(appearance[key]) ? appearance[key] : fallback}
        className="h-8 w-10 cursor-pointer rounded border bg-transparent"
        onChange={(event) => onChange({ ...appearance, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <div className="space-y-2">
      {swatch("primary", "#0D9488")}
      {swatch("background", "#F8FAFC")}
      {swatch("heading", "#0F172A")}
      {swatch("text", "#0F172A")}
    </div>
  );
}

function SelectedInspector({
  companyId,
  draft,
  locked,
  services,
  hours,
  products,
  locationLine,
  branchLines,
  selection,
  onChange,
}: {
  companyId: string;
  draft: WebsiteStudioSnapshot;
  locked: boolean;
  services: ServiceRow[];
  hours: { key: string; open: string; close: string }[];
  products: WebsitePreviewProduct[];
  locationLine: string | null;
  branchLines: string[];
  selection: string | null;
  onChange: (next: WebsiteStudioSnapshot) => void;
}) {
  const { t } = useTranslation("common");
  const content = { ...draft.content, frames: draft.content.frames ?? defaultWebsiteFrames(), video: draft.content.video ?? defaultWebsiteVideo() };
  const patchContent = (partial: Partial<WebsiteContent>) => onChange({ ...draft, content: { ...content, ...partial } });
  const sectionKey = selection?.startsWith("section:") ? selection.slice("section:".length) as WebsiteBodySectionKey : null;

  if (!selection || selection === "header" || selection === "hero" || selection === "hero-title" || selection === "hero-text" || selection === "hero-image" || selection === "hero-buttons") {
    return (
      <PageTopInspector
        companyId={companyId}
        draft={draft}
        locked={locked}
        focus={selection === "header" ? "header" : "hero"}
        onChange={onChange}
      />
    );
  }

  if (selection === "social") {
    return <SocialInspector draft={draft} locked={locked} onChange={onChange} />;
  }

  if (sectionKey === "hours") {
    return (
      <div className="space-y-3">
        <SectionVisibilityRow label={t("websiteBuilder.section.hours")} visible={draft.sections.hours} locked={locked} onChange={(value) => onChange(setSectionVisible(draft, "hours", value))} />
        <div className="grid grid-cols-2 gap-2">
          {WEBSITE_HOURS_FRAMES.map((frame) => (
            <button key={frame} type="button" disabled={locked} className={`rounded-xl border px-2 py-2 text-xs ${content.frames.hours === frame ? "border-primary bg-primary/10 font-semibold" : "hover:border-primary"}`} onClick={() => patchContent(applySectionFrame(content, "hours", frame))}>
              {t(`websiteBuilder.builder.frameValue.${frame}`)}
            </button>
          ))}
        </div>
        {hours.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyHours")}</p> : (
          <ul className="space-y-1 text-sm">{hours.map((row) => <li key={row.key} className="flex justify-between gap-2"><span>{t(`websiteBuilder.builder.days.${row.key}`, { defaultValue: row.key })}</span><span>{row.open}–{row.close}</span></li>)}</ul>
        )}
        <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.visual.fixedHours")}</p>
      </div>
    );
  }

  if (sectionKey === "services" || selection?.startsWith("service:")) {
    const serviceId = selection?.startsWith("service:") ? selection.slice("service:".length) : null;
    const service = services.find((row) => row.id === serviceId) ?? null;
    return (
      <div className="space-y-3">
        <SectionVisibilityRow label={t("websiteBuilder.section.services")} visible={draft.sections.services} locked={locked} onChange={(value) => onChange(setSectionVisible(draft, "services", value))} />
        {service ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{service.name}</p>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" disabled={locked || visibleWebsiteServices(services, content).findIndex((row) => row.id === service.id) <= 0} onClick={() => {
                const ordered = visibleWebsiteServices(services, content);
                const index = ordered.findIndex((row) => row.id === service.id);
                const target = ordered[index - 1];
                if (target) patchContent({ services: reorderWebsiteServices(content, services.map((row) => row.id), service.id, target.id) });
              }}>↑</Button>
              <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => {
                const ordered = visibleWebsiteServices(services, content);
                const index = ordered.findIndex((row) => row.id === service.id);
                const target = ordered[index + 1];
                if (!target) return;
                patchContent({ services: reorderWebsiteServices(content, services.map((row) => row.id), service.id, target.id) });
              }}>↓</Button>
            </div>
          </div>
        ) : null}
        {(service ? [service] : services).map((row) => {
          const selected = content.services.mode !== "selected" || content.services.ids.includes(row.id);
          const price = row.priceCents && row.priceCents > 0 ? `${(row.priceCents / 100).toFixed(0)} ${row.currency ?? ""}`.trim() : "";
          return (
          <div key={row.id} className="space-y-2 rounded-xl border p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{row.name}</p>
                {price ? <p className="text-xs text-muted-foreground">{price}</p> : null}
              </div>
              <Switch checked={selected} disabled={locked} onCheckedChange={(checked) => {
                const ids = content.services.mode === "selected" ? [...content.services.ids] : services.map((item) => item.id);
                const next = checked ? [...ids, row.id] : ids.filter((id) => id !== row.id);
                patchContent({ services: { ...content.services, mode: "selected", ids: [...new Set(next)] } });
              }} />
            </div>
          <ImageField label={row.name} url={content.services.images[row.id] ?? null} companyId={companyId} locked={locked} onChange={(url) => {
            const images = { ...content.services.images };
            if (url) images[row.id] = url;
            else delete images[row.id];
            patchContent({ services: { ...content.services, images } });
          }} />
          </div>
          );
        })}
        <FrameChoices label={t("websiteBuilder.builder.frame.layout")} options={WEBSITE_SERVICE_FRAMES} value={content.frames.services} locked={locked} onChange={(servicesFrame) => patchContent(applySectionFrame(content, "services", servicesFrame))} />
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" disabled={locked || !sectionKey} onClick={() => sectionKey && patchContent({ order: moveWebsiteSection(content.order, sectionKey, -1) })}>↑</Button>
          <Button type="button" size="sm" variant="outline" disabled={locked || !sectionKey} onClick={() => sectionKey && patchContent({ order: moveWebsiteSection(content.order, sectionKey, 1) })}>↓</Button>
        </div>
      </div>
    );
  }

  if (sectionKey === "products" || selection?.startsWith("product:")) {
    const catalog = content.products ?? { mode: "all" as const, ids: [] as string[], images: {} as Record<string, string>, descriptions: {} as Record<string, string>, showPrice: true };
    const productId = selection?.startsWith("product:") ? selection.slice("product:".length) : null;
    const focus = products.find((row) => row.id === productId) ?? null;
    const rows = focus ? [focus] : products;
    return (
      <div className="space-y-3">
        <SectionVisibilityRow label={t("websiteBuilder.section.products")} visible={draft.sections.products} locked={locked} onChange={(value) => onChange(setSectionVisible(draft, "products", value))} />
        <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.productCatalog")}</p>
        <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
          <span>{t("websiteBuilder.builder.showPrice")}</span>
          <Switch checked={catalog.showPrice} disabled={locked} onCheckedChange={(showPrice) => patchContent({ products: { ...catalog, showPrice } })} />
        </label>
        {products.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyProducts")}</p> : rows.map((row) => {
          const selected = catalog.mode !== "selected" || catalog.ids.includes(row.id);
          return (
            <div key={row.id} className="space-y-2 rounded-xl border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  {catalog.showPrice && row.price > 0 ? <p className="text-xs text-muted-foreground">{row.price} {row.currency}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="outline" disabled={locked || visibleWebsiteProducts(products, content).findIndex((item) => item.id === row.id) <= 0} onClick={() => {
                    const ordered = visibleWebsiteProducts(products, content);
                    const index = ordered.findIndex((item) => item.id === row.id);
                    const target = ordered[index - 1];
                    if (target) patchContent({ products: reorderWebsiteProducts(content, products.map((item) => item.id), row.id, target.id) });
                  }}>↑</Button>
                  <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => {
                    const ordered = visibleWebsiteProducts(products, content);
                    const index = ordered.findIndex((item) => item.id === row.id);
                    const target = ordered[index + 1];
                    if (!target) return;
                    patchContent({ products: reorderWebsiteProducts(content, products.map((item) => item.id), row.id, target.id) });
                  }}>↓</Button>
                  <Switch checked={selected} disabled={locked} onCheckedChange={(checked) => {
                    const ids = catalog.mode === "selected" ? [...catalog.ids] : products.map((item) => item.id);
                    const next = checked ? [...ids, row.id] : ids.filter((id) => id !== row.id);
                    patchContent({ products: { ...catalog, mode: "selected", ids: [...new Set(next)] } });
                  }} />
                </div>
              </div>
              <Field label={t("websiteBuilder.builder.productDescription")}>
                <Textarea
                  value={catalog.descriptions?.[row.id] ?? ""}
                  disabled={locked}
                  maxLength={280}
                  placeholder={t("websiteBuilder.builder.productDescriptionPlaceholder")}
                  onChange={(event) => {
                    const descriptions = { ...(catalog.descriptions ?? {}) };
                    const text = event.target.value;
                    if (text.trim()) descriptions[row.id] = text;
                    else delete descriptions[row.id];
                    patchContent({ products: { ...catalog, descriptions } });
                  }}
                />
              </Field>
              <ImageField label={t("websiteBuilder.builder.productImage")} url={catalog.images[row.id] ?? null} companyId={companyId} locked={locked} onChange={(url) => {
                const images = { ...catalog.images };
                if (url) images[row.id] = url;
                else delete images[row.id];
                patchContent({ products: { ...catalog, images } });
              }} />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {catalog.images[row.id]
                  ? t("websiteBuilder.builder.productImageUsingOverride")
                  : t("websiteBuilder.builder.productImageUsingCatalog")}
              </p>
              {row.imageUrls?.length && !catalog.images[row.id] ? (
                <div className="flex gap-1.5">
                  {row.imageUrls.slice(0, 5).map((url) => (
                    <img key={url} src={url} alt="" className="size-10 rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <ProductFramePicker
          value={content.frames?.products ?? "shelf"}
          locked={locked}
          name={t("websiteBuilder.builder.frame.layout")}
          label={(frame) => t(`websiteBuilder.builder.frameValue.${frame}`)}
          onChange={(productsFrame) => patchContent(applySectionFrame(content, "products", productsFrame))}
        />
      </div>
    );
  }

  if (sectionKey) {
    return (
      <div className="space-y-3">
        <SectionVisibilityRow label={t(`websiteBuilder.section.${sectionKey}`)} visible={draft.sections[sectionKey]} locked={locked} onChange={(value) => onChange(setSectionVisible(draft, sectionKey, value))} />
        {sectionKey === "gallery" ? (
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-semibold">{t("websiteBuilder.section.gallery")}</p>
            <WebsiteGalleryEditor companyId={companyId} gallery={draft.gallery} disabled={locked} onChange={(gallery) => onChange({ ...draft, gallery })} />
            <ImagePositionChoices label={t("websiteBuilder.builder.visual.imagePlace")} value={draft.gallery.position ?? "center"} locked={locked} onChange={(position) => onChange({ ...draft, gallery: { ...draft.gallery, position } })} />
            <FrameChoices label={t("websiteBuilder.builder.frame.layout")} options={WEBSITE_GALLERY_FRAMES} value={content.frames.gallery} locked={locked} onChange={(gallery) => patchContent(applySectionFrame(content, "gallery", gallery))} />
          </div>
        ) : null}
        {sectionKey === "about" ? (
          <>
            <Field label={t("websiteBuilder.builder.aboutHeading")}>
              <Input value={content.about.heading} disabled={locked} onChange={(event) => patchContent({ about: { ...content.about, heading: event.target.value } })} />
            </Field>
            <ImageField label={t("websiteBuilder.builder.aboutImage")} url={content.about.imageUrl} companyId={companyId} locked={locked} onChange={(imageUrl) => patchContent({ about: { ...content.about, imageUrl } })} />
            <Field label={t("websiteBuilder.builder.bullets")}>
              <Textarea value={content.about.bullets.join("\n")} disabled={locked} onChange={(event) => patchContent({ about: { ...content.about, bullets: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 6) } })} />
            </Field>
            <FrameChoices label={t("websiteBuilder.builder.frame.layout")} options={WEBSITE_ABOUT_FRAMES} value={content.frames.about} locked={locked} onChange={(about) => patchContent(applySectionFrame(content, "about", about))} />
          </>
        ) : null}
        {sectionKey === "features" ? (
          <RowsEditor locked={locked} items={content.features.items} titleLabel={t("websiteBuilder.builder.featureTitle")} textLabel={t("websiteBuilder.builder.featureText")} onChange={(items) => patchContent({ features: { items } })} />
        ) : null}
        {sectionKey === "testimonials" ? (
          <>
            <RowsEditor
              locked={locked}
              items={content.testimonials.items.map((item) => ({ title: item.name, text: item.quote }))}
              titleLabel={t("websiteBuilder.builder.personName")}
              textLabel={t("websiteBuilder.builder.quote")}
              onChange={(items) => patchContent({ testimonials: { items: items.map((item) => ({ name: item.title, quote: item.text })) } })}
            />
            <FrameChoices label={t("websiteBuilder.builder.frame.layout")} options={WEBSITE_REVIEW_FRAMES} value={content.frames.reviews} locked={locked} onChange={(reviews) => patchContent(applySectionFrame(content, "reviews", reviews))} />
          </>
        ) : null}
        {sectionKey === "booking" ? <FrameChoices label={t("websiteBuilder.builder.frame.layout")} options={WEBSITE_BOOKING_FRAMES} value={content.frames.booking} locked={locked} onChange={(booking) => patchContent(applySectionFrame(content, "booking", booking))} /> : null}
        {sectionKey === "contact" ? (
          <>
            <Field label={t("websiteBuilder.builder.contactHeading")}>
              <Input value={content.contact.heading} disabled={locked} onChange={(event) => patchContent({ contact: { ...content.contact, heading: event.target.value } })} />
            </Field>
            <Textarea value={content.contact.description} disabled={locked} onChange={(event) => patchContent({ contact: { ...content.contact, description: event.target.value } })} />
          </>
        ) : null}
        {sectionKey === "location" ? (
          <LocationChoices
            place={content.place ?? { source: "branch", label: "", pins: [] }}
            systemLine={locationLine}
            branchLines={branchLines}
            locked={locked}
            onChange={(place) => patchContent({ place })}
          />
        ) : null}
        {sectionKey === "video" ? (
          <VideoField
            companyId={companyId}
            locked={locked}
            video={content.video}
            onChange={(video) => patchContent({ video })}
          />
        ) : null}
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => patchContent({ order: moveWebsiteSection(content.order, sectionKey, -1) })}>↑</Button>
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => patchContent({ order: moveWebsiteSection(content.order, sectionKey, 1) })}>↓</Button>
        </div>
      </div>
    );
  }

  if (selection === "chat") {
    return (
      <ChatResponderInspector draft={draft} companyId={companyId} locked={locked} onChange={onChange} />
    );
  }

  return <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.visual.selected")}</p>;
}

function SocialInspector({ draft, locked, onChange }: { draft: WebsiteStudioSnapshot; locked: boolean; onChange: (next: WebsiteStudioSnapshot) => void }) {
  const { t } = useTranslation("common");
  const content = draft.content;
  const patch = (channels: WebsiteContent["channels"]) => {
    const value = (id: WebsiteChannelId) => channels.find((channel) => channel.id === id)?.value ?? "";
    onChange({
      ...draft,
      content: {
        ...content,
        channels,
        social: { ...content.social, facebook: value("facebook"), instagram: value("instagram"), whatsapp: value("whatsapp") },
      },
    });
  };
  const featured = ["facebook", "instagram", "whatsapp", "youtube", "linkedin"] as const;
  const rest = WEBSITE_CHANNEL_IDS.filter((id) => !featured.includes(id as typeof featured[number]));
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">{t("websiteBuilder.builder.visual.block.social")}</p>
      <Label>{t("websiteBuilder.builder.socialPlaceLabel")}</Label>
      <div className="grid grid-cols-2 gap-1">
        {WEBSITE_SOCIAL_PLACEMENTS.map((place) => (
          <button key={place} type="button" disabled={locked} className={`rounded-lg border px-2 py-1.5 text-xs ${content.social.placement === place ? "border-primary bg-primary/10 font-semibold" : ""}`} onClick={() => onChange({ ...draft, content: { ...content, social: { ...content.social, placement: place } } })}>
            {t(`websiteBuilder.builder.socialPlace.${place}`)}
          </button>
        ))}
      </div>
      {[...featured, ...rest].map((id) => {
        const current = content.channels.find((channel) => channel.id === id);
        return (
          <div key={id} className="space-y-1 rounded-lg border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm">
                <BrandIcon name={id} className="size-7" />
                {t(`websiteBuilder.builder.channel.${id}`)}
              </span>
              <Switch checked={Boolean(current)} disabled={locked} onCheckedChange={(checked) => patch(checked ? [...content.channels.filter((channel) => channel.id !== id), { id, value: current?.value ?? "" }] : content.channels.filter((channel) => channel.id !== id))} />
            </div>
            {current ? (
              <Input value={current.value} disabled={locked} placeholder={t(`websiteBuilder.builder.channelHint.${id}`)} onChange={(event) => patch(content.channels.map((channel) => channel.id === id ? { ...channel, value: event.target.value } : channel))} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function moveItems<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  if (!item) return items;
  copy.splice(next, 0, item);
  return copy;
}

function ActionSelect({ value, disabled, onChange }: { value: WebsiteCtaAction; disabled: boolean; onChange: (value: WebsiteCtaAction) => void }) {
  const { t } = useTranslation("common");
  return (
    <select className={fieldSelectClass} value={value} disabled={disabled} onChange={(event) => {
      const next = event.target.value;
      onChange(next === "services" || next === "contact" || next === "about" || next === "gallery" || next === "none" ? next : "booking");
    }}>
      {(["booking", "services", "contact", "about", "gallery", "none"] as const).map((action) => (
        <option key={action} value={action}>{t(`websiteBuilder.builder.cta.${action}`)}</option>
      ))}
    </select>
  );
}

function ChatResponderInspector({
  draft,
  companyId,
  locked,
  onChange,
}: {
  draft: WebsiteStudioSnapshot;
  companyId: string;
  locked: boolean;
  onChange: (next: WebsiteStudioSnapshot) => void;
}) {
  const { t } = useTranslation("common");
  const flows = useActiveAutomationFlows(companyId);
  const content = draft.content;
  const mode = content.chat.responseMode;
  const employeeKnown = draft.employees.some((employee) => employee.id === draft.aiEmployeeId);
  const workflowKnown = (flows.data ?? []).some((flow) => flow.id === content.chat.workflowId);

  const setMode = (next: "ai_employee" | "workflow") => {
    if (next === "workflow") {
      onChange({
        ...draft,
        aiEnabled: false,
        aiEmployeeId: null,
        content: { ...content, chat: { ...content.chat, responseMode: "workflow", workflowId: workflowKnown ? content.chat.workflowId : null } },
      });
      return;
    }
    onChange({
      ...draft,
      content: { ...content, chat: { ...content.chat, responseMode: "ai_employee", workflowId: null } },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionVisibilityRow label={t("websiteBuilder.section.chat")} visible={draft.sections.chat} locked={locked} onChange={(value) => onChange(setSectionVisible(draft, "chat", value))} />
      </div>
      <Label>{t("websiteBuilder.builder.chatAnchor")}</Label>
      <div className="grid grid-cols-2 gap-1">
        {(["fixed", "flow"] as const).map((anchor) => (
          <button key={anchor} type="button" disabled={locked || !draft.sections.chat} className={`rounded-lg border px-2 py-1.5 text-xs ${content.chat.anchor === anchor ? "border-primary bg-primary/10 font-semibold" : ""}`} onClick={() => onChange({ ...draft, content: { ...content, chat: { ...content.chat, anchor } } })}>
            {t(`websiteBuilder.builder.chatAnchorValue.${anchor}`)}
          </button>
        ))}
      </div>
      <Label>{t("websiteBuilder.builder.chatSide")}</Label>
      <div className="grid grid-cols-2 gap-1">
        {(["end", "start"] as const).map((side) => (
          <button key={side} type="button" disabled={locked || !draft.sections.chat} className={`rounded-lg border px-2 py-1.5 text-xs ${content.chat.side === side ? "border-primary bg-primary/10 font-semibold" : ""}`} onClick={() => onChange({ ...draft, content: { ...content, chat: { ...content.chat, side } } })}>
            {t(`websiteBuilder.builder.chatSideValue.${side}`)}
          </button>
        ))}
      </div>
      <Field label={t("websiteBuilder.greeting")}>
        <Textarea value={draft.greeting} disabled={locked || !draft.sections.chat} onChange={(event) => onChange({ ...draft, greeting: event.target.value })} />
      </Field>
      <Field label={t("websiteBuilder.builder.responder")}>
        <select className={fieldSelectClass} value={mode} disabled={locked || !draft.sections.chat} onChange={(event) => setMode(event.target.value === "workflow" ? "workflow" : "ai_employee")}>
          <option value="ai_employee">{t("websiteBuilder.builder.responderAi")}</option>
          <option value="workflow">{t("websiteBuilder.builder.responderWorkflow")}</option>
        </select>
      </Field>
      {mode === "workflow" ? (
        (flows.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.noWorkflows")}</p> : (
          <select
            className={fieldSelectClass}
            value={workflowKnown ? content.chat.workflowId ?? "none" : "none"}
            disabled={locked || !draft.sections.chat}
            onChange={(event) => onChange({
              ...draft,
              aiEnabled: false,
              aiEmployeeId: null,
              content: { ...content, chat: { ...content.chat, responseMode: "workflow", workflowId: event.target.value === "none" ? null : event.target.value } },
            })}
          >
            <option value="none">{t("websiteBuilder.builder.workflowPlaceholder")}</option>
            {flows.data?.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
          </select>
        )
      ) : draft.employees.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.noEmployees")}</p> : (
        <select
          className={fieldSelectClass}
          value={employeeKnown ? draft.aiEmployeeId ?? "none" : "none"}
          disabled={locked || !draft.sections.chat}
          onChange={(event) => onChange({
            ...draft,
            aiEnabled: event.target.value !== "none",
            aiEmployeeId: event.target.value === "none" ? null : event.target.value,
            content: { ...content, chat: { ...content.chat, responseMode: "ai_employee", workflowId: null } },
          })}
        >
          <option value="none">{t("websiteBuilder.employeePlaceholder")}</option>
          {draft.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      )}
    </div>
  );
}

function RowsEditor({
  items,
  locked,
  onChange,
  titleLabel,
  textLabel,
}: {
  items: { title: string; text: string }[];
  locked: boolean;
  onChange: (items: { title: string; text: string }[]) => void;
  titleLabel: string;
  textLabel: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="space-y-1.5">
          <Input value={item.title} disabled={locked} placeholder={titleLabel} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} />
          <Textarea value={item.text} disabled={locked} placeholder={textLabel} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, text: event.target.value } : row))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={locked || items.length >= 6} onClick={() => onChange([...items, { title: "", text: "" }])}>+</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function ImagePositionChoices({ label, value, locked, onChange }: { label: string; value: WebsiteImagePosition; locked: boolean; onChange: (value: WebsiteImagePosition) => void }) {
  const { t } = useTranslation("common");
  const options = ["left", "center", "right"] as const;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-1">
        {options.map((option) => (
          <button key={option} type="button" disabled={locked} className={`rounded-lg border px-2 py-1.5 text-xs ${value === option ? "border-primary bg-primary/10" : "border-border"}`} onClick={() => onChange(option)}>
            {t(`websiteBuilder.builder.visual.place.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

const HERO_LAYOUTS = ["image-right", "image-left", "split", "full", "overlay", "centered"] as const satisfies readonly WebsiteHeroFrame[];

function HeroLayoutPicker({ value, locked, onChange }: { value: WebsiteHeroFrame; locked: boolean; onChange: (frame: WebsiteHeroFrame) => void }) {
  const { t } = useTranslation("common");
  const selected = value === "classic" ? "image-right" : value;
  return (
    <div className="space-y-1.5">
      <Label>{t("websiteBuilder.builder.frame.layout")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {HERO_LAYOUTS.map((frame) => (
          <button
            key={frame}
            type="button"
            disabled={locked}
            className={`rounded-xl border p-2 text-start ${selected === frame ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary"}`}
            onClick={() => onChange(frame)}
          >
            <HeroLayoutMini frame={frame} />
            <span className="mt-1 block text-xs font-medium">{t(`websiteBuilder.builder.frameValue.${frame}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeroLayoutMini({ frame }: { frame: (typeof HERO_LAYOUTS)[number] }) {
  const lines = (
    <span className="flex h-full flex-col justify-center gap-1 px-1">
      <span className="h-1.5 w-full rounded bg-foreground/70" />
      <span className="h-1 w-2/3 rounded bg-foreground/30" />
    </span>
  );
  if (frame === "overlay") {
    return (
      <span className="flex h-14 items-end rounded-md bg-primary/80 p-1.5">
        <span className="h-1.5 w-2/3 rounded bg-white" />
      </span>
    );
  }
  if (frame === "full") {
    return (
      <span className="flex h-14 flex-col overflow-hidden rounded-md bg-muted">
        <span className="h-8 bg-primary" />
        <span className="mx-auto mt-1 h-1.5 w-8 rounded bg-foreground/70" />
      </span>
    );
  }
  if (frame === "centered") {
    return (
      <span className="flex h-14 flex-col items-center justify-center gap-1 rounded-md bg-muted">
        <span className="h-6 w-8 rounded bg-primary/70" />
        <span className="h-1.5 w-10 rounded bg-foreground/70" />
      </span>
    );
  }
  if (frame === "split") {
    return (
      <span className="grid h-14 grid-cols-2 overflow-hidden rounded-md">
        <span className="bg-muted">{lines}</span>
        <span className="bg-primary" />
      </span>
    );
  }
  const imageFirst = frame === "image-left";
  const image = <span className="h-full rounded bg-primary/70" />;
  return (
    <span className="grid h-14 grid-cols-2 items-center gap-1 rounded-md bg-muted p-1.5">
      {imageFirst ? image : lines}
      {imageFirst ? lines : image}
    </span>
  );
}

function FrameChoices<T extends string>({ label, options, value, locked, onChange }: { label: string; options: readonly T[]; value: T; locked: boolean; onChange: (value: T) => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className={fieldSelectClass} value={value} disabled={locked} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>{t(`websiteBuilder.builder.frameValue.${option}`, { defaultValue: option })}</option>
        ))}
      </select>
    </div>
  );
}

function PaletteMark({ block }: { block: string }) {
  const Icon = block === "header" ? PanelTop
    : block === "hero" ? LayoutTemplate
    : block === "gallery" ? Images
    : block === "services" ? Sparkles
    : block === "products" ? ShoppingBag
    : block === "features" ? Star
    : block === "testimonials" ? MessageSquare
    : block === "hours" ? Clock
    : block === "location" ? MapPin
    : block === "contact" ? Mail
    : block === "booking" ? Calendar
    : block === "video" ? Video
    : block === "chat" ? MessagesSquare
    : block === "faq" ? MessageSquare
    : ImageIcon;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function LocationChoices({
  place,
  systemLine,
  branchLines,
  locked,
  onChange,
}: {
  place: WebsiteContent["place"];
  systemLine: string | null;
  branchLines: string[];
  locked: boolean;
  onChange: (place: WebsiteContent["place"]) => void;
}) {
  const { t } = useTranslation("common");
  const system = branchLines.length ? branchLines : systemLine ? [systemLine] : [];
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Label>{t("websiteBuilder.builder.placeSource")}</Label>
      <div className="grid grid-cols-1 gap-1">
        {(["branch", "custom"] as const).map((source) => (
          <button
            key={source}
            type="button"
            disabled={locked}
            className={`rounded-lg border px-2 py-1.5 text-start text-xs ${place.source === source ? "border-primary bg-primary/10 font-semibold" : ""}`}
            onClick={() => onChange({ ...place, source })}
          >
            {t(`websiteBuilder.builder.placeSourceValue.${source}`)}
          </button>
        ))}
      </div>
      {place.source === "custom" ? (
        <Input value={place.label} disabled={locked} placeholder={t("websiteBuilder.builder.placeCustom")} onChange={(event) => onChange({ ...place, source: "custom", label: event.target.value })} />
      ) : (
        <ul className="space-y-1">
          {system.length ? system.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{line}</span>
            </li>
          )) : <li className="text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyLocation")}</li>}
        </ul>
      )}
      {(place.pins ?? []).map((pin) => (
        <div key={pin.id} className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <Input
            value={pin.label}
            disabled={locked}
            placeholder={t("websiteBuilder.builder.placeCustom")}
            onChange={(event) => onChange({ ...place, pins: place.pins.map((item) => item.id === pin.id ? { ...item, label: event.target.value } : item) })}
          />
          <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onChange({ ...place, pins: place.pins.filter((item) => item.id !== pin.id) })}>
            {t("websiteBuilder.builder.removePlace")}
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={locked || (place.pins ?? []).length >= 6} onClick={() => onChange(addWebsitePlacePin(place))}>
        <Plus className="size-4" aria-hidden />
        {t("websiteBuilder.builder.addPlace")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.placeHint")}</p>
    </div>
  );
}

function VideoField({ companyId, locked, video, onChange }: { companyId: string; locked: boolean; video: WebsiteVideo; onChange: (video: WebsiteVideo) => void }) {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadCompanyBrandAsset({ companyId, slot: "website-video", file });
      onChange({ ...video, url: uploaded.publicUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("websiteBuilder.builder.frame.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      {video.url ? (
        <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <WebsiteVideoPlayer video={video} />
        </div>
      ) : null}
      <input ref={inputRef} type="file" accept="video/mp4,video/webm" className="hidden" disabled={locked || uploading} onChange={(event) => void upload(event.target.files?.[0])} />
      <Button type="button" size="sm" variant="outline" disabled={locked || uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? t("websiteBuilder.builder.frame.uploading") : t("websiteBuilder.builder.frame.uploadVideo")}
      </Button>
      {video.url ? <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onChange({ ...video, url: null })}>{t("websiteBuilder.builder.frame.removeVideo")}</Button> : null}
      <Input value={video.caption} disabled={locked} placeholder={t("websiteBuilder.builder.frame.caption")} onChange={(event) => onChange({ ...video, caption: event.target.value })} />
      <label className="flex items-center justify-between text-sm"><span>{t("websiteBuilder.builder.frame.controls")}</span><Switch checked={video.controls} disabled={locked} onCheckedChange={(controls) => onChange({ ...video, controls })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t("websiteBuilder.builder.frame.autoplay")}</span><Switch checked={video.autoplay} disabled={locked} onCheckedChange={(autoplay) => onChange({ ...video, autoplay, muted: autoplay ? true : video.muted })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t("websiteBuilder.builder.frame.loop")}</span><Switch checked={video.loop} disabled={locked} onCheckedChange={(loop) => onChange({ ...video, loop })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t("websiteBuilder.builder.frame.muted")}</span><Switch checked={video.muted || video.autoplay} disabled={locked || video.autoplay} onCheckedChange={(muted) => onChange({ ...video, muted })} /></label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
