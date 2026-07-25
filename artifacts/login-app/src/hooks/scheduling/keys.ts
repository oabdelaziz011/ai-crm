export const SCHEDULING_SERVICES_KEY = ["scheduling", "services"] as const;
export const SCHEDULING_CAPABILITIES_KEY = ["scheduling", "capabilities"] as const;

export function schedulingServicesKey(companyId: string | null) {
  return [...SCHEDULING_SERVICES_KEY, companyId] as const;
}

export function schedulingServiceKey(companyId: string | null, serviceId: string | null) {
  return [...SCHEDULING_SERVICES_KEY, companyId, serviceId] as const;
}

export function schedulingResourceCapabilitiesKey(
  companyId: string | null,
  resourceId: string | null,
) {
  return [...SCHEDULING_CAPABILITIES_KEY, "resource", companyId, resourceId] as const;
}

export function schedulingServiceResourcesKey(
  companyId: string | null,
  serviceId: string | null,
) {
  return [...SCHEDULING_CAPABILITIES_KEY, "service", companyId, serviceId] as const;
}
