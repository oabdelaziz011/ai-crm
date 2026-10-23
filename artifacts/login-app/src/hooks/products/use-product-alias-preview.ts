import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { isLoginAppProductAliasGenerationEnabled } from "@/lib/product-platform/product-alias-generation-flag.js";
import {
  canPreviewProductAliases,
  generateProductAliasPreview,
  productAliasPreviewKey,
  type ProductAliasPreviewInput,
} from "@/lib/product-platform/product-alias-preview.js";
import { aliasesListToText, aliasesTextToList } from "@/components/products/product-aliases-field";

export type ProductAliasPreviewStatus = "idle" | "pending" | "ready" | "failed";

type PreviewFields = {
  name: string;
  description: string;
  productType: string;
  brand: string;
  categoryName: string | null;
  aliasesText: string;
  enabled: boolean;
  onAliasesGenerated: (aliasesText: string) => void;
};

/**
 * Debounced AI alias preview for the product create dialog.
 * Fills the aliases field while the popup is still open.
 * Does not overwrite manual edits after the user changes the field.
 */
export function useProductAliasPreview(fields: PreviewFields): {
  status: ProductAliasPreviewStatus;
  generateNow: () => Promise<string[]>;
} {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const flagOn = isLoginAppProductAliasGenerationEnabled();
  const [status, setStatus] = useState<ProductAliasPreviewStatus>("idle");

  const lastAutoTextRef = useRef<string>("");
  const lastKeyRef = useRef<string>("");
  const userEditedRef = useRef(false);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // Detect manual edits: if aliases text diverges from last auto fill, stop overwriting.
  useEffect(() => {
    const current = fields.aliasesText;
    if (!current.trim()) {
      userEditedRef.current = false;
      return;
    }
    if (current !== lastAutoTextRef.current) {
      userEditedRef.current = true;
    }
  }, [fields.aliasesText]);

  const generateNow = async (): Promise<string[]> => {
    if (!companyId || !flagOn) return aliasesTextToList(fieldsRef.current.aliasesText);
    const current = fieldsRef.current;
    if (!canPreviewProductAliases(current)) return aliasesTextToList(current.aliasesText);

    const input: ProductAliasPreviewInput = {
      companyId,
      name: current.name,
      description: current.description,
      productType: current.productType,
      brand: current.brand,
      categoryName: current.categoryName,
    };
    const key = productAliasPreviewKey(input);
    setStatus("pending");
    try {
      const { aliases } = await generateProductAliasPreview(input);
      const text = aliasesListToText(aliases);
      lastKeyRef.current = key;
      lastAutoTextRef.current = text;
      userEditedRef.current = false;
      current.onAliasesGenerated(text);
      setStatus("ready");
      return aliases;
    } catch {
      setStatus("failed");
      return aliasesTextToList(fieldsRef.current.aliasesText);
    }
  };

  useEffect(() => {
    if (!fields.enabled) {
      setStatus("idle");
      lastKeyRef.current = "";
      lastAutoTextRef.current = "";
      userEditedRef.current = false;
      return;
    }
    if (!flagOn || !companyId) {
      setStatus("idle");
      return;
    }
    if (userEditedRef.current) return;
    if (!canPreviewProductAliases(fields)) {
      setStatus("idle");
      return;
    }

    const input: ProductAliasPreviewInput = {
      companyId,
      name: fields.name,
      description: fields.description,
      productType: fields.productType,
      brand: fields.brand,
      categoryName: fields.categoryName,
    };
    const key = productAliasPreviewKey(input);
    if (key === lastKeyRef.current && lastAutoTextRef.current) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus("pending");
      void generateProductAliasPreview(input)
        .then(({ aliases }) => {
          if (cancelled || userEditedRef.current) return;
          const text = aliasesListToText(aliases);
          lastKeyRef.current = key;
          lastAutoTextRef.current = text;
          fieldsRef.current.onAliasesGenerated(text);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("failed");
        });
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    fields.enabled,
    fields.name,
    fields.description,
    fields.productType,
    fields.brand,
    fields.categoryName,
    companyId,
    flagOn,
  ]);

  return { status, generateNow };
}
