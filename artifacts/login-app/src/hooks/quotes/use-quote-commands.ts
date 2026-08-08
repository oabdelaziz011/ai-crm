import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";

function useQuoteServices() {
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

export function useQuotesList(filter?: {
  opportunityId?: string;
  status?: string;
  currentOnly?: boolean;
}) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useQuoteServices();
  const canView = isSuperAdmin || hasPermission("quotes.view");

  return useQuery({
    queryKey: ["quotes-workspace", "list", companyId, filter],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().quote.listQuotes(filter ?? {}, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useOpportunityQuotes(opportunityId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useQuoteServices();
  const canView = isSuperAdmin || hasPermission("quotes.view");

  return useQuery({
    queryKey: ["quotes-workspace", "opportunity", companyId, opportunityId],
    enabled: Boolean(companyId && opportunityId && canView),
    queryFn: async () => {
      if (!opportunityId) return { items: [], total: 0 };
      const result = await servicesFactory().quote.listQuotes(
        { opportunityId, currentOnly: true },
        contextFactory(),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useQuote360(quoteId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useQuoteServices();
  const canView = isSuperAdmin || hasPermission("quotes.view");

  return useQuery({
    queryKey: ["quote360-workspace", quoteId, companyId],
    enabled: Boolean(companyId && quoteId && canView),
    queryFn: async () => {
      if (!quoteId) return null;
      const svc = servicesFactory();
      const ctx = contextFactory();
      const quote = await svc.quote.getQuote(quoteId, ctx);
      if (!quote.ok) throw new Error(quote.error.message);
      if (!quote.data) return null;

      const [lines, versions, history, approvals, templates] = await Promise.all([
        svc.quote.listLines(quoteId, ctx),
        svc.quote.listVersions(quote.data.quoteFamilyId, ctx),
        svc.quote.listHistory(quoteId, ctx),
        svc.quote.listApprovals(quoteId, ctx),
        svc.quote.listTemplates(ctx),
      ]);

      if (!lines.ok) throw new Error(lines.error.message);
      if (!versions.ok) throw new Error(versions.error.message);
      if (!history.ok) throw new Error(history.error.message);
      if (!approvals.ok) throw new Error(approvals.error.message);
      if (!templates.ok) throw new Error(templates.error.message);

      return {
        quote: quote.data,
        lines: lines.data,
        versions: versions.data,
        history: history.data,
        approvals: approvals.data,
        templates: templates.data,
      };
    },
  });
}

export function useQuoteCommands() {
  const { contextFactory, servicesFactory } = useQuoteServices();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["quotes-workspace"] });
    void qc.invalidateQueries({ queryKey: ["quote360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
  };

  return {
    createFromOpportunity: useMutation({
      mutationFn: async (input: {
        opportunityId: string;
        templateId?: string | null;
        title?: string;
      }) => {
        const result = await servicesFactory().quote.createFromOpportunity(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    createVersion: useMutation({
      mutationFn: async (quoteId: string) => {
        const result = await servicesFactory().quote.createVersion({ quoteId }, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    addCatalogProduct: useMutation({
      mutationFn: async (input: {
        quoteId: string;
        productId: string;
        quantity?: number;
        discountPercent?: number;
        taxPercent?: number;
      }) => {
        const result = await servicesFactory().quote.addCatalogProduct(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    updateLine: useMutation({
      mutationFn: async (input: {
        quoteId: string;
        lineId: string;
        quantity?: number;
        unitPrice?: number;
        discountPercent?: number;
        taxPercent?: number;
      }) => {
        const result = await servicesFactory().quote.updateLine(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    removeLine: useMutation({
      mutationFn: async (input: { quoteId: string; lineId: string }) => {
        const result = await servicesFactory().quote.removeLine(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    changeStatus: useMutation({
      mutationFn: async (input: { quoteId: string; status: string }) => {
        const result = await servicesFactory().quote.changeStatus(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    requestApproval: useMutation({
      mutationFn: async (quoteId: string) => {
        const result = await servicesFactory().quote.requestApproval({ quoteId }, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
    decideApproval: useMutation({
      mutationFn: async (input: {
        quoteId: string;
        approvalId: string;
        status: "approved" | "rejected";
        decisionNote?: string;
      }) => {
        const result = await servicesFactory().quote.decideApproval(input, contextFactory());
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      onSuccess: invalidate,
    }),
  };
}
