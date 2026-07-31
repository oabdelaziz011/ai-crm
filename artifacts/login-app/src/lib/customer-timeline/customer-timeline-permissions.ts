export function canViewCustomerTimeline(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("customers.view");
}

export function canViewAccountTimeline(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("customers.view");
}
