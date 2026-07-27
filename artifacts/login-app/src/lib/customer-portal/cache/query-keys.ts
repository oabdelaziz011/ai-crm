export const PORTAL_PROFILE_KEY = ["portal-profile"] as const;
export const PORTAL_SERVICES_KEY = ["portal-services"] as const;
export const PORTAL_RESOURCES_KEY = ["portal-resources"] as const;
export const PORTAL_SLOTS_KEY = ["portal-slots"] as const;
export const PORTAL_APPOINTMENTS_KEY = ["portal-appointments"] as const;

export function portalProfileKey(slug: string) {
  return [...PORTAL_PROFILE_KEY, slug] as const;
}

export function portalServicesKey(companyId: string) {
  return [...PORTAL_SERVICES_KEY, companyId] as const;
}

export function portalResourcesKey(companyId: string, serviceId?: string) {
  return [...PORTAL_RESOURCES_KEY, companyId, serviceId ?? "all"] as const;
}

export function portalSlotsKey(companyId: string, resourceId: string, serviceId: string, date: string) {
  return [...PORTAL_SLOTS_KEY, companyId, resourceId, serviceId, date] as const;
}

export function portalAppointmentsKey(companyId: string, customerId: string, filter: string) {
  return [...PORTAL_APPOINTMENTS_KEY, companyId, customerId, filter] as const;
}
