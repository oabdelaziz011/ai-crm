/** Maps Postgres/PostgREST role name uniqueness failures to a stable client code. */
export function mapRoleWriteError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("roles_company_id_name_key") ||
    (normalized.includes("duplicate key") && normalized.includes("roles_company_id_name"))
  ) {
    return "ROLE_NAME_ALREADY_EXISTS";
  }
  return message;
}
