import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BrandSurfacePreview } from "@/components/company-workspace/brand-center/brand-surface-previews";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  BrandPreviewSurface,
  CompanyBrandCenterDocument,
  CompanyContactSnapshot,
} from "@/lib/company-workspace/brand-center/types";

const PREVIEW_ALL_SURFACES: BrandPreviewSurface[] = [
  "crm",
  "operations",
  "company",
  "sidebar",
  "header",
  "email",
  "invoice",
  "portal",
  "login",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: CompanyBrandCenterDocument;
  contact: CompanyContactSnapshot;
};

export function BrandPreviewAllDrawer({
  open,
  onOpenChange,
  document,
  contact,
}: Props) {
  const { t } = useTranslation("common");
  const { colors } = document;
  const shellStyle = {
    ["--brand-primary" as string]: colors.primary,
    ["--brand-secondary" as string]: colors.secondary,
  } as CSSProperties;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        style={shellStyle}
      >
        <SheetHeader className="border-b border-border/50 px-5 py-4 text-start">
          <SheetTitle>{t("companyWorkspace.brandCenter.previewAll.title")}</SheetTitle>
          <SheetDescription>
            {t("companyWorkspace.brandCenter.previewAll.subtitle")}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {PREVIEW_ALL_SURFACES.map((surface) => (
            <section key={surface} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`companyWorkspace.brandCenter.surfaces.${surface}`)}
              </h3>
              <div
                className="overflow-hidden rounded-xl border border-border/50"
                style={{ backgroundColor: colors.background }}
              >
                <BrandSurfacePreview
                  document={document}
                  surface={surface}
                  contact={contact}
                />
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
