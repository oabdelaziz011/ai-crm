export function serviceIdsForBranch(
  offers: { branchId: string; serviceId: string }[],
  branchId: string,
): Set<string> {
  return new Set(offers.filter((offer) => offer.branchId === branchId).map((offer) => offer.serviceId));
}
