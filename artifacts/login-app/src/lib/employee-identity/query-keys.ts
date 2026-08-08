export const employeeIdentityKeys = {
  all: ["employee-identity"] as const,
  byId: (id: string) => [...employeeIdentityKeys.all, "id", id] as const,
  many: (ids: readonly string[]) =>
    [...employeeIdentityKeys.all, "many", [...ids].sort().join("|")] as const,
  company: (companyId: string) => [...employeeIdentityKeys.all, "company", companyId] as const,
};
