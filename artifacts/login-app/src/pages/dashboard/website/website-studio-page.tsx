import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  orderedPreviewHours,
  WebsiteBuilderPreview,
  type WebsiteBuilderPreviewModel,
} from "@/components/website/website-builder-preview";
import { WebsiteVisualStudio } from "@/components/website/website-visual-studio";
import { WebsiteServiceBooking } from "@/components/website/website-service-booking";
import { BranchRepository } from "@/lib/company/branches/repositories/branch-repository";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { PortalSettingsRepository } from "@/lib/customer-portal/repositories/portal-settings-repository";
import { usePortalServices } from "@/lib/customer-portal/hooks/use-customer-portal";
import { supabase } from "@/lib/supabase";
import {
  canonicalWebsiteOrigin,
  reservedWebsiteHost,
  resolveWebsiteBranding,
  websiteVisitorUrl,
  branchWebsiteFacts,
  websiteCatalogImages,
  normalizeWebsiteSlug,
} from "@/lib/website/website-model";
import { catalogCustomerUnitPrice } from "@workspace/product-platform";
import { commitEditorChange, emptyEditorHistory, redoEditorChange, undoEditorChange, type WebsiteEditorSlice } from "@/lib/website/website-editor-state";
import {
  WebsiteStudioError,
  loadWebsiteStudio,
  saveWebsiteStudio,
  type WebsiteStudioSnapshot,
} from "@/lib/website/website-studio";

const QUERY_KEY = "website-studio";

export function WebsiteStudioPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const queryClient = useQueryClient();
  const companyId = company?.id ?? null;
  const canManage = hasCompanyPermission("web_presence.manage");
  const query = useQuery({
    queryKey: [QUERY_KEY, companyId],
    enabled: Boolean(companyId),
    queryFn: () => loadWebsiteStudio(supabase, companyId!),
  });
  const profileQuery = useQuery({
    queryKey: ["website-builder-profile", companyId],
    enabled: Boolean(companyId),
    queryFn: () => new PortalSettingsRepository(supabase).getByCompanyId(companyId!),
  });
  const servicesQuery = usePortalServices(companyId);
  const productsQuery = useQuery({
    queryKey: ["website-catalog-products", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_products")
        .select("id, name, description, base_price, currency, image_urls, price_tax_mode, tax_percent")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name")
        .limit(24);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const brandQuery = useQuery({
    queryKey: ["website-company-brand", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("logo_url, branding")
        .eq("id", companyId!)
        .single();
      if (error) throw new Error(error.message);
      return data as { logo_url: string | null; branding: unknown };
    },
  });
  const [draft, setDraft] = useState<WebsiteStudioSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>("hero-title");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewing, setPreviewing] = useState(false);
  const historyRef = useRef(emptyEditorHistory());
  const [historyTick, setHistoryTick] = useState(0);
  const branchesQuery = useQuery({
    queryKey: ["website-branches", companyId],
    enabled: Boolean(companyId),
    queryFn: () => new BranchRepository(supabase).listByCompany(companyId!),
    refetchOnMount: "always",
  });
  const normalizedSlug = normalizeWebsiteSlug(draft?.slug ?? "");
  const slugAvailable = useQuery({
    queryKey: ["website-slug-available", companyId, normalizedSlug],
    enabled: Boolean(companyId && normalizedSlug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("website_slug_available", {
        p_company_id: companyId,
        p_slug: normalizedSlug,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
  });

  useEffect(() => {
    if (query.data) {
      setDraft(query.data);
      historyRef.current = emptyEditorHistory();
      setHistoryTick((tick) => tick + 1);
    }
  }, [query.data]);

  if (!companyId) {
    return (
      <BuilderState>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Eye />
            </EmptyMedia>
            <EmptyTitle>{t("websiteBuilder.title")}</EmptyTitle>
            <EmptyDescription>{t("websiteBuilder.noCompany")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </BuilderState>
    );
  }
  if (query.isLoading || !draft) {
    return (
      <BuilderState>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </BuilderState>
    );
  }
  if (query.isError) {
    return (
      <BuilderState>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("websiteBuilder.title")}</EmptyTitle>
            <EmptyDescription>{t("websiteBuilder.loadFailed")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </BuilderState>
    );
  }

  const origin = canonicalWebsiteOrigin(window.location.origin);
  const shareUrl = websiteVisitorUrl(window.location.origin, draft.slug);
  const previewPath = shareUrl;
  const host = normalizedSlug ? reservedWebsiteHost(normalizedSlug) : null;
  const companySlug = normalizeWebsiteSlug(company?.name || "");
  const slugTaken = Boolean(normalizedSlug) && slugAvailable.data === false;
  const slugInvalid = Boolean(draft.slug.trim()) && !normalizedSlug;
  const locked = !canManage || !draft.pageFeature;
  const actionsDisabled = !canManage || saving || !draft.pageFeature || !normalizedSlug || slugTaken;

  const save = async (publish: boolean) => {
    if (!canManage) return;
    setSaving(true);
    try {
      await saveWebsiteStudio(supabase, companyId, {
        slug: draft.slug,
        sections: draft.sections,
        headline: draft.headline,
        description: draft.description,
        greeting: draft.greeting,
        aiEnabled: draft.content.chat.responseMode === "ai_employee" && draft.employees.some((employee) => employee.id === draft.aiEmployeeId),
        aiEmployeeId: draft.content.chat.responseMode === "ai_employee" && draft.employees.some((employee) => employee.id === draft.aiEmployeeId)
          ? draft.aiEmployeeId
          : null,
        gallery: draft.gallery,
        content: draft.content,
        publish,
        origin,
        pageFeature: draft.pageFeature,
        chatFeature: draft.chatFeature,
        portalWasEnabled: draft.portalWasEnabled,
        widgetId: draft.widgetId,
        pageId: draft.pageId,
        portalId: draft.portalId,
      });
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      toast({ title: publish ? t("websiteBuilder.published") : t("websiteBuilder.saved") });
    } catch (error) {
      const blockers = error instanceof WebsiteStudioError ? error.blockers : [];
      toast({
        title: t("websiteBuilder.saveFailed"),
        description: blockers.length
          ? blockers.map((code) => t(`websiteBuilder.blockers.${code}`)).join(" ")
          : error instanceof Error
            ? error.message
            : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const editorSlice = (snapshot: WebsiteStudioSnapshot): WebsiteEditorSlice => ({
    headline: snapshot.headline,
    description: snapshot.description,
    sections: snapshot.sections,
    gallery: snapshot.gallery,
    content: snapshot.content,
  });
  const editDraft = (next: WebsiteStudioSnapshot) => {
    setDraft((current) => {
      if (!current) return next;
      historyRef.current = commitEditorChange(historyRef.current, editorSlice(current));
      return next;
    });
    setHistoryTick((tick) => tick + 1);
  };
  const undo = () => {
    setDraft((current) => {
      if (!current) return current;
      const result = undoEditorChange(historyRef.current, editorSlice(current));
      if (!result) return current;
      historyRef.current = result.history;
      return { ...current, ...result.value };
    });
    setHistoryTick((tick) => tick + 1);
  };
  const redo = () => {
    setDraft((current) => {
      if (!current) return current;
      const result = redoEditorChange(historyRef.current, editorSlice(current));
      if (!result) return current;
      historyRef.current = result.history;
      return { ...current, ...result.value };
    });
    setHistoryTick((tick) => tick + 1);
  };
  const canUndo = historyTick >= 0 && historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const location = profileQuery.data?.location;
  const portalLocation = [location?.address, location?.city, location?.country].filter(Boolean).join(" · ") || null;
  const branches = branchesQuery.data ?? [];
  const primaryBranch = branches.find((branch) => branch.is_primary && branch.status === "active") ?? branches.find((branch) => branch.status === "active") ?? null;
  const branchFacts = branchWebsiteFacts(primaryBranch);
  const locationLine = portalLocation || branchFacts.locationLine;
  const branchLines = [...new Set(
    branches
      .filter((branch) => branch.status === "active")
      .map((branch) => [branch.address_line1, branch.city, branch.country].map((part) => part?.trim()).filter(Boolean).join(" · ") || branch.name)
      .filter(Boolean),
  )];
  const portalHours = orderedPreviewHours(profileQuery.data?.workingHours);
  const hours = portalHours.length ? portalHours : orderedPreviewHours(branchFacts.hours);
  const branding = resolveWebsiteBranding({
    companyLogoUrl: brandQuery.data?.logo_url ?? company?.logo_url,
    companyBranding: brandQuery.data?.branding,
    portalBranding: profileQuery.data
      ? { coverImageUrl: profileQuery.data.branding.coverImageUrl }
      : null,
  });
  const preview: WebsiteBuilderPreviewModel = {
    companyName: profileQuery.data?.name || company?.name || "",
    logoUrl: branding.logoUrl,
    coverImageUrl: draft.content.hero.imageUrl || branding.coverImageUrl,
    primaryColor: draft.content.appearance.primary || branding.primaryColor,
    content: draft.content,
    headline: draft.headline,
    description: draft.description,
    sections: draft.sections,
    services: (servicesQuery.data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      currency: service.currency,
    })),
    products: (productsQuery.data ?? []).map((product) => {
      const imageUrls = websiteCatalogImages(product.image_urls);
      return {
        id: product.id as string,
        name: String(product.name ?? ""),
        description: String(product.description ?? ""),
        price: catalogCustomerUnitPrice({
          basePrice: Number(product.base_price) || 0,
          priceTaxMode: product.price_tax_mode,
          taxPercent: Number(product.tax_percent) || 0,
        }),
        currency: String(product.currency || "USD"),
        imageUrl: imageUrls[0] ?? null,
        imageUrls,
      };
    }),
    locationLine,
    branchLines,
    hours,
    gallery: draft.gallery,
    greeting: draft.greeting,
    urlLabel: host ?? t("websiteBuilder.builder.addressMissing"),
  };

  if (previewing) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h1 className="text-base font-semibold">{t("websiteBuilder.builder.preview")}</h1>
          <Button type="button" variant="outline" onClick={() => setPreviewing(false)}>{t("websiteBuilder.builder.backToEditor")}</Button>
        </header>
        <div className="min-h-0 flex-1">
          <WebsiteBuilderPreview model={{ ...preview, urlLabel: shareUrl ?? preview.urlLabel }} framed={false} onBook={(serviceId) => { setBookingServiceId(serviceId); setBookingOpen(true); }} />
        </div>
        <WebsiteServiceBooking
          companyId={companyId}
          serviceId={bookingServiceId}
          serviceName={(servicesQuery.data ?? []).find((service) => service.id === bookingServiceId)?.name ?? ""}
          services={(servicesQuery.data ?? []).map((service) => ({ id: service.id, name: service.name }))}
          open={bookingOpen}
          onOpenChange={(open) => { setBookingOpen(open); if (!open) setBookingServiceId(null); }}
          onServiceChange={setBookingServiceId}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-base font-semibold">{t("websiteBuilder.title")}</h1>
          <Badge variant={draft.published ? "default" : "secondary"}>
            {draft.published ? t("websiteBuilder.builder.statusPublished") : t("websiteBuilder.builder.statusDraft")}
          </Badge>
          <div className="min-w-0">
            <label className="flex min-w-0 items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
              <span className="shrink-0 text-muted-foreground">{window.location.origin}/site/</span>
              <input
                aria-label={t("websiteBuilder.slug")}
                value={draft.slug}
                disabled={locked}
                spellCheck={false}
                className="w-36 min-w-0 bg-transparent font-medium text-foreground outline-none disabled:opacity-60"
                onChange={(event) => setDraft((current) => current ? { ...current, slug: event.target.value } : current)}
                onBlur={() => {
                  if (!normalizedSlug) return;
                  setDraft((current) => current && current.slug !== normalizedSlug ? { ...current, slug: normalizedSlug } : current);
                }}
              />
            </label>
            {slugTaken ? <p className="mt-1 text-xs text-destructive">{t("websiteBuilder.blockers.slug_taken")}</p> : null}
            {slugInvalid ? <p className="mt-1 text-xs text-destructive">{t("websiteBuilder.blockers.slug_invalid")}</p> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked || !companySlug || companySlug === normalizedSlug}
            onClick={() => setDraft((current) => current && companySlug ? { ...current, slug: companySlug } : current)}
          >
            {t("websiteBuilder.useCompanyName")}
          </Button>
          {shareUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(shareUrl)}>
              {t("websiteBuilder.builder.copyUrl")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" disabled={!canUndo} onClick={undo}>{t("websiteBuilder.builder.visual.undo")}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={!canRedo} onClick={redo}>{t("websiteBuilder.builder.visual.redo")}</Button>
          {(["desktop", "tablet", "mobile"] as const).map((size) => (
            <Button key={size} type="button" size="sm" variant={viewport === size ? "default" : "ghost"} onClick={() => setViewport(size)}>
              {t(`websiteBuilder.builder.viewport.${size}`)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setPreviewing(true)}>
            <Eye className="size-4" aria-hidden />
            {t("websiteBuilder.builder.preview")}
          </Button>
          {previewPath && draft.published ? (
            <Button variant="ghost" asChild>
              <a href={previewPath} target="_blank" rel="noreferrer">
                {t("websiteBuilder.openSite")}
              </a>
            </Button>
          ) : null}
          {draft.published ? (
            <Button type="button" variant="ghost" disabled={actionsDisabled} onClick={() => void save(false)}>
              {t("websiteBuilder.unpublish")}
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={actionsDisabled} onClick={() => void save(false)}>
              {t("websiteBuilder.saveDraft")}
            </Button>
          )}
          <Button type="button" disabled={actionsDisabled} onClick={() => void save(true)}>
            {draft.published ? t("websiteBuilder.update") : t("websiteBuilder.publish")}
          </Button>
        </div>
      </header>

      {!draft.pageFeature ? (
        <Alert className="m-3">
          <AlertDescription>{t("websiteBuilder.featureOff")}</AlertDescription>
        </Alert>
      ) : null}
      <WebsiteVisualStudio
        companyId={companyId}
        draft={draft}
        locked={locked}
        preview={{ ...preview, urlLabel: shareUrl ?? preview.urlLabel }}
        services={(servicesQuery.data ?? []).map((service) => ({ id: service.id, name: service.name, priceCents: service.priceCents, currency: service.currency }))}
        hours={hours}
        selection={selection}
        viewport={viewport}
        onSelect={setSelection}
        onChange={editDraft}
        onBook={(serviceId) => { setBookingServiceId(serviceId); setBookingOpen(true); }}
      />
      <WebsiteServiceBooking
        companyId={companyId}
        serviceId={bookingServiceId}
        serviceName={(servicesQuery.data ?? []).find((service) => service.id === bookingServiceId)?.name ?? ""}
        services={(servicesQuery.data ?? []).map((service) => ({ id: service.id, name: service.name }))}
        open={bookingOpen}
        onOpenChange={(open) => { setBookingOpen(open); if (!open) setBookingServiceId(null); }}
        onServiceChange={setBookingServiceId}
      />
    </div>
  );
}

function BuilderState({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 items-center justify-center p-6">{children}</div>;
}
