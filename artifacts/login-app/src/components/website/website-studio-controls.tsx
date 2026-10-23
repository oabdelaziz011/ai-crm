import { useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WebsiteGalleryEditor } from "@/components/website/website-gallery-editor";
import { useToast } from "@/hooks/use-toast";
import { uploadCompanyBrandAsset, removeCompanyBrandPublicUrl } from "@/lib/company-workspace/services/company-brand-upload";
import {
  WEBSITE_CHANNEL_IDS,
  WEBSITE_CTA_ACTIONS,
  WEBSITE_HEADER_STYLES,
  WEBSITE_SOCIAL_PLACEMENTS,
  WEBSITE_TEMPLATES,
  applyWebsiteTemplate,
  moveWebsiteSection,
  normalizeWebsiteSlug,
  reorderWebsiteSections,
  type WebsiteBodySectionKey,
  type WebsiteChannelId,
  type WebsiteContent,
  type WebsiteCtaAction,
  type WebsiteSectionSize,
} from "@/lib/website/website-model";
import { useActiveAutomationFlows } from "@/hooks/channels/use-channel-workflow-binding";
import type { WebsiteEmployeeOption, WebsiteStudioSnapshot } from "@/lib/website/website-studio";

type ServiceRow = { id: string; name: string };

export function WebsiteStudioControls({
  companyId,
  draft,
  locked,
  slugValid,
  host,
  services,
  hoursCount,
  hours = [],
  locationLine,
  logoUrl,
  employeeValue,
  hoursHref,
  onChange,
}: {
  companyId: string;
  draft: WebsiteStudioSnapshot;
  locked: boolean;
  slugValid: boolean;
  host: string | null;
  services: ServiceRow[];
  hoursCount: number;
  hours?: { key: string; open: string; close: string }[];
  locationLine: string | null;
  logoUrl: string | null;
  employeeValue: string;
  hoursHref: string;
  onChange: (next: WebsiteStudioSnapshot) => void;
}) {
  const { t } = useTranslation("common");
  const flows = useActiveAutomationFlows(companyId);
  const [open, setOpen] = useState<WebsiteBodySectionKey | "home" | "header" | "social" | "colors" | "chat">("home");
  const [dragKey, setDragKey] = useState<WebsiteBodySectionKey | null>(null);
  const content = draft.content;

  const patchContent = (partial: Partial<WebsiteContent>) => {
    onChange({ ...draft, content: { ...content, ...partial } });
  };

  const summary = (key: WebsiteBodySectionKey) => {
    if (key === "services") {
      const count = content.services.mode === "selected" ? content.services.ids.length : services.length;
      return t("websiteBuilder.builder.summary.services", { count });
    }
    if (key === "gallery") return t("websiteBuilder.builder.summary.gallery", { count: draft.gallery.slides.length });
    if (key === "features") return t("websiteBuilder.builder.summary.features", { count: content.features.items.length });
    if (key === "testimonials") return t("websiteBuilder.builder.summary.testimonials", { count: content.testimonials.items.length });
    if (key === "hours") return hoursCount ? t("websiteBuilder.builder.summary.configured") : t("websiteBuilder.builder.summary.missing");
    if (key === "location") return locationLine ? t("websiteBuilder.builder.summary.configured") : t("websiteBuilder.builder.summary.missing");
    if (key === "booking") return t("websiteBuilder.builder.summary.booking");
    if (key === "about") return draft.description.trim() ? t("websiteBuilder.builder.summary.configured") : t("websiteBuilder.builder.summary.missing");
    return draft.sections[key] ? t("websiteBuilder.builder.summary.on") : t("websiteBuilder.builder.summary.off");
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title={t("websiteBuilder.builder.homeTitle")}
        summary={host ?? t("websiteBuilder.builder.addressMissing")}
        open={open === "home"}
        onOpen={() => setOpen("home")}
      >
        <Field label={t("websiteBuilder.slug")}>
          <Input value={draft.slug} disabled={locked} placeholder="dr-ahmed" onChange={(event) => onChange({ ...draft, slug: event.target.value })} />
          {draft.slug.trim() && !slugValid ? <p className="text-xs text-destructive">{t("websiteBuilder.blockers.slug_invalid")}</p> : null}
          {normalizeWebsiteSlug(draft.slug) ? (
            <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.localPath", { path: `/site/${normalizeWebsiteSlug(draft.slug)}` })}</p>
          ) : null}
        </Field>
        <Field label={t("websiteBuilder.builder.logo")}>
          {logoUrl ? <img src={logoUrl} alt="" className="h-12 w-auto rounded-md object-contain" /> : <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.logoMissing")}</p>}
          <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.logoFromBrand")}</p>
        </Field>
        <ImageField
          label={t("websiteBuilder.builder.heroImage")}
          url={content.hero.imageUrl}
          companyId={companyId}
          locked={locked}
          onChange={(imageUrl) => patchContent({ hero: { ...content.hero, imageUrl } })}
        />
        <Field label={t("websiteBuilder.headline")}>
          <Input value={draft.headline} disabled={locked} onChange={(event) => onChange({ ...draft, headline: event.target.value })} />
        </Field>
        <Field label={t("websiteBuilder.description")}>
          <Textarea value={draft.description} disabled={locked} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
        </Field>
        <Field label={t("websiteBuilder.builder.primaryCta")}>
          <Input value={content.hero.primaryCta} disabled={locked} onChange={(event) => patchContent({ hero: { ...content.hero, primaryCta: event.target.value } })} />
          <ActionSelect value={content.hero.primaryAction} disabled={locked} onChange={(primaryAction) => patchContent({ hero: { ...content.hero, primaryAction } })} />
        </Field>
        <Field label={t("websiteBuilder.builder.secondaryCta")}>
          <Input value={content.hero.secondaryCta} disabled={locked} onChange={(event) => patchContent({ hero: { ...content.hero, secondaryCta: event.target.value } })} />
          <ActionSelect value={content.hero.secondaryAction} disabled={locked} onChange={(secondaryAction) => patchContent({ hero: { ...content.hero, secondaryAction } })} />
        </Field>
      </SectionCard>

      {content.order.map((key) => (
        <SectionCard
          key={key}
          title={t(`websiteBuilder.section.${key}`)}
          summary={summary(key)}
          enabled={draft.sections[key]}
          incomplete={!draft.sections[key] || summary(key) === t("websiteBuilder.builder.summary.missing")}
          open={open === key}
          onOpen={() => setOpen(key)}
          onEnabled={(value) => onChange({ ...draft, sections: { ...draft.sections, [key]: value } })}
          disabled={locked}
          size={content.layout.sizes[key] ?? "md"}
          onSize={(size) => patchContent({ layout: { sizes: { ...content.layout.sizes, [key]: size } } })}
          onMove={(direction) => patchContent({ order: moveWebsiteSection(content.order, key, direction) })}
          onDragStart={() => setDragKey(key)}
          onDrop={() => {
            if (!dragKey) return;
            patchContent({ order: reorderWebsiteSections(content.order, dragKey, key) });
            setDragKey(null);
          }}
        >
          {key === "about" ? (
            <>
              <Field label={t("websiteBuilder.builder.aboutHeading")}>
                <Input value={content.about.heading} disabled={locked} onChange={(event) => patchContent({ about: { ...content.about, heading: event.target.value } })} />
              </Field>
              <ImageField
                label={t("websiteBuilder.builder.aboutImage")}
                url={content.about.imageUrl}
                companyId={companyId}
                locked={locked}
                onChange={(imageUrl) => patchContent({ about: { ...content.about, imageUrl } })}
              />
              <Field label={t("websiteBuilder.builder.bullets")}>
                <Textarea
                  value={content.about.bullets.join("\n")}
                  disabled={locked}
                  onChange={(event) => patchContent({ about: { ...content.about, bullets: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 6) } })}
                />
              </Field>
            </>
          ) : null}
          {key === "features" ? <ItemEditor locked={locked} items={content.features.items} onChange={(items) => patchContent({ features: { items } })} titleLabel={t("websiteBuilder.builder.featureTitle")} textLabel={t("websiteBuilder.builder.featureText")} /> : null}
          {key === "testimonials" ? <ItemEditor locked={locked} items={content.testimonials.items.map((item) => ({ title: item.name, text: item.quote }))} onChange={(items) => patchContent({ testimonials: { items: items.map((item) => ({ name: item.title, quote: item.text })) } })} titleLabel={t("websiteBuilder.builder.personName")} textLabel={t("websiteBuilder.builder.quote")} /> : null}
          {key === "gallery" ? <WebsiteGalleryEditor companyId={companyId} gallery={draft.gallery} disabled={locked} onChange={(gallery) => onChange({ ...draft, gallery })} /> : null}
          {key === "services" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.sectionBody.services")}</p>
              {services.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyServices")}</p> : services.map((service, index) => {
                const selected = content.services.mode !== "selected" || content.services.ids.includes(service.id);
                return (
                  <div key={service.id} className="space-y-2 rounded-lg border border-border/70 p-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={selected}
                        disabled={locked}
                        onCheckedChange={(checked) => {
                          const ids = content.services.mode === "selected" ? [...content.services.ids] : services.map((row) => row.id);
                          const next = checked ? [...ids, service.id] : ids.filter((id) => id !== service.id);
                          patchContent({ services: { ...content.services, mode: "selected", ids: [...new Set(next)] } });
                        }}
                        aria-label={service.name}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{service.name}</span>
                      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={locked || index === 0} aria-label={t("websiteBuilder.builder.galleryPrev")} onClick={() => {
                        const ids = content.services.mode === "selected" ? [...content.services.ids] : services.map((row) => row.id);
                        const from = ids.indexOf(service.id);
                        if (from <= 0) return;
                        [ids[from - 1], ids[from]] = [ids[from], ids[from - 1]];
                        patchContent({ services: { ...content.services, mode: "selected", ids } });
                      }}><ChevronUp className="size-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={locked || index === services.length - 1} aria-label={t("websiteBuilder.builder.galleryNext")} onClick={() => {
                        const ids = content.services.mode === "selected" ? [...content.services.ids] : services.map((row) => row.id);
                        const from = ids.indexOf(service.id);
                        if (from < 0 || from >= ids.length - 1) return;
                        [ids[from + 1], ids[from]] = [ids[from], ids[from + 1]];
                        patchContent({ services: { ...content.services, mode: "selected", ids } });
                      }}><ChevronDown className="size-4" /></Button>
                    </div>
                    <ImageField
                      label={t("websiteBuilder.builder.serviceImage")}
                      url={content.services.images[service.id] ?? null}
                      companyId={companyId}
                      locked={locked}
                      onChange={(url) => {
                        const images = { ...content.services.images };
                        if (url) images[service.id] = url;
                        else delete images[service.id];
                        patchContent({ services: { ...content.services, images } });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          {key === "hours" ? (
            <div className="space-y-2">
              {hours.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.emptyHours")}</p> : (
                <ul className="space-y-1 text-sm">
                  {hours.map((row) => (
                    <li key={row.key} className="flex justify-between gap-3">
                      <span>{t(`websiteBuilder.builder.days.${row.key}`, { defaultValue: row.key })}</span>
                      <span className="text-muted-foreground">{row.open}–{row.close}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={hoursHref}>{t("websiteBuilder.builder.openHours")}</Link>
              </Button>
            </div>
          ) : null}
          {key === "location" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{locationLine || t("websiteBuilder.builder.emptyLocation")}</p>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={hoursHref}>{t("websiteBuilder.builder.openLocation")}</Link>
              </Button>
            </div>
          ) : null}
          {key === "contact" ? (
            <>
              <Field label={t("websiteBuilder.builder.contactHeading")}>
                <Input value={content.contact.heading} disabled={locked} onChange={(event) => patchContent({ contact: { ...content.contact, heading: event.target.value } })} />
              </Field>
              <Field label={t("websiteBuilder.description")}>
                <Textarea value={content.contact.description} disabled={locked} onChange={(event) => patchContent({ contact: { ...content.contact, description: event.target.value } })} />
              </Field>
            </>
          ) : null}
          {key === "booking" ? (
            <>
              <Field label={t("websiteBuilder.builder.bookingHeading")}>
                <Input value={content.booking.heading} disabled={locked} onChange={(event) => patchContent({ booking: { ...content.booking, heading: event.target.value } })} />
              </Field>
              <Field label={t("websiteBuilder.builder.bookingCta")}>
                <Input value={content.booking.cta} disabled={locked} onChange={(event) => patchContent({ booking: { ...content.booking, cta: event.target.value } })} />
              </Field>
            </>
          ) : null}
        </SectionCard>
      ))}

      <SectionCard title={t("websiteBuilder.builder.headerTitle")} summary={t("websiteBuilder.builder.summary.header", { count: content.header.items.length })} open={open === "header"} onOpen={() => setOpen("header")}>
        {content.header.items.map((item, index) => (
          <div key={item.id} className="space-y-2 rounded-lg border border-border/70 p-2">
            <Input value={item.label} disabled={locked} placeholder={t("websiteBuilder.builder.headerLabel")} onChange={(event) => patchContent({ header: { ...content.header, items: content.header.items.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row) } })} />
            <ActionSelect value={item.action === "url" ? "none" : item.action} disabled={locked} onChange={(action) => patchContent({ header: { ...content.header, items: content.header.items.map((row, rowIndex) => rowIndex === index ? { ...row, action, url: "" } : row) } })} />
            <Textarea value={item.detail} disabled={locked} placeholder={t("websiteBuilder.builder.headerDetail")} onChange={(event) => patchContent({ header: { ...content.header, items: content.header.items.map((row, rowIndex) => rowIndex === index ? { ...row, detail: event.target.value } : row) } })} />
            <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.headerPopupHint")}</p>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={locked || content.header.items.length >= 6} onClick={() => patchContent({ header: { ...content.header, items: [...content.header.items, { id: crypto.randomUUID(), label: t("websiteBuilder.builder.headerLabel"), action: "services", url: "", detail: "" }] } })}>
          {t("websiteBuilder.builder.headerAdd")}
        </Button>
      </SectionCard>

      <SectionCard title={t("websiteBuilder.builder.socialTitle")} summary={t(`websiteBuilder.builder.socialPlace.${content.social.placement}`)} open={open === "social"} onOpen={() => setOpen("social")}>
        {WEBSITE_CHANNEL_IDS.map((id) => {
          const current = content.channels.find((channel) => channel.id === id);
          return (
            <div key={id} className="space-y-1.5 rounded-lg border border-border/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{t(`websiteBuilder.builder.channel.${id}`)}</span>
                <Switch
                  checked={Boolean(current)}
                  disabled={locked}
                  onCheckedChange={(checked) => {
                    const channels = checked
                      ? [...content.channels.filter((channel) => channel.id !== id), { id, value: current?.value || legacyChannel(content, id) }]
                      : content.channels.filter((channel) => channel.id !== id);
                    patchContent({ channels, social: mirrorSocial(content.social, channels) });
                  }}
                  aria-label={t(`websiteBuilder.builder.channel.${id}`)}
                />
              </div>
              {current ? (
                <Input
                  value={current.value}
                  disabled={locked}
                  placeholder={t(`websiteBuilder.builder.channelHint.${id}`)}
                  onChange={(event) => {
                    const channels = content.channels.map((channel) => channel.id === id ? { ...channel, value: event.target.value } : channel);
                    patchContent({ channels, social: mirrorSocial(content.social, channels) });
                  }}
                />
              ) : null}
            </div>
          );
        })}
        <Field label={t("websiteBuilder.builder.socialPlaceLabel")}>
          <Select value={content.social.placement} disabled={locked} onValueChange={(placement) => patchContent({ social: { ...content.social, placement: WEBSITE_SOCIAL_PLACEMENTS.includes(placement as typeof WEBSITE_SOCIAL_PLACEMENTS[number]) ? placement as typeof WEBSITE_SOCIAL_PLACEMENTS[number] : "header" } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEBSITE_SOCIAL_PLACEMENTS.map((place) => (
                <SelectItem key={place} value={place}>{t(`websiteBuilder.builder.socialPlace.${place}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard title={t("websiteBuilder.section.chat")} summary={draft.sections.chat ? t("websiteBuilder.builder.summary.on") : t("websiteBuilder.builder.summary.off")} enabled={draft.sections.chat} open={open === "chat"} onOpen={() => setOpen("chat")} disabled={locked} onEnabled={(value) => onChange({ ...draft, sections: { ...draft.sections, chat: value } })}>
        <p className="text-xs text-muted-foreground">{t("websiteBuilder.chatCardHelp", { defaultValue: t("websiteBuilder.builder.chatCardHelp") })}</p>
        <Field label={t("websiteBuilder.greeting")}>
          <Textarea value={draft.greeting} disabled={locked || !draft.sections.chat} onChange={(event) => onChange({ ...draft, greeting: event.target.value })} />
        </Field>
        <Field label={t("websiteBuilder.builder.responder")}>
          <Select
            value={content.chat.responseMode}
            disabled={locked || !draft.sections.chat}
            onValueChange={(responseMode) => onChange({
              ...draft,
              aiEnabled: responseMode === "workflow" ? false : draft.aiEnabled,
              aiEmployeeId: responseMode === "workflow" ? null : draft.aiEmployeeId,
              content: {
                ...content,
                chat: {
                  ...content.chat,
                  responseMode: responseMode === "workflow" ? "workflow" : "ai_employee",
                  workflowId: responseMode === "workflow" ? content.chat.workflowId : null,
                },
              },
            })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ai_employee">{t("websiteBuilder.builder.responderAi")}</SelectItem>
              <SelectItem value="workflow">{t("websiteBuilder.builder.responderWorkflow")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {content.chat.responseMode === "workflow" ? (
          (flows.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.noWorkflows")}</p> : (
            <Select value={content.chat.workflowId ?? "none"} disabled={locked || !draft.sections.chat} onValueChange={(value) => onChange({ ...draft, aiEnabled: false, aiEmployeeId: null, content: { ...content, chat: { ...content.chat, responseMode: "workflow", workflowId: value === "none" ? null : value } } })}>
              <SelectTrigger><SelectValue placeholder={t("websiteBuilder.builder.workflowPlaceholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("websiteBuilder.builder.workflowPlaceholder")}</SelectItem>
                {flows.data?.map((flow) => <SelectItem key={flow.id} value={flow.id}>{flow.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        ) : draft.employees.length === 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.noEmployees")}</p> : (
          <Select value={employeeValue} disabled={locked || !draft.sections.chat} onValueChange={(value) => onChange({ ...draft, aiEnabled: value !== "none", aiEmployeeId: value === "none" ? null : value, content: { ...content, chat: { ...content.chat, responseMode: "ai_employee", workflowId: null } } })}>
            <SelectTrigger><SelectValue placeholder={t("websiteBuilder.employeePlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("websiteBuilder.employeePlaceholder")}</SelectItem>
              {draft.employees.map((employee: WebsiteEmployeeOption) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </SectionCard>

      <SectionCard title={t("websiteBuilder.builder.colorsTitle")} summary={t(`websiteBuilder.builder.template.${content.appearance.template}`)} open={open === "colors"} onOpen={() => setOpen("colors")}>
        <div className="grid grid-cols-2 gap-2">
          {WEBSITE_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              disabled={locked}
              className={`rounded-xl border p-3 text-start text-sm ${content.appearance.template === template ? "border-primary ring-1 ring-primary" : "border-border"}`}
              onClick={() => onChange({ ...draft, content: applyWebsiteTemplate(content, template) })}
            >
              <span className="block font-medium">{t(`websiteBuilder.builder.template.${template}`)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t(`websiteBuilder.builder.templateHint.${template}`)}</span>
            </button>
          ))}
        </div>
        <Field label={t("websiteBuilder.builder.headerStyle")}>
          <Select value={content.appearance.headerStyle} disabled={locked} onValueChange={(headerStyle) => patchContent({ appearance: { ...content.appearance, headerStyle: WEBSITE_HEADER_STYLES.includes(headerStyle as typeof WEBSITE_HEADER_STYLES[number]) ? headerStyle as typeof WEBSITE_HEADER_STYLES[number] : "split" } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEBSITE_HEADER_STYLES.map((style) => <SelectItem key={style} value={style}>{t(`websiteBuilder.builder.headerStyleValue.${style}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("websiteBuilder.builder.titleScale")}>
            <Select value={content.appearance.titleScale} disabled={locked} onValueChange={(titleScale) => patchContent({ appearance: { ...content.appearance, titleScale: titleScale === "md" || titleScale === "xl" ? titleScale : "lg" } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="md">{t("websiteBuilder.builder.scale.md")}</SelectItem>
                <SelectItem value="lg">{t("websiteBuilder.builder.scale.lg")}</SelectItem>
                <SelectItem value="xl">{t("websiteBuilder.builder.scale.xl")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("websiteBuilder.builder.bodyScale")}>
            <Select value={content.appearance.bodyScale} disabled={locked} onValueChange={(bodyScale) => patchContent({ appearance: { ...content.appearance, bodyScale: bodyScale === "sm" || bodyScale === "lg" ? bodyScale : "md" } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">{t("websiteBuilder.builder.scale.sm")}</SelectItem>
                <SelectItem value="md">{t("websiteBuilder.builder.scale.md")}</SelectItem>
                <SelectItem value="lg">{t("websiteBuilder.builder.scale.lg")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{t("websiteBuilder.builder.colorsHelp")}</p>
        {(["primary", "secondary", "background", "text", "heading"] as const).map((slot) => (
          <Field key={slot} label={t(`websiteBuilder.builder.color.${slot}`)}>
            <div className="flex gap-2">
              <Input type="color" className="h-9 w-12 p-1" value={/^#(?:[0-9a-f]{6})$/i.test(content.appearance[slot] ?? "") ? content.appearance[slot]! : "#0D9488"} disabled={locked} onChange={(event) => patchContent({ appearance: { ...content.appearance, [slot]: event.target.value } })} />
              <Input value={content.appearance[slot] ?? ""} disabled={locked} placeholder="#0D9488" onChange={(event) => patchContent({ appearance: { ...content.appearance, [slot]: event.target.value } })} />
            </div>
          </Field>
        ))}
        <Field label={t("websiteBuilder.builder.buttonStyle")}>
          <Select value={content.appearance.button} disabled={locked} onValueChange={(button) => patchContent({ appearance: { ...content.appearance, button: button === "soft" ? "soft" : "solid" } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">{t("websiteBuilder.builder.buttonSolid")}</SelectItem>
              <SelectItem value="soft">{t("websiteBuilder.builder.buttonSoft")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("websiteBuilder.builder.radius")}>
          <Select value={content.appearance.radius} disabled={locked} onValueChange={(radius) => patchContent({ appearance: { ...content.appearance, radius: radius === "md" || radius === "full" ? radius : "lg" } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="md">{t("websiteBuilder.builder.radiusMd")}</SelectItem>
              <SelectItem value="lg">{t("websiteBuilder.builder.radiusLg")}</SelectItem>
              <SelectItem value="full">{t("websiteBuilder.builder.radiusFull")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  summary,
  open,
  onOpen,
  enabled,
  onEnabled,
  disabled,
  incomplete,
  onMove,
  size,
  onSize,
  onDragStart,
  onDrop,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onOpen: () => void;
  enabled?: boolean;
  onEnabled?: (value: boolean) => void;
  disabled?: boolean;
  incomplete?: boolean;
  onMove?: (direction: -1 | 1) => void;
  size?: WebsiteSectionSize;
  onSize?: (size: WebsiteSectionSize) => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <section
      className="rounded-xl border bg-card"
      onDragOver={(event) => { if (onDrop) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); onDrop?.(); }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {onDragStart ? (
          <button type="button" className="cursor-grab text-muted-foreground" draggable={!disabled} aria-label={t("websiteBuilder.builder.dragSection")} onDragStart={onDragStart}>
            <GripVertical className="size-4" />
          </button>
        ) : null}
        {onEnabled ? <Switch checked={Boolean(enabled)} disabled={disabled} onCheckedChange={onEnabled} aria-label={title} /> : null}
        <button type="button" className="min-w-0 flex-1 text-start" onClick={onOpen}>
          <span className="block text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{incomplete && enabled === false ? summary : summary}</span>
        </button>
        {onSize && size ? (
          <div className="flex">
            {(["sm", "md", "lg"] as const).map((option) => (
              <Button key={option} type="button" size="icon" variant={size === option ? "secondary" : "ghost"} className="size-7 text-[10px]" disabled={disabled} onClick={() => onSize(option)}>{option === "sm" ? "S" : option === "md" ? "M" : "L"}</Button>
            ))}
          </div>
        ) : null}
        {onMove ? (
          <div className="flex">
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => onMove(-1)}><ChevronUp className="size-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => onMove(1)}><ChevronDown className="size-4" /></Button>
          </div>
        ) : null}
      </div>
      {open ? <div className="space-y-3 border-t px-3 py-3">{children}</div> : null}
    </section>
  );
}

function legacyChannel(content: WebsiteContent, id: WebsiteChannelId): string {
  if (id === "facebook") return content.social.facebook;
  if (id === "instagram") return content.social.instagram;
  if (id === "whatsapp") return content.social.whatsapp;
  return "";
}

function mirrorSocial(social: WebsiteContent["social"], channels: WebsiteContent["channels"]): WebsiteContent["social"] {
  const value = (id: WebsiteChannelId) => channels.find((channel) => channel.id === id)?.value ?? "";
  return { ...social, facebook: value("facebook"), instagram: value("instagram"), whatsapp: value("whatsapp") };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ImageField({
  label,
  url,
  companyId,
  locked,
  onChange,
}: {
  label: string;
  url: string | null;
  companyId: string;
  locked: boolean;
  onChange: (url: string | null) => void;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || locked) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: t("websiteBuilder.builder.galleryType"), variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadCompanyBrandAsset({ companyId, slot: "website-gallery", file });
      onChange(uploaded.publicUrl);
    } catch {
      toast({ title: t("websiteBuilder.builder.galleryUploadFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Field label={label}>
      {url ? <img src={url} alt="" className="h-24 w-full rounded-md object-cover" /> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={locked || uploading} onClick={() => inputRef.current?.click()}>
          {t("websiteBuilder.builder.heroImageChoose")}
        </Button>
        {url ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={locked}
            onClick={() => {
              void removeCompanyBrandPublicUrl(url);
              onChange(null);
            }}
          >
            {t("websiteBuilder.builder.galleryRemove")}
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={locked || uploading}
        onChange={(event) => void upload(event.target.files?.[0])}
      />
    </Field>
  );
}

function ActionSelect({ value, disabled, onChange }: { value: WebsiteCtaAction; disabled: boolean; onChange: (value: WebsiteCtaAction) => void }) {
  const { t } = useTranslation("common");
  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as WebsiteCtaAction)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {WEBSITE_CTA_ACTIONS.map((action) => (
          <SelectItem key={action} value={action}>{t(`websiteBuilder.builder.cta.${action}`)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ItemEditor({
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
  const rows = items.length ? items : [];
  return (
    <div className="space-y-3">
      {rows.map((item, index) => (
        <div key={index} className="space-y-1.5">
          <Input value={item.title} disabled={locked} placeholder={titleLabel} onChange={(event) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} />
          <Textarea value={item.text} disabled={locked} placeholder={textLabel} onChange={(event) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, text: event.target.value } : row))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={locked || rows.length >= 6} onClick={() => onChange([...rows, { title: "", text: "" }])}>+</Button>
    </div>
  );
}
