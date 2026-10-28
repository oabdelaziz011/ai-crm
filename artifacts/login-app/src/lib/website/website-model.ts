export const WEBSITE_SECTION_KEYS = [
  "about",
  "features",
  "testimonials",
  "gallery",
  "services",
  "hours",
  "location",
  "contact",
  "booking",
  "video",
  "products",
  "chat",
] as const;

export const WEBSITE_BODY_SECTION_KEYS = [
  "about",
  "features",
  "services",
  "gallery",
  "testimonials",
  "hours",
  "location",
  "contact",
  "booking",
  "video",
  "products",
] as const;

export const WEBSITE_HERO_FRAMES = ["classic", "image-left", "image-right", "full", "split", "overlay", "centered"] as const;
export const WEBSITE_SERVICE_FRAMES = ["two", "three", "four", "cards", "minimal", "images"] as const;
export const WEBSITE_GALLERY_FRAMES = ["grid", "carousel", "masonry", "reel", "featured"] as const;
export const WEBSITE_ABOUT_FRAMES = ["image-text", "text-image", "centered", "columns"] as const;
export const WEBSITE_CONTACT_FRAMES = ["details", "map", "split"] as const;
export const WEBSITE_BOOKING_FRAMES = ["cta", "cards", "inline", "compact", "full"] as const;
export const WEBSITE_REVIEW_FRAMES = ["cards", "carousel", "rating"] as const;
export const WEBSITE_HOURS_FRAMES = ["list", "cards", "pills", "columns"] as const;
export const WEBSITE_PRODUCT_FRAMES = ["shelf", "catalog", "spotlight", "list", "tiles"] as const;
export const WEBSITE_SOCIAL_PLACEMENTS = ["header", "hero", "services", "hours", "contact", "footer", "floating"] as const;

export const WEBSITE_CTA_ACTIONS = ["booking", "services", "contact", "about", "gallery", "none"] as const;

export const WEBSITE_GALLERY_LIMIT = 8;

export type WebsiteGalleryDirection = "left" | "right";
export type WebsiteImagePosition = "left" | "center" | "right";

export type WebsiteGallerySlide = {
  id: string;
  url: string;
  alt: string;
};

export type WebsiteGallery = {
  direction: WebsiteGalleryDirection;
  position: WebsiteImagePosition;
  slides: WebsiteGallerySlide[];
};

const GALLERY_URL =
  /^(https:\/\/[^\s]+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/storage\/v1\/object\/public\/company-branding\/[^\s]+)$/;

export type WebsiteSectionKey = (typeof WEBSITE_SECTION_KEYS)[number];
export type WebsiteBodySectionKey = (typeof WEBSITE_BODY_SECTION_KEYS)[number];
export type WebsiteSections = Record<WebsiteSectionKey, boolean>;
export type WebsiteCtaAction = (typeof WEBSITE_CTA_ACTIONS)[number];
export type WebsiteHeaderAction = WebsiteCtaAction | "url";
export type WebsiteSocialPlacement = (typeof WEBSITE_SOCIAL_PLACEMENTS)[number];
export type WebsiteChatResponseMode = "ai_employee" | "workflow";
export type WebsiteChatAnchor = "fixed" | "flow";
export type WebsiteChatSide = "start" | "end";
export const WEBSITE_TEMPLATES = ["clinical", "editorial", "midnight", "atelier"] as const;
export const WEBSITE_HEADER_STYLES = ["classic", "center", "modern", "minimal", "split", "transparent", "overlay", "pill"] as const;
export const WEBSITE_TITLE_SCALES = ["md", "lg", "xl"] as const;
export const WEBSITE_BODY_SCALES = ["sm", "md", "lg"] as const;
export const WEBSITE_SECTION_SIZES = ["sm", "md", "lg"] as const;
export const WEBSITE_HERO_SLOTS = ["title", "text", "buttons"] as const;
export const WEBSITE_HERO_PIECES = ["title", "text", "buttons", "image"] as const;
export const WEBSITE_HEADER_NAV = ["about", "services", "products", "gallery", "testimonials", "location", "contact"] as const;
export const WEBSITE_CHANNEL_IDS = ["facebook", "instagram", "whatsapp", "phone", "email", "telegram", "tiktok", "x", "youtube", "snapchat", "linkedin"] as const;
export type WebsiteTemplate = (typeof WEBSITE_TEMPLATES)[number];
export type WebsiteHeaderStyle = (typeof WEBSITE_HEADER_STYLES)[number];
export type WebsiteTitleScale = (typeof WEBSITE_TITLE_SCALES)[number];
export type WebsiteBodyScale = (typeof WEBSITE_BODY_SCALES)[number];
export type WebsiteSectionSize = (typeof WEBSITE_SECTION_SIZES)[number];
export type WebsiteHeroSlot = (typeof WEBSITE_HERO_SLOTS)[number];
export type WebsiteHeroPiece = (typeof WEBSITE_HERO_PIECES)[number];
export type WebsiteHeaderNavKey = (typeof WEBSITE_HEADER_NAV)[number];
export type WebsiteChannelId = (typeof WEBSITE_CHANNEL_IDS)[number];
export type WebsiteChannel = { id: WebsiteChannelId; value: string };
export type WebsiteHeroFrame = (typeof WEBSITE_HERO_FRAMES)[number];
export type WebsiteServiceFrame = (typeof WEBSITE_SERVICE_FRAMES)[number];
export type WebsiteGalleryFrame = (typeof WEBSITE_GALLERY_FRAMES)[number];
export type WebsiteAboutFrame = (typeof WEBSITE_ABOUT_FRAMES)[number];
export type WebsiteContactFrame = (typeof WEBSITE_CONTACT_FRAMES)[number];
export type WebsiteBookingFrame = (typeof WEBSITE_BOOKING_FRAMES)[number];
export type WebsiteReviewFrame = (typeof WEBSITE_REVIEW_FRAMES)[number];
export type WebsiteHoursFrame = (typeof WEBSITE_HOURS_FRAMES)[number];
export type WebsiteProductFrame = (typeof WEBSITE_PRODUCT_FRAMES)[number];
export type WebsiteFrames = {
  hero: WebsiteHeroFrame;
  services: WebsiteServiceFrame;
  gallery: WebsiteGalleryFrame;
  about: WebsiteAboutFrame;
  contact: WebsiteContactFrame;
  booking: WebsiteBookingFrame;
  reviews: WebsiteReviewFrame;
  hours: WebsiteHoursFrame;
  products: WebsiteProductFrame;
};
export type WebsitePreviewProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  imageUrls?: string[];
};
export type WebsiteVideo = {
  url: string | null;
  poster: string | null;
  caption: string;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  controls: boolean;
};
export type WebsitePlacePin = {
  id: string;
  label: string;
};

export type WebsitePlace = {
  source: "branch" | "custom";
  label: string;
  pins: WebsitePlacePin[];
};

export type WebsiteHeaderItem = {
  id: string;
  label: string;
  action: WebsiteHeaderAction;
  url: string;
  detail: string;
};

export type WebsiteContent = {
  order: WebsiteBodySectionKey[];
  hero: {
    imageUrl: string | null;
    primaryCta: string;
    primaryAction: WebsiteCtaAction;
    secondaryCta: string;
    secondaryAction: WebsiteCtaAction;
    align: "start" | "center";
    emphasis: "none" | "bold" | "italic";
    stack: WebsiteHeroSlot[];
    hidden: WebsiteHeroPiece[];
    imagePosition: WebsiteImagePosition;
  };
  header: { items: WebsiteHeaderItem[]; hiddenNav: WebsiteHeaderNavKey[]; showBooking: boolean };
  about: { heading: string; imageUrl: string | null; bullets: string[] };
  features: { items: { title: string; text: string }[] };
  testimonials: { items: { quote: string; name: string }[] };
  contact: { heading: string; description: string };
  booking: { heading: string; cta: string };
  services: { mode: "all" | "selected"; ids: string[]; images: Record<string, string> };
  products: { mode: "all" | "selected"; ids: string[]; images: Record<string, string>; descriptions: Record<string, string>; showPrice: boolean };
  social: {
    facebook: string;
    instagram: string;
    whatsapp: string;
    placement: WebsiteSocialPlacement;
  };
  channels: WebsiteChannel[];
  chat: { responseMode: WebsiteChatResponseMode; workflowId: string | null; anchor: WebsiteChatAnchor; side: WebsiteChatSide };
  frames: WebsiteFrames;
  video: WebsiteVideo;
  place: WebsitePlace;
  layout: { sizes: Partial<Record<WebsiteBodySectionKey, WebsiteSectionSize>> };
  appearance: {
    template: WebsiteTemplate;
    headerStyle: WebsiteHeaderStyle;
    titleScale: WebsiteTitleScale;
    bodyScale: WebsiteBodyScale;
    primary: string | null;
    secondary: string | null;
    background: string | null;
    text: string | null;
    heading: string | null;
    button: "solid" | "soft";
    radius: "md" | "lg" | "full";
    iconShape: "round" | "square";
    iconFill: "filled" | "outline";
  };
};

export type WebsitePublishBlocker =
  | "slug_invalid"
  | "slug_taken"
  | "origin_invalid"
  | "page_feature_off"
  | "chat_feature_off"
  | "ai_employee_required"
  | "workflow_required";

export type WebsiteSaveInput = {
  slug: string;
  sections: WebsiteSections;
  headline: string;
  description: string;
  greeting: string;
  aiEnabled: boolean;
  aiEmployeeId: string | null;
  gallery?: WebsiteGallery | null;
  content?: WebsiteContent | null;
  publish: boolean;
  origin: string | null;
  pageFeature: boolean;
  chatFeature: boolean;
  portalWasEnabled: boolean;
  widgetId: string | null;
  pageId: string | null;
  portalId: string | null;
};

export type WebsiteWidgetPlan = {
  id: string | null;
  provision: boolean;
  enabled: boolean;
  greeting: string;
  aiEmployeeId: string | null;
  aiEnabled: boolean;
  allowedOrigins: string[];
};

export type WebsiteSavePlan = {
  portal: { id: string | null; slug: string; enabled: boolean };
  widget: WebsiteWidgetPlan | null;
  page: {
    id: string | null;
    published: boolean;
    enabled: boolean;
    sections: WebsiteSections;
    headline: string | null;
    description: string | null;
    gallery: WebsiteGallery;
    content: WebsiteContent;
    portalId: string | null;
    widgetId: string | null;
  };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function defaultWebsiteSections(): WebsiteSections {
  return {
    about: true,
    features: false,
    gallery: false,
    services: true,
    testimonials: false,
    hours: true,
    location: true,
    contact: true,
    booking: false,
    video: false,
    products: false,
    chat: false,
  };
}

export function readWebsiteSections(value: unknown): WebsiteSections {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sections = defaultWebsiteSections();
  for (const key of WEBSITE_SECTION_KEYS) {
    if (typeof source[key] === "boolean") sections[key] = source[key];
  }
  return sections;
}

export function emptyWebsiteGallery(): WebsiteGallery {
  return { direction: "left", position: "center", slides: [] };
}

export function sanitizeWebsiteGallery(value: unknown): WebsiteGallery {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const direction: WebsiteGalleryDirection = source.direction === "right" ? "right" : "left";
  const position = readImagePosition(source.position);
  const rawSlides = Array.isArray(source.slides) ? source.slides : [];
  const slides: WebsiteGallerySlide[] = [];
  for (const item of rawSlides) {
    if (slides.length >= WEBSITE_GALLERY_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const slide = item as Record<string, unknown>;
    const url = typeof slide.url === "string" ? slide.url.trim() : "";
    if (!url || url.length > 2048 || !GALLERY_URL.test(url)) continue;
    const id = typeof slide.id === "string" && /^[0-9a-f-]{36}$/i.test(slide.id) ? slide.id : crypto.randomUUID();
    const alt = typeof slide.alt === "string" ? slide.alt.trim().slice(0, 120) : "";
    slides.push({ id, url, alt });
  }
  return { direction, position, slides };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readImageUrl(value: unknown): string | null {
  const url = clip(value, 2048);
  return url && GALLERY_URL.test(url) ? url : null;
}

function readCtaAction(value: unknown): WebsiteCtaAction {
  return WEBSITE_CTA_ACTIONS.includes(value as WebsiteCtaAction) ? (value as WebsiteCtaAction) : "none";
}

function readHttps(value: unknown): string {
  const url = clip(value, 300);
  if (/^http:\/\//i.test(url)) return "";
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  const bare = url.replace(/^\/\//, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(bare) ? `https://${bare}` : "";
}

export function readImagePosition(value: unknown): WebsiteImagePosition {
  return value === "left" || value === "right" ? value : "center";
}

function readWhatsapp(value: unknown): string {
  const digits = clip(value, 20).replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function readPlacement(value: unknown): WebsiteSocialPlacement {
  return WEBSITE_SOCIAL_PLACEMENTS.includes(value as WebsiteSocialPlacement) ? (value as WebsiteSocialPlacement) : "header";
}

function readProductDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const descriptions: Record<string, string> = {};
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(descriptions).length >= 24 || !UUID.test(key)) continue;
    const description = clip(text, 280);
    if (description) descriptions[key] = description;
  }
  return descriptions;
}

function readServiceImages(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const images: Record<string, string> = {};
  for (const [key, url] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(images).length >= 24 || !UUID.test(key)) continue;
    const image = readImageUrl(url);
    if (image) images[key] = image;
  }
  return images;
}

function readHeaderItems(value: unknown): WebsiteHeaderItem[] {
  if (!Array.isArray(value)) return [];
  const items: WebsiteHeaderItem[] = [];
  for (const item of value) {
    if (items.length >= 6 || !item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = clip(row.label, 40);
    if (!label) continue;
    const action: WebsiteHeaderAction = row.action === "url" ? "url" : readCtaAction(row.action);
    const url = action === "url" ? readHttps(row.url) : "";
    if (action === "none" || (action === "url" && !url)) continue;
    const id = typeof row.id === "string" && UUID.test(row.id) ? row.id : crypto.randomUUID();
    items.push({ id, label, action, url, detail: clip(row.detail, 180) });
  }
  return items;
}

export function websiteServiceImage(content: WebsiteContent, serviceId: string): string | null {
  return content.services.images[serviceId] ?? null;
}

export function websiteVisitorUrl(origin: string, slug: string): string | null {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}/site/${normalized}`;
  } catch {
    return null;
  }
}

const BRANCH_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function branchWebsiteFacts(branch: {
  address_line1?: string | null;
  city?: string | null;
  country?: string | null;
  settings?: unknown;
} | null): { locationLine: string | null; hours: Record<string, { open: string; close: string } | null> } {
  if (!branch) return { locationLine: null, hours: {} };
  const locationLine = [branch.address_line1, branch.city, branch.country].map((part) => part?.trim()).filter(Boolean).join(" · ") || null;
  const rawSettings = typeof branch.settings === "string"
    ? (() => { try { return JSON.parse(branch.settings) as unknown; } catch { return null; } })()
    : branch.settings;
  const settings = rawSettings && typeof rawSettings === "object" ? (rawSettings as Record<string, unknown>) : {};
  const weekly = Array.isArray(settings.weeklyHours) ? settings.weeklyHours : [];
  const hours: Record<string, { open: string; close: string } | null> = {};
  for (const item of weekly) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const day = Number(row.day_of_week);
    const key = BRANCH_DAYS[day];
    if (!key || row.is_closed === true) continue;
    const open = typeof row.opens_at === "string" ? row.opens_at.slice(0, 5) : "";
    const close = typeof row.closes_at === "string" ? row.closes_at.slice(0, 5) : "";
    if (open && close) hours[key] = { open, close };
  }
  return { locationLine, hours };
}

export function defaultWebsiteContent(): WebsiteContent {
  return {
    order: [...WEBSITE_BODY_SECTION_KEYS],
    hero: { imageUrl: null, primaryCta: "", primaryAction: "booking", secondaryCta: "", secondaryAction: "services", align: "start", emphasis: "none", stack: [...WEBSITE_HERO_SLOTS], hidden: [], imagePosition: "center" },
    header: { items: [], hiddenNav: [], showBooking: true },
    about: { heading: "", imageUrl: null, bullets: [] },
    features: { items: [] },
    testimonials: { items: [] },
    contact: { heading: "", description: "" },
    booking: { heading: "", cta: "" },
    services: { mode: "all", ids: [], images: {} },
    products: { mode: "all", ids: [], images: {}, descriptions: {}, showPrice: true },
    social: { facebook: "", instagram: "", whatsapp: "", placement: "header" },
    channels: [],
    chat: { responseMode: "ai_employee", workflowId: null, anchor: "fixed", side: "end" },
    frames: defaultWebsiteFrames(),
    video: defaultWebsiteVideo(),
    place: { source: "branch", label: "", pins: [] },
    layout: { sizes: {} },
    appearance: {
      template: "clinical",
      headerStyle: "split",
      titleScale: "lg",
      bodyScale: "md",
      primary: null,
      secondary: null,
      background: null,
      text: null,
      heading: null,
      button: "solid",
      radius: "lg",
      iconShape: "round",
      iconFill: "filled",
    },
  };
}

export function sanitizeWebsiteContent(value: unknown): WebsiteContent {
  const base = defaultWebsiteContent();
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const hero = source.hero && typeof source.hero === "object" ? (source.hero as Record<string, unknown>) : {};
  const about = source.about && typeof source.about === "object" ? (source.about as Record<string, unknown>) : {};
  const features = source.features && typeof source.features === "object" ? (source.features as Record<string, unknown>) : {};
  const testimonials = source.testimonials && typeof source.testimonials === "object" ? (source.testimonials as Record<string, unknown>) : {};
  const contact = source.contact && typeof source.contact === "object" ? (source.contact as Record<string, unknown>) : {};
  const booking = source.booking && typeof source.booking === "object" ? (source.booking as Record<string, unknown>) : {};
  const services = source.services && typeof source.services === "object" ? (source.services as Record<string, unknown>) : {};
  const products = source.products && typeof source.products === "object" ? (source.products as Record<string, unknown>) : {};
  const social = source.social && typeof source.social === "object" ? (source.social as Record<string, unknown>) : {};
  const chat = source.chat && typeof source.chat === "object" ? (source.chat as Record<string, unknown>) : {};
  const header = source.header && typeof source.header === "object" ? (source.header as Record<string, unknown>) : {};
  const appearance = source.appearance && typeof source.appearance === "object" ? (source.appearance as Record<string, unknown>) : {};
  const seen = new Set<WebsiteBodySectionKey>();
  const order: WebsiteBodySectionKey[] = [];
  for (const key of Array.isArray(source.order) ? source.order : base.order) {
    if (!WEBSITE_BODY_SECTION_KEYS.includes(key as WebsiteBodySectionKey) || seen.has(key as WebsiteBodySectionKey)) continue;
    seen.add(key as WebsiteBodySectionKey);
    order.push(key as WebsiteBodySectionKey);
  }
  for (const key of WEBSITE_BODY_SECTION_KEYS) {
    if (!seen.has(key)) order.push(key);
  }
  const hex = (raw: unknown) => {
    const color = clip(raw, 7);
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : null;
  };
  return {
    order,
    hero: {
      imageUrl: readImageUrl(hero.imageUrl),
      primaryCta: clip(hero.primaryCta, 40),
      primaryAction: readCtaAction(hero.primaryAction),
      secondaryCta: clip(hero.secondaryCta, 40),
      secondaryAction: readCtaAction(hero.secondaryAction),
      align: hero.align === "center" ? "center" : "start",
      emphasis: hero.emphasis === "bold" || hero.emphasis === "italic" ? hero.emphasis : "none",
      stack: readHeroStack(hero.stack),
      hidden: readHeroHidden(hero.hidden),
      imagePosition: readImagePosition(hero.imagePosition),
    },
    header: { items: readHeaderItems(header.items), hiddenNav: readHeaderNav(header.hiddenNav), showBooking: header.showBooking !== false },
    about: {
      heading: clip(about.heading, 80),
      imageUrl: readImageUrl(about.imageUrl),
      bullets: (Array.isArray(about.bullets) ? about.bullets : []).map((item) => clip(item, 120)).filter(Boolean).slice(0, 6),
    },
    features: {
      items: (Array.isArray(features.items) ? features.items : []).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const title = clip(row.title, 80);
        if (!title) return [];
        return [{ title, text: clip(row.text, 240) }];
      }).slice(0, 6),
    },
    testimonials: {
      items: (Array.isArray(testimonials.items) ? testimonials.items : []).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const quote = clip(row.quote, 280);
        if (!quote) return [];
        return [{ quote, name: clip(row.name, 80) }];
      }).slice(0, 6),
    },
    contact: { heading: clip(contact.heading, 80), description: clip(contact.description, 280) },
    booking: { heading: clip(booking.heading, 80), cta: clip(booking.cta, 40) },
    services: {
      mode: services.mode === "selected" ? "selected" : "all",
      ids: (Array.isArray(services.ids) ? services.ids : []).filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 24),
      images: readServiceImages(services.images),
    },
    products: {
      mode: products.mode === "selected" ? "selected" : "all",
      ids: (Array.isArray(products.ids) ? products.ids : []).filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 24),
      images: readServiceImages(products.images),
      descriptions: readProductDescriptions(products.descriptions),
      showPrice: products.showPrice !== false,
    },
    social: readSocial(social, source.channels),
    channels: readChannels(source.channels, social),
    chat: readChatResponse(chat),
    frames: readWebsiteFrames(source.frames),
    video: readWebsiteVideo(source.video),
    place: readWebsitePlace(source.place),
    layout: { sizes: readSectionSizes(source.layout) },
    appearance: {
      template: WEBSITE_TEMPLATES.includes(appearance.template as WebsiteTemplate) ? (appearance.template as WebsiteTemplate) : "clinical",
      headerStyle: WEBSITE_HEADER_STYLES.includes(appearance.headerStyle as WebsiteHeaderStyle) ? (appearance.headerStyle as WebsiteHeaderStyle) : "split",
      titleScale: WEBSITE_TITLE_SCALES.includes(appearance.titleScale as WebsiteTitleScale) ? (appearance.titleScale as WebsiteTitleScale) : "lg",
      bodyScale: WEBSITE_BODY_SCALES.includes(appearance.bodyScale as WebsiteBodyScale) ? (appearance.bodyScale as WebsiteBodyScale) : "md",
      primary: hex(appearance.primary),
      secondary: hex(appearance.secondary),
      background: hex(appearance.background),
      text: hex(appearance.text),
      heading: hex(appearance.heading),
      button: appearance.button === "soft" ? "soft" : "solid",
      radius: appearance.radius === "md" || appearance.radius === "full" ? appearance.radius : "lg",
      iconShape: appearance.iconShape === "square" ? "square" : "round",
      iconFill: appearance.iconFill === "outline" ? "outline" : "filled",
    },
  };
}

export function defaultWebsiteFrames(): WebsiteFrames {
  return {
    hero: "classic",
    services: "four",
    gallery: "reel",
    about: "text-image",
    contact: "details",
    booking: "cta",
    reviews: "cards",
    hours: "list",
    products: "shelf",
  };
}

export function defaultWebsiteVideo(): WebsiteVideo {
  return { url: null, poster: null, caption: "", autoplay: false, loop: false, muted: true, controls: true };
}

export function addWebsitePlacePin(place: WebsitePlace): WebsitePlace {
  const pins = place.pins ?? [];
  if (pins.length >= 6) return { ...place, pins };
  return { ...place, pins: [...pins, { id: `pin-${Date.now().toString(36)}`, label: "" }] };
}

function readWebsitePlace(value: unknown): WebsitePlace {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const pins = (Array.isArray(source.pins) ? source.pins : []).slice(0, 6).flatMap((row, index) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const id = clip(item.id, 40) || `pin-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: clip(item.label, 180) }];
  });
  return {
    source: source.source === "custom" ? "custom" : "branch",
    label: clip(source.label, 180),
    pins,
  };
}

function pickFrame<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function readWebsiteFrames(value: unknown): WebsiteFrames {
  const base = defaultWebsiteFrames();
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    hero: pickFrame(source.hero, WEBSITE_HERO_FRAMES, base.hero),
    services: pickFrame(source.services, WEBSITE_SERVICE_FRAMES, base.services),
    gallery: pickFrame(source.gallery, WEBSITE_GALLERY_FRAMES, base.gallery),
    about: pickFrame(source.about, WEBSITE_ABOUT_FRAMES, base.about),
    contact: pickFrame(source.contact, WEBSITE_CONTACT_FRAMES, base.contact),
    booking: pickFrame(source.booking, WEBSITE_BOOKING_FRAMES, base.booking),
    reviews: pickFrame(source.reviews, WEBSITE_REVIEW_FRAMES, base.reviews),
    hours: pickFrame(source.hours, WEBSITE_HOURS_FRAMES, base.hours),
    products: pickFrame(source.products, WEBSITE_PRODUCT_FRAMES, base.products),
  };
}

export function readWebsiteVideo(value: unknown): WebsiteVideo {
  const base = defaultWebsiteVideo();
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    url: readImageUrl(source.url),
    poster: readImageUrl(source.poster),
    caption: clip(source.caption, 160),
    autoplay: source.autoplay === true,
    loop: source.loop === true,
    muted: source.muted !== false,
    controls: source.controls !== false,
  };
}

/** Changes one section layout. Headlines, images, services, and copy stay as they are. */
export function applySectionFrame<K extends keyof WebsiteFrames>(content: WebsiteContent, section: K, frame: WebsiteFrames[K]): WebsiteContent {
  return { ...content, frames: { ...content.frames, [section]: frame } };
}

function readChatResponse(chat: Record<string, unknown>): WebsiteContent["chat"] {
  const explicit = chat.responseMode === "workflow" || chat.responseMode === "ai_employee"
    ? chat.responseMode
    : chat.responder === "workflow"
      ? "workflow"
      : "ai_employee";
  const workflowId = UUID.test(clip(chat.workflowId, 36)) ? clip(chat.workflowId, 36) : null;
  const anchor = chat.anchor === "flow" ? "flow" : "fixed";
  const side = chat.side === "start" ? "start" : "end";
  if (explicit === "workflow") return { responseMode: "workflow", workflowId, anchor, side };
  return { responseMode: "ai_employee", workflowId: null, anchor, side };
}

function readSocial(social: Record<string, unknown>, channels: unknown): WebsiteContent["social"] {
  const parsed = readChannels(channels, social);
  const value = (id: WebsiteChannelId) => parsed.find((channel) => channel.id === id)?.value ?? "";
  return {
    facebook: value("facebook") || readHttps(social.facebook),
    instagram: value("instagram") || readHttps(social.instagram),
    whatsapp: value("whatsapp") || readWhatsapp(social.whatsapp),
    placement: readPlacement(social.placement),
  };
}

function readChannelValue(id: WebsiteChannelId, value: unknown): string {
  if (id === "whatsapp" || id === "phone") return readWhatsapp(value);
  if (id === "email") {
    const email = clip(value, 120);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }
  if (id === "telegram") {
    const handle = clip(value, 80).replace(/^@/, "");
    if (/^[A-Za-z0-9_]{4,32}$/.test(handle)) return handle;
    return readHttps(value);
  }
  return readHttps(value);
}

function readChannels(value: unknown, social: Record<string, unknown>): WebsiteChannel[] {
  const channels: WebsiteChannel[] = [];
  const seen = new Set<WebsiteChannelId>();
  const push = (id: WebsiteChannelId, raw: unknown) => {
    if (seen.has(id) || channels.length >= 8) return;
    const next = readChannelValue(id, raw);
    if (!next) return;
    seen.add(id);
    channels.push({ id, value: next });
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = row.id as WebsiteChannelId;
      if (!WEBSITE_CHANNEL_IDS.includes(id) || row.enabled === false || seen.has(id) || channels.length >= 8) continue;
      const raw = typeof row.value === "string" ? row.value : "";
      seen.add(id);
      channels.push({ id, value: readChannelValue(id, raw) || clip(raw, 300) });
    }
  }
  push("facebook", social.facebook);
  push("instagram", social.instagram);
  push("whatsapp", social.whatsapp);
  return channels;
}

function readSectionSizes(value: unknown): WebsiteContent["layout"]["sizes"] {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>).sizes : null;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const sizes: WebsiteContent["layout"]["sizes"] = {};
  for (const key of WEBSITE_BODY_SECTION_KEYS) {
    const size = (source as Record<string, unknown>)[key];
    if (size === "sm" || size === "md" || size === "lg") sizes[key] = size;
  }
  return sizes;
}

export function websiteChannelHref(channel: WebsiteChannel): string | null {
  if (!channel.value.trim()) return null;
  if (channel.id === "whatsapp" || channel.id === "phone") {
    const digits = channel.value.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return channel.id === "whatsapp" ? `https://wa.me/${digits}` : `tel:+${digits}`;
  }
  if (channel.id === "email") return `mailto:${channel.value}`;
  if (channel.id === "telegram" && !channel.value.startsWith("https://")) return `https://t.me/${channel.value.replace(/^@/, "")}`;
  if (channel.value.startsWith("https://")) return channel.value;
  if (/^http:\/\//i.test(channel.value)) return null;
  const bare = channel.value.trim().replace(/^\/\//, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(bare) ? `https://${bare}` : null;
}

export function reorderChannels(channels: WebsiteChannel[], from: WebsiteChannelId, to: WebsiteChannelId): WebsiteChannel[] {
  if (from === to) return channels;
  const start = channels.findIndex((channel) => channel.id === from);
  const end = channels.findIndex((channel) => channel.id === to);
  if (start < 0 || end < 0) return channels;
  const copy = [...channels];
  const [item] = copy.splice(start, 1);
  if (!item) return channels;
  copy.splice(end, 0, item);
  return copy;
}

const PALETTE_SECTION: Partial<Record<string, WebsiteBodySectionKey | "chat">> = {
  about: "about",
  features: "features",
  services: "services",
  gallery: "gallery",
  testimonials: "testimonials",
  hours: "hours",
  location: "location",
  contact: "contact",
  booking: "booking",
  video: "video",
  products: "products",
  chat: "chat",
};

/** Enables a supported block and moves its section. Unsupported blocks return null. */
export function placeWebsiteBlock(
  order: WebsiteBodySectionKey[],
  sections: WebsiteSections,
  block: string,
  before: WebsiteBodySectionKey | null,
): { order: WebsiteBodySectionKey[]; sections: WebsiteSections } | null {
  const key = PALETTE_SECTION[block];
  if (!key) return null;
  const nextSections = { ...sections, [key]: true };
  if (key === "chat") return { order, sections: nextSections };
  const nextOrder = order.includes(key) ? order : [...order, key];
  return {
    order: before && before !== key ? reorderWebsiteSections(nextOrder, key, before) : nextOrder,
    sections: nextSections,
  };
}

export function reorderWebsiteSections(order: WebsiteBodySectionKey[], from: WebsiteBodySectionKey, to: WebsiteBodySectionKey): WebsiteBodySectionKey[] {
  if (from === to) return order;
  const start = order.indexOf(from);
  const end = order.indexOf(to);
  if (start < 0 || end < 0) return order;
  const copy = [...order];
  const [item] = copy.splice(start, 1);
  if (!item) return order;
  copy.splice(end, 0, item);
  return copy;
}

export const WEBSITE_TEMPLATE_PRESETS: Record<WebsiteTemplate, Pick<WebsiteContent["appearance"], "template" | "headerStyle" | "titleScale" | "bodyScale" | "primary" | "secondary" | "background" | "text" | "heading" | "button" | "radius">> = {
  clinical: { template: "clinical", headerStyle: "split", titleScale: "lg", bodyScale: "md", primary: "#0D9488", secondary: "#134E4A", background: "#F8FAFC", text: "#0F172A", heading: "#0F172A", button: "solid", radius: "lg" },
  editorial: { template: "editorial", headerStyle: "center", titleScale: "xl", bodyScale: "md", primary: "#1C1917", secondary: "#78716C", background: "#FAF7F2", text: "#1C1917", heading: "#1C1917", button: "soft", radius: "md" },
  midnight: { template: "midnight", headerStyle: "pill", titleScale: "lg", bodyScale: "sm", primary: "#2DD4BF", secondary: "#CCFBF1", background: "#0B1220", text: "#F8FAFC", heading: "#F8FAFC", button: "solid", radius: "full" },
  atelier: { template: "atelier", headerStyle: "overlay", titleScale: "xl", bodyScale: "md", primary: "#111827", secondary: "#6B7280", background: "#F4F1EA", text: "#111827", heading: "#111827", button: "soft", radius: "lg" },
};

export function applyWebsiteTemplate(content: WebsiteContent, template: WebsiteTemplate): WebsiteContent {
  return { ...content, appearance: { ...content.appearance, ...WEBSITE_TEMPLATE_PRESETS[template] } };
}

export function visibleWebsiteProducts<T extends { id: string }>(products: T[], content: WebsiteContent): T[] {
  const selection = content.products ?? { mode: "all" as const, ids: [], images: {}, descriptions: {}, showPrice: true };
  const byId = new Map(products.map((product) => [product.id, product]));
  const picked = selection.ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
  if (selection.mode === "selected") return picked;
  if (picked.length === 0) return products;
  const seen = new Set(picked.map((product) => product.id));
  return [...picked, ...products.filter((product) => !seen.has(product.id))];
}

export function reorderWebsiteProducts(content: WebsiteContent, catalogIds: string[], fromId: string, toId: string): WebsiteContent["products"] {
  const selection = content.products ?? { mode: "all" as const, ids: [], images: {}, descriptions: {}, showPrice: true };
  const known = new Set(catalogIds);
  const current = selection.ids.filter((id) => known.has(id));
  const base = selection.mode === "selected" ? current : [...current, ...catalogIds.filter((id) => !current.includes(id))];
  const start = base.indexOf(fromId);
  const end = base.indexOf(toId);
  if (start < 0 || end < 0) return selection;
  return { ...selection, ids: reorderIndexed(base, start, end) };
}

export function websiteCatalogImages(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const images: string[] = [];
  for (const url of urls) {
    const image = readImageUrl(url);
    if (!image || images.includes(image)) continue;
    images.push(image);
    if (images.length >= 5) break;
  }
  return images;
}

export function websiteCatalogImage(urls: unknown): string | null {
  return websiteCatalogImages(urls)[0] ?? null;
}

/** Site override replaces catalog photos in the published page only. Clearing it restores catalog photos. */
export function websiteProductDisplayImages(
  catalogUrls: unknown,
  overrideUrl: string | null | undefined,
): string[] {
  const override = typeof overrideUrl === "string" ? overrideUrl.trim() : "";
  if (override) return [override];
  return websiteCatalogImages(catalogUrls);
}

export function parseWebsiteProducts(value: unknown): WebsitePreviewProduct[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return [];
    const price = typeof row.price === "number" ? row.price : Number(row.price);
    const imageUrls = Array.isArray(row.imageUrls)
      ? row.imageUrls.map((url) => readImageUrl(url)).filter((url): url is string => Boolean(url)).slice(0, 5)
      : [];
    const imageUrl = readImageUrl(row.imageUrl) ?? imageUrls[0] ?? null;
    return [{
      id,
      name: name.slice(0, 120),
      description: typeof row.description === "string" ? row.description.trim().slice(0, 280) : "",
      price: Number.isFinite(price) ? price : 0,
      currency: typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().slice(0, 8) : "USD",
      imageUrl,
      imageUrls: imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [],
    }];
  }).slice(0, 24);
}

export function visibleWebsiteServices<T extends { id: string }>(services: T[], content: WebsiteContent): T[] {
  const byId = new Map(services.map((service) => [service.id, service]));
  const picked = content.services.ids.flatMap((id) => {
    const service = byId.get(id);
    return service ? [service] : [];
  });
  if (content.services.mode === "selected") return picked;
  if (picked.length === 0) return services;
  const seen = new Set(picked.map((service) => service.id));
  return [...picked, ...services.filter((service) => !seen.has(service.id))];
}

export function readHeroHidden(value: unknown): WebsiteHeroPiece[] {
  const seen = new Set<WebsiteHeroPiece>();
  const hidden: WebsiteHeroPiece[] = [];
  if (!Array.isArray(value)) return hidden;
  for (const item of value) {
    if (!WEBSITE_HERO_PIECES.includes(item as WebsiteHeroPiece) || seen.has(item as WebsiteHeroPiece)) continue;
    seen.add(item as WebsiteHeroPiece);
    hidden.push(item as WebsiteHeroPiece);
  }
  return hidden;
}

export function readHeaderNav(value: unknown): WebsiteHeaderNavKey[] {
  const seen = new Set<WebsiteHeaderNavKey>();
  const hidden: WebsiteHeaderNavKey[] = [];
  if (!Array.isArray(value)) return hidden;
  for (const item of value) {
    if (!WEBSITE_HEADER_NAV.includes(item as WebsiteHeaderNavKey) || seen.has(item as WebsiteHeaderNavKey)) continue;
    seen.add(item as WebsiteHeaderNavKey);
    hidden.push(item as WebsiteHeaderNavKey);
  }
  return hidden;
}

export function readHeroStack(value: unknown): WebsiteHeroSlot[] {
  const seen = new Set<WebsiteHeroSlot>();
  const stack: WebsiteHeroSlot[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!WEBSITE_HERO_SLOTS.includes(item as WebsiteHeroSlot) || seen.has(item as WebsiteHeroSlot)) continue;
      seen.add(item as WebsiteHeroSlot);
      stack.push(item as WebsiteHeroSlot);
    }
  }
  for (const slot of WEBSITE_HERO_SLOTS) {
    if (!seen.has(slot)) stack.push(slot);
  }
  return stack;
}

export function reorderHeroSlots(stack: WebsiteHeroSlot[], from: WebsiteHeroSlot, to: WebsiteHeroSlot): WebsiteHeroSlot[] {
  return readHeroStack(reorderIndexed(stack, stack.indexOf(from), stack.indexOf(to)));
}

export function reorderIndexed<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  if (item === undefined) return items;
  copy.splice(to, 0, item);
  return copy;
}

export function reorderGallerySlides(gallery: WebsiteGallery, fromId: string, toId: string): WebsiteGallery {
  const start = gallery.slides.findIndex((slide) => slide.id === fromId);
  const end = gallery.slides.findIndex((slide) => slide.id === toId);
  if (start < 0 || end < 0) return gallery;
  return { ...gallery, slides: reorderIndexed(gallery.slides, start, end) };
}

/** Reorders presentation only. Selected mode stays a subset; all mode keeps every catalog id. */
export function reorderWebsiteServices(content: WebsiteContent, catalogIds: string[], fromId: string, toId: string): WebsiteContent["services"] {
  const known = new Set(catalogIds);
  const current = content.services.ids.filter((id) => known.has(id));
  const base = content.services.mode === "selected" ? current : [...current, ...catalogIds.filter((id) => !current.includes(id))];
  const start = base.indexOf(fromId);
  const end = base.indexOf(toId);
  if (start < 0 || end < 0) return content.services;
  return { ...content.services, ids: reorderIndexed(base, start, end) };
}

export function moveWebsiteSection(order: WebsiteBodySectionKey[], key: WebsiteBodySectionKey, direction: -1 | 1): WebsiteBodySectionKey[] {
  const index = order.indexOf(key);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return order;
  const copy = [...order];
  const [item] = copy.splice(index, 1);
  if (!item) return order;
  copy.splice(next, 0, item);
  return copy;
}

export function normalizeWebsiteSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 2 || slug.length > 48 || !SLUG_PATTERN.test(slug)) return null;
  return slug;
}

/** Same origin shape the widget allow-list accepts. Reserved hosts are not added here. */
export function canonicalWebsiteOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const host = url.hostname.toLowerCase();
  if (url.protocol === "http:") {
    if (host !== "localhost" && host !== "127.0.0.1") return null;
  } else if (url.protocol === "https:") {
    if (!HTTPS_HOST.test(host)) return null;
  } else {
    return null;
  }
  const origin = `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
  return origin.length <= 253 ? origin : null;
}

export function reservedWebsiteHost(slug: string): string {
  return `${slug}.valueor.site`;
}

/**
 * Resolve a public website slug from the browser hostname when using reserved
 * `*.valueor.site` hosts (or local aliases). Path `/site/:slug` remains primary.
 */
export function resolveWebsiteSlugFromHostname(
  hostname: string,
  reservedRoot = "valueor.site",
): string | null {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  const root = reservedRoot.trim().toLowerCase();
  if (!host.endsWith(`.${root}`)) return null;
  const subdomain = host.slice(0, -(root.length + 1));
  if (!subdomain || subdomain.includes(".")) return null;
  return normalizeWebsiteSlug(subdomain);
}

export function isPublicCompanyWebsitePath(path: string): boolean {
  const pathname = (path.split("?")[0] ?? path).split("#")[0] ?? path;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return /^\/site\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(normalized);
}

export function planWebsiteSave(
  input: WebsiteSaveInput,
): { ok: true; plan: WebsiteSavePlan } | { ok: false; blockers: WebsitePublishBlocker[] } {
  const slug = normalizeWebsiteSlug(input.slug);
  const blockers: WebsitePublishBlocker[] = [];
  if (!slug) blockers.push("slug_invalid");

  const origin = canonicalWebsiteOrigin(input.origin);
  const chatOn = input.sections.chat;
  const content = sanitizeWebsiteContent(input.content);
  const workflowReply = content.chat.responseMode === "workflow";
  if (input.publish) {
    if (!input.pageFeature) blockers.push("page_feature_off");
    if (chatOn && !input.chatFeature) blockers.push("chat_feature_off");
    if (chatOn && !origin) blockers.push("origin_invalid");
    if (chatOn && workflowReply && !content.chat.workflowId) blockers.push("workflow_required");
    if (chatOn && !workflowReply && !input.aiEmployeeId) blockers.push("ai_employee_required");
  }
  if (blockers.length || !slug) return { ok: false, blockers };

  const activateChat = Boolean(input.publish && chatOn);
  const keepWidget = Boolean(input.widgetId) || (chatOn && input.chatFeature);
  const reservedOrigin = slug ? `https://${reservedWebsiteHost(slug)}` : null;
  const allowedOrigins =
    activateChat && origin
      ? Array.from(new Set([origin, reservedOrigin].filter((value): value is string => Boolean(value))))
      : [];
  const widget: WebsiteWidgetPlan | null = keepWidget
    ? {
        id: input.widgetId,
        provision: !input.widgetId && chatOn && input.chatFeature,
        enabled: activateChat,
        greeting: input.greeting.trim().slice(0, 1000),
        aiEmployeeId: workflowReply ? null : input.aiEmployeeId,
        aiEnabled: !workflowReply && Boolean(input.aiEmployeeId),
        allowedOrigins,
      }
    : null;

  return {
    ok: true,
    plan: {
      portal: {
        id: input.portalId,
        slug,
        enabled: input.portalWasEnabled || input.publish,
      },
      widget,
      page: {
        id: input.pageId,
        published: input.publish,
        enabled: true,
        sections: input.sections,
        headline: input.headline.trim().slice(0, 160) || null,
        description: input.description.trim().slice(0, 2000) || null,
        gallery: sanitizeWebsiteGallery(input.gallery),
        content,
        portalId: input.portalId,
        widgetId: input.widgetId,
      },
    },
  };
}

export type PublicWebsiteService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

export type PublicWebsite = {
  slug: string;
  name: string;
  headline: string;
  description: string;
  coverImageUrl: string | null;
  sections: WebsiteSections;
  branding: { logoUrl: string | null; primaryColor: string | null; coverImageUrl: string | null };
  location: { address: string | null; city: string | null };
  services: PublicWebsiteService[];
  reservedHost: string;
  bookingPath: string;
  gallery: WebsiteGallery;
  content: WebsiteContent;
  workingHours: Record<string, { open: string; close: string } | null>;
  chat: { publicKey: string; greeting: string; assistant: boolean } | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const BRAND_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function readHexColor(value: unknown): string | null {
  const color = readString(value);
  return color && BRAND_HEX.test(color) ? color : null;
}

/** Brand Center (`companies`) is the source. Portal branding is only the existing copy. */
export function resolveWebsiteBranding(input: {
  companyLogoUrl?: string | null;
  companyBranding?: unknown;
  portalBranding?: unknown;
  pageCoverUrl?: string | null;
}): { logoUrl: string | null; coverImageUrl: string | null; primaryColor: string | null } {
  const company = readRecord(input.companyBranding);
  const logos = readRecord(company.logos);
  const colors = readRecord(company.colors);
  const portal = readRecord(input.portalBranding);
  return {
    logoUrl: readString(logos.main) ?? readString(input.companyLogoUrl) ?? readString(portal.logoUrl),
    coverImageUrl: readString(portal.coverImageUrl) ?? readString(input.pageCoverUrl),
    primaryColor: readHexColor(colors.primary) ?? readHexColor(portal.primaryColor),
  };
}

function readWorkingHours(value: unknown): PublicWebsite["workingHours"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const hours: PublicWebsite["workingHours"] = {};
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== "object") {
      hours[key] = null;
      continue;
    }
    const open = readString((row as Record<string, unknown>).open);
    const close = readString((row as Record<string, unknown>).close);
    hours[key] = open && close ? { open, close } : null;
  }
  return hours;
}

export function parsePublicWebsite(data: unknown): PublicWebsite | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const slug = readString(row.slug);
  if (!slug || !normalizeWebsiteSlug(slug)) return null;
  const chatRaw = row.chat;
  let chat: PublicWebsite["chat"] = null;
  if (chatRaw && typeof chatRaw === "object") {
    const chatRow = chatRaw as Record<string, unknown>;
    const publicKey = readString(chatRow.publicKey);
    if (publicKey && /^wcw_[0-9a-f]{48}$/.test(publicKey)) {
      chat = {
        publicKey,
        greeting: readString(chatRow.greeting) ?? "",
        assistant: chatRow.assistant === true,
      };
    }
  }
  const branding = row.branding && typeof row.branding === "object" ? (row.branding as Record<string, unknown>) : {};
  const location = row.location && typeof row.location === "object" ? (row.location as Record<string, unknown>) : {};
  const services = Array.isArray(row.services)
    ? row.services.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const service = item as Record<string, unknown>;
        const name = readString(service.name);
        if (!name) return [];
        const id = readString(service.id) ?? name;
        return [{
          id,
          name,
          description: readString(service.description) ?? "",
          durationMinutes: typeof service.durationMinutes === "number" ? service.durationMinutes : 0,
          priceCents: typeof service.priceCents === "number" ? service.priceCents : 0,
          currency: readString(service.currency) ?? "USD",
        }];
      })
    : [];
  return {
    slug,
    name: readString(row.name) ?? slug,
    headline: readString(row.headline) ?? readString(row.name) ?? slug,
    description: readString(row.description) ?? "",
    coverImageUrl: readString(row.coverImageUrl),
    sections: readWebsiteSections(row.sections),
    branding: {
      logoUrl: readString(branding.logoUrl),
      primaryColor: readString(branding.primaryColor),
      coverImageUrl: readString(branding.coverImageUrl),
    },
    location: {
      address: readString(location.address),
      city: readString(location.city),
    },
    services,
    gallery: sanitizeWebsiteGallery(row.gallery),
    content: sanitizeWebsiteContent(row.content),
    workingHours: readWorkingHours(row.workingHours),
    reservedHost: readString(row.reservedHost) ?? reservedWebsiteHost(slug),
    bookingPath: readString(row.bookingPath) ?? `/book/${slug}`,
    chat,
  };
}
