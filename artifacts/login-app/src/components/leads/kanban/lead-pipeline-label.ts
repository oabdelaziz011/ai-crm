import type { TFunction } from "i18next";

/**
 * Localize known pipeline names (e.g. DB seed "Default Pipeline").
 * Custom tenant pipeline names pass through unchanged.
 */
export function translateLeadPipelineLabel(
  t: TFunction,
  pipeline: { name: string; slug?: string | null; isDefault?: boolean },
): string {
  const slug = (pipeline.slug ?? "").trim().toLowerCase();
  const nameKey = pipeline.name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const isDefault =
    pipeline.isDefault === true ||
    slug === "default" ||
    nameKey === "default" ||
    nameKey === "default_pipeline";

  if (isDefault) {
    const key = "leads.pipelines.default";
    const translated = t(key);
    if (translated !== key) return translated;
  }

  const slugKey = slug ? `leads.pipelines.${slug}` : "";
  if (slugKey) {
    const translated = t(slugKey);
    if (translated !== slugKey) return translated;
  }

  return pipeline.name;
}
