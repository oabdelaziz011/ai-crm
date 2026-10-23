import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import {
  unwrapCommandResult,
  unwrapQueryResult,
} from "@/lib/application-layer/application-layer-result";

function useProductServices() {
  const { user, company } = useAuth();
  const {
    hasCompanyPermission,
    isSuperAdmin,
    buildPortContext,
  } = useCompanyPermissionAuth();

  const contextFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return buildApplicationContext({
      tenantId: company.id,
      actorId: user.id,
      permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
    });
  };

  const servicesFactory = () => {
    return createLoginAppApplicationLayerRegistry(buildPortContext()).getServices();
  };

  return {
    companyId: company?.id ?? null,
    contextFactory,
    servicesFactory,
    hasPermission: hasCompanyPermission,
    isSuperAdmin,
  };
}

export function useProductCatalog(filter?: { query?: string; productType?: string; activeOnly?: boolean }) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } = useProductServices();
  const canView = isSuperAdmin || hasPermission("products.view");

  return useQuery({
    queryKey: ["products-workspace", "list", companyId, filter],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().product.listProducts(filter ?? {}, contextFactory());
      return unwrapQueryResult(result);
    },
  });
}

export function useProductCategories() {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } = useProductServices();
  const canView = isSuperAdmin || hasPermission("products.view");

  return useQuery({
    queryKey: ["products-workspace", "categories", companyId],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().product.listCategories(contextFactory());
      return unwrapQueryResult(result);
    },
  });
}

export function useProduct360(productId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } = useProductServices();
  const canView = isSuperAdmin || hasPermission("products.view");

  return useQuery({
    queryKey: ["product360-workspace", productId, companyId],
    enabled: Boolean(companyId && productId && canView),
    queryFn: async () => {
      if (!productId) return null;
      const [product, history, regional] = await Promise.all([
        servicesFactory().product.getProduct(productId, contextFactory()),
        servicesFactory().product.listHistory(productId, contextFactory()),
        servicesFactory().product.listRegionalPrices(productId, contextFactory()),
      ]);
      const productData = unwrapQueryResult(product);
      if (!productData) return null;
      return {
        product: productData,
        history: unwrapQueryResult(history),
        regional: unwrapQueryResult(regional),
      };
    },
    refetchInterval: (query) =>
      query.state.data?.product?.aliasGeneration?.status === "pending" ? 2500 : false,
  });
}

export function useOpportunityLineItems(opportunityId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } = useProductServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunity360-workspace", "lines", opportunityId, companyId],
    enabled: Boolean(companyId && opportunityId && canView),
    queryFn: async () => {
      if (!opportunityId) return [];
      const result = await servicesFactory().product.listOpportunityLines(
        opportunityId,
        contextFactory(),
      );
      return unwrapQueryResult(result);
    },
  });
}

export function useProductCommands() {
  const { contextFactory, servicesFactory } = useProductServices();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["products-workspace"] });
    void qc.invalidateQueries({ queryKey: ["product360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
  };

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      sku: string;
      productType?: string;
      basePrice?: number;
      currency?: string;
      categoryId?: string | null;
      description?: string;
      brand?: string;
      cost?: number | null;
      taxClass?: string;
      priceTaxMode?: "inclusive" | "exclusive" | "unspecified";
      taxPercent?: number;
      subscriptionInterval?: "month" | "year" | "quarter" | null;
      subscriptionPrice?: number | null;
      unit?: string;
      trackInventory?: boolean;
      stockQuantity?: number | null;
      tags?: string[];
      aliases?: string[];
      imageUrls?: string[];
    }) => {
      const result = await servicesFactory().product.createProduct(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      productId: string;
      patch: {
        imageUrls?: string[];
        name?: string;
        sku?: string;
        description?: string;
        brand?: string;
        productType?: string;
        categoryId?: string | null;
        basePrice?: number;
        currency?: string;
        cost?: number | null;
        priceTaxMode?: "inclusive" | "exclusive" | "unspecified";
        taxPercent?: number;
        isActive?: boolean;
        subscriptionInterval?: "month" | "year" | "quarter" | null;
        subscriptionPrice?: number | null;
        unit?: string;
        trackInventory?: boolean;
        stockQuantity?: number | null;
        aliases?: string[];
      };
    }) => {
      const result = await servicesFactory().product.updateProduct(
        { productId: input.productId, patch: input.patch },
        contextFactory(),
      );
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const regenerateAliases = useMutation({
    mutationFn: async (input: { productId: string }) => {
      const result = await servicesFactory().product.regenerateProductAliases(
        input,
        contextFactory(),
      );
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (input: { productId: string }) => {
      const result = await servicesFactory().product.archiveProduct(input, contextFactory());
      unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const createCategory = useMutation({
    mutationFn: async (input: { name: string; parentId?: string | null }) => {
      const result = await servicesFactory().product.createCategory(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const upsertRegionalPrice = useMutation({
    mutationFn: async (input: {
      productId: string;
      localPrice: number;
      country?: string | null;
      market?: string | null;
      currencyOverride?: string | null;
    }) => {
      const result = await servicesFactory().product.upsertRegionalPrice(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const attachToOpportunity = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      productId: string;
      quantity?: number;
      discountPercent?: number;
      taxPercent?: number;
      country?: string | null;
      market?: string | null;
    }) => {
      const result = await servicesFactory().product.attachToOpportunity(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const updateLine = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      lineId: string;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
      taxPercent?: number;
    }) => {
      const result = await servicesFactory().product.updateOpportunityLine(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const removeLine = useMutation({
    mutationFn: async (input: { lineId: string }) => {
      const result = await servicesFactory().product.removeOpportunityLine(input, contextFactory());
      unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  return {
    create,
    update,
    regenerateAliases,
    archive,
    createCategory,
    upsertRegionalPrice,
    attachToOpportunity,
    updateLine,
    removeLine,
  };
}
