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

function useQuoteServices() {
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
      return unwrapQueryResult(result);
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
        { opportunityId },
        contextFactory(),
      );
      return unwrapQueryResult(result);
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
      const quoteResult = await svc.quote.getQuote(quoteId, ctx);
      const quote = unwrapQueryResult(quoteResult);
      if (!quote) return null;

      const [lines, versions, history, approvals, templates] = await Promise.all([
        svc.quote.listLines(quoteId, ctx),
        svc.quote.listVersions(quote.quoteFamilyId, ctx),
        svc.quote.listHistory(quoteId, ctx),
        svc.quote.listApprovals(quoteId, ctx),
        svc.quote.listTemplates(ctx),
      ]);

      return {
        quote,
        lines: unwrapQueryResult(lines),
        versions: unwrapQueryResult(versions),
        history: unwrapQueryResult(history),
        approvals: unwrapQueryResult(approvals),
        templates: unwrapQueryResult(templates),
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
        return unwrapCommandResult(result);
      },
      onSuccess: () => {
        // Non-blocking refresh so the picker can close immediately.
        invalidate();
      },
    }),
    createVersion: useMutation({
      mutationFn: async (quoteId: string) => {
        const result = await servicesFactory().quote.createVersion({ quoteId }, contextFactory());
        return unwrapCommandResult(result);
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
        return unwrapCommandResult(result);
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
        return unwrapCommandResult(result);
      },
      onSuccess: invalidate,
    }),
    removeLine: useMutation({
      mutationFn: async (input: { quoteId: string; lineId: string }) => {
        const result = await servicesFactory().quote.removeLine(input, contextFactory());
        return unwrapCommandResult(result);
      },
      onSuccess: invalidate,
    }),
    updateDetails: useMutation({
      mutationFn: async (input: {
        quoteId: string;
        language?: string;
        title?: string;
        notes?: string;
        contactName?: string;
      }) => {
        const result = await servicesFactory().quote.updateDetails(input, contextFactory());
        return unwrapCommandResult(result);
      },
      onSuccess: invalidate,
    }),
    changeStatus: useMutation({
      mutationFn: async (input: { quoteId: string; status: string }) => {
        const result = await servicesFactory().quote.changeStatus(input, contextFactory());
        return unwrapCommandResult(result);
      },
      onSuccess: invalidate,
    }),
    requestApproval: useMutation({
      mutationFn: async (quoteId: string) => {
        const result = await servicesFactory().quote.requestApproval({ quoteId }, contextFactory());
        return unwrapCommandResult(result);
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
        return unwrapCommandResult(result);
      },
      onSuccess: invalidate,
    }),
  };
}
