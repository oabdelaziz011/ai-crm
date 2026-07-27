import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationsDataService } from "@/lib/scheduling/operations/services/operations-data-service";
import type { OperationsFilters } from "@/lib/scheduling/operations/types";
import { ExecutiveDataRepository } from "@/lib/executive/repositories/executive-data-repository";
import { buildExecutiveSummary } from "@/lib/executive/selectors/executive-summary-selector";
import { buildOperationalKpis } from "@/lib/executive/selectors/operational-kpi-selector";
import { buildFinancialKpis } from "@/lib/executive/selectors/financial-kpi-selector";
import { buildCustomerKpis } from "@/lib/executive/selectors/customer-kpi-selector";
import { buildCommunicationKpis } from "@/lib/executive/selectors/communication-kpi-selector";
import { buildBranchIntelligence } from "@/lib/executive/selectors/branch-intelligence-selector";
import { buildDoctorIntelligence } from "@/lib/executive/selectors/doctor-intelligence-selector";
import type { ExecutiveContext, ExecutiveDashboardSnapshot } from "@/lib/executive/types";

/** KPI engine — composes platform data through selectors. */
export class KpiEngineService {
  private readonly dataRepo: ExecutiveDataRepository;
  private readonly operations: OperationsDataService;

  constructor(client: SupabaseClient) {
    this.dataRepo = new ExecutiveDataRepository(client);
    this.operations = new OperationsDataService(client);
  }

  async buildSnapshot(context: ExecutiveContext): Promise<ExecutiveDashboardSnapshot> {
    const raw = await this.dataRepo.loadRawData(context.companyId, context.date, context.branchId);

    const opsFilters: OperationsFilters = {
      datePreset: "custom",
      date: context.date,
      branchId: context.branchId ?? null,
      resourceIds: [],
      serviceIds: [],
      statuses: [],
      search: "",
    };

    let advancedOps: {
      peakHour: string | null;
      averageWaitMinutes: number;
      capacityUtilization: number;
      resourceUtilizationPercent: number;
    } | undefined;

    try {
      const opsData = await this.operations.loadDayData(context.companyId, opsFilters, context.timezone);
      advancedOps = {
        peakHour: opsData.advancedKpis.peakHour,
        averageWaitMinutes: opsData.advancedKpis.averageWaitMinutes,
        capacityUtilization: opsData.capacity.utilizationPercent,
        resourceUtilizationPercent: opsData.advancedKpis.resourceUtilizationPercent,
      };
    } catch {
      advancedOps = undefined;
    }

    const doctors = buildDoctorIntelligence(raw);
    const branches = buildBranchIntelligence(raw);

    return {
      summary: buildExecutiveSummary(raw),
      operational: buildOperationalKpis(raw, advancedOps),
      financial: buildFinancialKpis(raw, doctors.length, branches.length),
      customer: buildCustomerKpis(raw),
      communication: buildCommunicationKpis(raw),
      branches,
      doctors,
      alerts: [],
      forecasts: [],
      timeline: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
