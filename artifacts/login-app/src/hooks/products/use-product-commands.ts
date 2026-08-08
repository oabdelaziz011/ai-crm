import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";

function useProductServices() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const contextFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return buildApplicationContext({
      tenantId: company.id,
      actorId: user.id,
      permissions: permissionCodes(hasPermission, isSuperAdmin),
    });
  };

  const servicesFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return createLoginAppApplicationLayerRegistry({
      companyId: company.id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    }).getServices();
  };

  return { companyId: company?.id ?? null, contextFactory, servicesFactory, hasPermission, isSuperAdmin };
}

export function useProductCatalog(filter?: { query?: string; productType?: string; activeOnly?: boolean }) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } = useProductServices();
  const canView = isSuperAdmin || hasPermission("products.view");

  return useQuery({
    queryKey: ["products-workspace", "list", companyId, filter],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().product.listProducts(filter ?? {}, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
      if (!product.ok) throw new Error(product.error.message);
      if (!history.ok) throw new Error(history.error.message);
      if (!regional.ok) throw new Error(regional.error.message);
      return { product: product.data, history: history.data, regional: regional.data };
    },
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
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
    }) => {
      const result = await servicesFactory().product.createProduct(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const createCategory = useMutation({
    mutationFn: async (input: { name: string; parentId?: string | null }) => {
      const result = await servicesFactory().product.createCategory(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
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
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const removeLine = useMutation({
    mutationFn: async (input: { lineId: string }) => {
      const result = await servicesFactory().product.removeOpportunityLine(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
    },
    onSuccess: invalidate,
  });

  return { create, createCategory, upsertRegionalPrice, attachToOpportunity, updateLine, removeLine };
}
