import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  canonicalWebsiteOrigin,
  isPublicCompanyWebsitePath,
  normalizeWebsiteSlug,
  parsePublicWebsite,
  applySectionFrame,
  applyWebsiteTemplate,
  moveWebsiteSection,
  reorderGallerySlides,
  reorderHeroSlots,
  reorderIndexed,
  reorderWebsiteSections,
  reorderWebsiteServices,
  planWebsiteSave,
  reservedWebsiteHost,
  resolveWebsiteBranding,
  websiteChannelHref,
  websiteCatalogImages,
  websiteProductDisplayImages,
  websiteVisitorUrl,
  branchWebsiteFacts,
  sanitizeWebsiteContent,
  visibleWebsiteServices,
  sanitizeWebsiteGallery,
  type WebsiteSaveInput,
} from "./website-model.js";

const base: WebsiteSaveInput = {
  slug: "Dr Ahmed",
  sections: {
    about: true,
    services: true,
    hours: true,
    location: true,
    contact: true,
    booking: true,
    gallery: false,
    chat: true,
  },
  headline: "Clinic",
  description: "Care",
  greeting: "Hello",
  aiEnabled: true,
  aiEmployeeId: "emp-1",
  publish: true,
  origin: "http://localhost:5173",
  pageFeature: true,
  chatFeature: true,
  portalWasEnabled: false,
  widgetId: null,
  pageId: null,
  portalId: null,
};

describe("website save plan", () => {
  it("reserves the slug host and opens chat only on the current preview origin", () => {
    const result = planWebsiteSave(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.portal.slug, "dr-ahmed");
    assert.equal(reservedWebsiteHost(result.plan.portal.slug), "dr-ahmed.valueor.site");
    assert.deepEqual(result.plan.widget?.allowedOrigins, ["http://localhost:5173"]);
    assert.equal(result.plan.widget?.provision, true);
    assert.equal(result.plan.widget?.enabled, true);
    assert.equal(result.plan.page.published, true);
  });

  it("refuses a public site when the page feature or a published employee is missing", () => {
    const missingFeature = planWebsiteSave({ ...base, pageFeature: false });
    assert.equal(missingFeature.ok, false);
    if (missingFeature.ok) return;
    assert.ok(missingFeature.blockers.includes("page_feature_off"));

    const missingEmployee = planWebsiteSave({ ...base, aiEmployeeId: null });
    assert.equal(missingEmployee.ok, false);
    if (missingEmployee.ok) return;
    assert.ok(missingEmployee.blockers.includes("ai_employee_required"));
  });

  it("keeps AI Employee and Workflow mutually exclusive", () => {
    const workflow = planWebsiteSave({
      ...base,
      aiEmployeeId: "emp-1",
      content: sanitizeWebsiteContent({
        chat: { responseMode: "workflow", workflowId: "22222222-2222-4222-8222-222222222222" },
      }),
    });
    assert.equal(workflow.ok, true);
    if (!workflow.ok) return;
    assert.equal(workflow.plan.widget?.aiEmployeeId, null);
    assert.equal(workflow.plan.widget?.aiEnabled, false);
    assert.equal(workflow.plan.page.content.chat.responseMode, "workflow");

    const ai = sanitizeWebsiteContent({
      chat: { responseMode: "ai_employee", workflowId: "22222222-2222-4222-8222-222222222222" },
    });
    assert.equal(ai.chat.responseMode, "ai_employee");
    assert.equal(ai.chat.workflowId, null);

    const missingWorkflow = planWebsiteSave({
      ...base,
      content: sanitizeWebsiteContent({ chat: { responseMode: "workflow", workflowId: null } }),
    });
    assert.equal(missingWorkflow.ok, false);
    if (missingWorkflow.ok) return;
    assert.ok(missingWorkflow.blockers.includes("workflow_required"));

    const draft = planWebsiteSave({ ...base, publish: false, aiEmployeeId: null });
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    assert.equal(draft.plan.page.published, false);
    assert.equal(draft.plan.widget?.enabled, false);
  });

  it("keeps an unpublished draft from enabling the widget", () => {
    const result = planWebsiteSave({ ...base, publish: false, widgetId: "widget-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.page.published, false);
    assert.equal(result.plan.widget?.enabled, false);
    assert.deepEqual(result.plan.widget?.allowedOrigins, []);
    assert.equal(result.plan.widget?.greeting, "Hello");
    assert.equal(result.plan.widget?.aiEmployeeId, "emp-1");
    assert.equal(result.plan.portal.enabled, false);
  });

  it("keeps chat settings on a disabled widget when the draft has no widget yet", () => {
    const result = planWebsiteSave({ ...base, publish: false });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.page.published, false);
    assert.equal(result.plan.widget?.provision, true);
    assert.equal(result.plan.widget?.enabled, false);
    assert.deepEqual(result.plan.widget?.allowedOrigins, []);
    assert.equal(result.plan.widget?.greeting, "Hello");
    assert.equal(result.plan.widget?.aiEmployeeId, "emp-1");
    assert.equal(result.plan.portal.enabled, false);
  });

  it("does not create a widget during draft when the chat feature is off", () => {
    const result = planWebsiteSave({ ...base, publish: false, chatFeature: false });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.widget, null);
    assert.equal(result.plan.page.published, false);
  });

  it("does not turn off a booking portal that was already live", () => {
    const result = planWebsiteSave({ ...base, publish: false, portalWasEnabled: true, widgetId: "widget-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.portal.enabled, true);
  });

  it("accepts localhost and rejects a LAN origin", () => {
    assert.equal(canonicalWebsiteOrigin("http://localhost:5173/site/dr-ahmed"), null);
    assert.equal(canonicalWebsiteOrigin("http://localhost:5173"), "http://localhost:5173");
    assert.equal(canonicalWebsiteOrigin("http://192.168.1.5:5173"), null);
    assert.equal(canonicalWebsiteOrigin("https://dr-ahmed.valueor.site"), "https://dr-ahmed.valueor.site");
  });

  it("keeps a safe gallery and drops anything that is not a public image", () => {
    const gallery = sanitizeWebsiteGallery({
      direction: "right",
      slides: [
        { id: "11111111-1111-4111-8111-111111111111", url: "https://cdn.example.com/a.jpg", alt: "Lobby" },
        { url: "javascript:alert(1)", alt: "no" },
        { url: "http://192.168.1.5/a.jpg", alt: "lan" },
      ],
    });
    assert.equal(gallery.direction, "right");
    assert.equal(gallery.slides.length, 1);
    assert.equal(gallery.slides[0]?.alt, "Lobby");
    const site = parsePublicWebsite({
      slug: "dr-ahmed",
      gallery,
      workingHours: { monday: { open: "09:00", close: "17:00" } },
    });
    assert.equal(site?.gallery.slides.length, 1);
    assert.equal(site?.workingHours.monday?.open, "09:00");
  });

  it("recognizes the public site path and ignores chat payloads without a widget key", () => {
    assert.equal(isPublicCompanyWebsitePath("/site/dr-ahmed"), true);
    assert.equal(isPublicCompanyWebsitePath("/site/dr-ahmed/"), true);
    assert.equal(isPublicCompanyWebsitePath("/dashboard/website"), false);
    const site = parsePublicWebsite({
      slug: "dr-ahmed",
      name: "Dr Ahmed",
      chat: { greeting: "Hi" },
      company_id: "should-not-matter",
    });
    assert.equal(site?.chat, null);
    assert.equal(site?.slug, "dr-ahmed");
    assert.equal(normalizeWebsiteSlug("  "), null);
  });
});

describe("website branding", () => {
  it("uses company brand center ahead of the portal copy", () => {
    const branding = resolveWebsiteBranding({
      companyLogoUrl: "https://cdn.example.com/logo.png",
      companyBranding: {
        logos: { main: "https://cdn.example.com/main.png" },
        colors: { primary: "#0D9488" },
      },
      portalBranding: {
        logoUrl: "https://cdn.example.com/old.png",
        primaryColor: "#6366f1",
        coverImageUrl: "https://cdn.example.com/cover.jpg",
      },
    });
    assert.equal(branding.logoUrl, "https://cdn.example.com/main.png");
    assert.equal(branding.primaryColor, "#0D9488");
    assert.equal(branding.coverImageUrl, "https://cdn.example.com/cover.jpg");
  });

  it("falls back to the company logo and ignores a color that is not hex", () => {
    const branding = resolveWebsiteBranding({
      companyLogoUrl: "https://cdn.example.com/logo.png",
      companyBranding: { colors: { primary: "teal" } },
      portalBranding: {},
      pageCoverUrl: "https://cdn.example.com/page-cover.jpg",
    });
    assert.equal(branding.logoUrl, "https://cdn.example.com/logo.png");
    assert.equal(branding.primaryColor, null);
    assert.equal(branding.coverImageUrl, "https://cdn.example.com/page-cover.jpg");
  });
});

describe("website studio content", () => {
  it("keeps section order, drops unknown keys, and hides unselected services", () => {
    const content = sanitizeWebsiteContent({
      order: ["booking", "services", "nope", "booking"],
      services: { mode: "selected", ids: ["11111111-1111-4111-8111-111111111111", "bad"] },
      appearance: { primary: "teal", secondary: "#134E4A" },
      hero: { imageUrl: "javascript:alert(1)", primaryCta: "Book", primaryAction: "booking" },
    });
    assert.equal(content.order[0], "booking");
    assert.equal(content.order[1], "services");
    assert.equal(content.order.includes("about"), true);
    assert.equal(content.services.ids.length, 1);
    assert.equal(content.appearance.primary, null);
    assert.equal(content.appearance.secondary, "#134E4A");
    assert.equal(content.hero.imageUrl, null);
    assert.equal(content.hero.primaryAction, "booking");
    const visible = visibleWebsiteServices(
      [
        { id: "22222222-2222-4222-8222-222222222222", name: "Hidden" },
        { id: "11111111-1111-4111-8111-111111111111", name: "Shown" },
      ],
      content,
    );
    assert.deepEqual(visible.map((service) => service.name), ["Shown"]);
    assert.deepEqual(moveWebsiteSection(["about", "services", "booking"], "booking", -1).slice(0, 2), ["about", "booking"]);
  });

  it("builds the reserved host from the portal slug", () => {
    assert.equal(reservedWebsiteHost("dr-ahmed"), "dr-ahmed.valueor.site");
    assert.equal(websiteVisitorUrl("http://localhost:5173", "dr-ahmed"), "http://localhost:5173/site/dr-ahmed");
  });

  it("keeps a service photo, a header button, and a whatsapp number", () => {
    const content = sanitizeWebsiteContent({
      services: { images: { "11111111-1111-4111-8111-111111111111": "https://cdn.example.com/svc.jpg", bad: "javascript:alert(1)" } },
      social: { whatsapp: "+20 100 123 4567", facebook: "http://facebook.com/x", placement: "footer" },
      header: { items: [{ label: "Services", action: "services", detail: "Prices" }] },
      chat: { responder: "workflow", workflowId: "22222222-2222-4222-8222-222222222222" },
    });
    assert.equal(content.services.images["11111111-1111-4111-8111-111111111111"], "https://cdn.example.com/svc.jpg");
    assert.equal(content.social.whatsapp, "201001234567");
    assert.equal(content.frames.hours, "list");
    assert.equal(content.chat.anchor, "fixed");
    assert.equal(websiteChannelHref({ id: "phone", value: "+20 100 123 4567" }), "tel:+201001234567");
    assert.equal(websiteChannelHref({ id: "whatsapp", value: "+20 100 123 4567" }), "https://wa.me/201001234567");
    assert.equal(content.social.facebook, "");
    assert.equal(sanitizeWebsiteContent({ social: { facebook: "facebook.com/valueor" } }).social.facebook, "https://facebook.com/valueor");
    assert.equal(sanitizeWebsiteGallery({ position: "left", direction: "left", slides: [] }).position, "left");
    assert.equal(content.social.placement, "footer");
    assert.equal(content.header.items[0]?.label, "Services");
    assert.equal(content.chat.responseMode, "workflow");
    assert.equal(content.chat.workflowId, "22222222-2222-4222-8222-222222222222");
    assert.equal(branchWebsiteFacts({
      address_line1: "12 Street",
      city: "Cairo",
      settings: { weeklyHours: [{ day_of_week: 1, is_closed: false, opens_at: "09:00", closes_at: "17:00" }] },
    }).hours.monday?.open, "09:00");
  });

  it("applies a template, keeps a chosen channel, and reorders sections", () => {
    const content = sanitizeWebsiteContent({
      appearance: { template: "midnight" },
      channels: [{ id: "telegram", value: "valueor" }, { id: "facebook", value: "not-a-url", enabled: true }],
      social: { instagram: "https://instagram.com/valueor" },
    });
    assert.equal(content.appearance.template, "midnight");
    assert.equal(content.appearance.headerStyle, "split");
    assert.equal(content.channels.some((channel) => channel.id === "telegram" && channel.value === "valueor"), true);
    assert.equal(content.channels.some((channel) => channel.id === "instagram"), true);
    assert.equal(content.channels.some((channel) => channel.id === "facebook" && channel.value === "not-a-url"), true);
    const themed = applyWebsiteTemplate(content, "atelier");
    assert.equal(themed.appearance.headerStyle, "overlay");
    assert.equal(themed.appearance.background, "#F4F1EA");
    assert.equal(themed.appearance.primary, "#111827");
    const hidden = sanitizeWebsiteContent({ hero: { hidden: ["text", "image", "logo"] }, header: { hiddenNav: ["services", "nope"], showBooking: false } });
    assert.deepEqual(hidden.hero.hidden, ["text", "image"]);
    assert.deepEqual(hidden.header.hiddenNav, ["services"]);
    assert.equal(hidden.header.showBooking, false);
    assert.deepEqual(reorderWebsiteSections(["about", "services", "hours"], "hours", "about"), ["hours", "about", "services"]);
  });

  it("reorders hero slots, services, and gallery slides without dropping captions or direction", () => {
    const content = sanitizeWebsiteContent({ hero: { stack: ["buttons", "title", "video", "title"] } });
    assert.deepEqual(content.hero.stack, ["buttons", "title", "text"]);
    assert.deepEqual(reorderHeroSlots(content.hero.stack, "text", "buttons"), ["text", "buttons", "title"]);
    assert.deepEqual(reorderHeroSlots(content.hero.stack, "title", "title"), content.hero.stack);
    const catalog = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
    const moved = reorderWebsiteServices(content, catalog, catalog[1]!, catalog[0]!);
    assert.equal(moved.mode, "all");
    assert.deepEqual(moved.ids, [catalog[1], catalog[0]]);
    const visible = visibleWebsiteServices(
      [{ id: catalog[0]!, name: "A" }, { id: catalog[1]!, name: "B" }, { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "C" }],
      { ...content, services: moved },
    );
    assert.deepEqual(visible.map((service) => service.name), ["B", "A", "C"]);
    const gallery = reorderGallerySlides({
      direction: "right",
      slides: [
        { id: "11111111-1111-4111-8111-111111111111", url: "https://cdn.example.com/a.jpg", alt: "first" },
        { id: "22222222-2222-4222-8222-222222222222", url: "https://cdn.example.com/b.jpg", alt: "second" },
      ],
    }, "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111");
    assert.equal(gallery.direction, "right");
    assert.equal(gallery.slides[0]?.alt, "second");
    assert.equal(gallery.slides.length, 2);
    assert.equal(reorderIndexed(content.features.items, 0, 3), content.features.items);
  });

  it("changes a section template without clearing the section content", () => {
    const content = sanitizeWebsiteContent({
      hero: { primaryCta: "احجز", imageUrl: "https://cdn.example.com/hero.jpg" },
      about: { heading: "عن العيادة" },
      services: { ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] },
    });
    const next = applySectionFrame(content, "hero", "image-left");
    assert.equal(next.frames.hero, "image-left");
    assert.equal(next.hero.primaryCta, "احجز");
    assert.equal(next.hero.imageUrl, "https://cdn.example.com/hero.jpg");
    assert.equal(next.about.heading, "عن العيادة");
    assert.deepEqual(next.services.ids, content.services.ids);
    assert.equal(next.frames.services, "four");
    assert.equal(sanitizeWebsiteContent({}).video.url, null);
    assert.equal(sanitizeWebsiteContent({ video: { url: "https://cdn.example.com/clip.mp4", caption: "جولة" } }).video.caption, "جولة");
    assert.equal(sanitizeWebsiteContent({}).place.source, "branch");
    assert.equal(sanitizeWebsiteContent({}).products.showPrice, true);
    assert.equal(sanitizeWebsiteContent({}).frames.products, "shelf");
    assert.equal(sanitizeWebsiteContent({ products: { showPrice: false, mode: "selected", ids: ["6ec22958-25ff-4d40-827d-fb1a96756e32"] } }).products.showPrice, false);
    assert.deepEqual(sanitizeWebsiteContent({}).products.descriptions, {});
    assert.equal(
      sanitizeWebsiteContent({
        products: { descriptions: { "6ec22958-25ff-4d40-827d-fb1a96756e32": "  وصف الموقع  " } },
      }).products.descriptions["6ec22958-25ff-4d40-827d-fb1a96756e32"],
      "وصف الموقع",
    );
    assert.equal(sanitizeWebsiteContent({ place: { source: "custom", label: "المعادي" } }).place.label, "المعادي");
    assert.deepEqual(sanitizeWebsiteContent({ place: { source: "branch", pins: [{ id: "a", label: "التجمع" }, { id: "a", label: "مكرر" }] } }).place.pins, [{ id: "a", label: "التجمع" }]);
  });
});

describe("409 website slug", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/409_website_slug_available.sql"),
    "utf8",
  );

  it("keeps the published name unique without revealing the other company", () => {
    assert.match(sql, /function public.website_slug_available/);
    assert.match(sql, /customer_portal_settings/);
    assert.match(sql, /portal.company_id <> p_company_id/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("408 website products", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/408_website_public_products.sql"),
    "utf8",
  );

  it("reads the company catalog for a published site and does not create a product store", () => {
    assert.match(sql, /function public.website_public_products/);
    assert.match(sql, /from public.catalog_products p/);
    assert.match(sql, /p.is_active/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("420 catalog product tax", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/420_catalog_product_price_tax.sql"),
    "utf8",
  );

  it("stores tax mode and percent and publishes only the customer gross", () => {
    assert.match(sql, /price_tax_mode/);
    assert.match(sql, /tax_percent/);
    assert.match(sql, /customer_price/);
    assert.match(sql, /price_tax_mode, 'inclusive'\) = 'exclusive'/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("410 website service pricing", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/410_website_service_pricing.sql"),
    "utf8",
  );

  it("reads the existing pricing rules for the selected service", () => {
    assert.match(sql, /function public.website_service_pricing/);
    assert.match(sql, /scheduling_service_pricing_rules/);
    assert.match(sql, /scheduling_pricing_rule_types/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("407 website booking branches", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/407_website_booking_branches.sql"),
    "utf8",
  );

  it("reads branches and the services they already offer", () => {
    assert.match(sql, /function public.website_booking_catalog/);
    assert.match(sql, /from public.branches b/);
    assert.match(sql, /join public.resource_services rs/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("406 website studio contract", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/406_website_studio_content.sql"),
    "utf8",
  );

  it("stores presentation on the page and returns service ids without a second catalog", () => {
    assert.match(sql, /add column if not exists content jsonb/);
    assert.match(sql, /'content', coalesce\(v_content/);
    assert.match(sql, /'id', svc\.id/);
    assert.doesNotMatch(sql, /create table/);
  });
});

describe("404 website gallery contract", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/404_website_gallery.sql"),
    "utf8",
  );

  it("publishes only safe gallery urls and keeps website managers inside the gallery folder", () => {
    assert.match(sql, /web_presence_pages_gallery_shape/);
    assert.match(sql, /website-gallery/);
    assert.match(sql, /web_presence\.manage/);
    assert.match(sql, /'gallery', coalesce\(v_gallery/);
    assert.match(sql, /company-branding/);
    assert.doesNotMatch(sql, /company_branding_storage_insert/);
  });
});

describe("405 website branding contract", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/405_website_public_branding.sql"),
    "utf8",
  );

  it("reads company brand center inside public resolve and does not copy a second brand store", () => {
    assert.match(sql, /logos,main/);
    assert.match(sql, /colors,primary/);
    assert.match(sql, /c\.logo_url/);
    assert.match(sql, /coverImageUrl/);
    assert.match(sql, /w\.id = v_ctx\.widget_id/);
    assert.doesNotMatch(sql, /insert into public\.customer_portal_settings/);
    assert.doesNotMatch(sql, /#6366f1/);
  });
});

describe("403 website public contract", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../supabase/migrations/403_website_public_surface.sql"),
    "utf8",
  );

  it("exposes resolve and contact to visitors without opening the tables", () => {
    assert.match(sql, /grant execute on function public\.website_public_resolve\(text\) to anon, authenticated, service_role/);
    assert.match(sql, /grant execute on function public\.website_public_submit_contact\(text, text, text, text, text\) to anon, authenticated, service_role/);
    assert.match(sql, /anon must not read website or chat tables/);
    assert.match(sql, /web_chat_visitor_sessions/);
    assert.doesNotMatch(sql, /'companyId'/);
    assert.doesNotMatch(sql, /'company_id'/);
    assert.match(sql, /web_chat must remain non-commercial/);
  });
});

describe("website product images", () => {
  it("keeps at most five catalog photos and ignores empty values", () => {
    assert.deepEqual(
      websiteCatalogImages([
        "https://cdn.example/1.jpg",
        "https://cdn.example/1.jpg",
        "",
        "https://cdn.example/2.jpg",
        "https://cdn.example/3.jpg",
        "https://cdn.example/4.jpg",
        "https://cdn.example/5.jpg",
        "https://cdn.example/6.jpg",
      ]),
      [
        "https://cdn.example/1.jpg",
        "https://cdn.example/2.jpg",
        "https://cdn.example/3.jpg",
        "https://cdn.example/4.jpg",
        "https://cdn.example/5.jpg",
      ],
    );
  });

  it("uses the site override only for display and restores catalog photos when it is cleared", () => {
    const catalog = ["https://cdn.example/catalog-a.jpg", "https://cdn.example/catalog-b.jpg"];
    assert.deepEqual(websiteProductDisplayImages(catalog, "https://cdn.example/override.jpg"), [
      "https://cdn.example/override.jpg",
    ]);
    assert.deepEqual(websiteProductDisplayImages(catalog, "  "), catalog);
    assert.deepEqual(websiteProductDisplayImages(catalog, null), catalog);
  });
});
