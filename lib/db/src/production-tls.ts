/**
 * Production TLS for the installed pg 8.22 / pg-connection-string 2.14 parser.
 *
 * A URL with no sslmode leaves `ssl` unset. The pg default is then `ssl: false`,
 * so the connection is plaintext. For a Supabase host, the pool receives
 * `{ rejectUnauthorized: true, ca }` using the public Supabase Root 2021 CA.
 * The URL is not rewritten. Hostname verification stays on.
 * `rejectUnauthorized: false` is never set. Node's default trust store does
 * not include that private root, which is why the pooler otherwise reports
 * "self-signed certificate in certificate chain".
 *
 * Without uselibpqcompat, sslmode require, verify-ca, and verify-full already
 * make the parser enable verifying TLS. Those URLs are left unchanged.
 * uselibpqcompat=true makes require skip verification, so that combination is
 * refused. libpq (psql) still treats require as encryption without verification;
 * the SQL apply script therefore keeps its own verify-full requirement.
 */

const SUPABASE_DATABASE_HOST = /(?:^|\.)supabase\.(?:co|com)$|(?:^|\.)pooler\.supabase\.com$/i;

/** Public Supabase Root 2021 CA. SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA */
export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

function supabaseSsl(): { rejectUnauthorized: true; ca: string } {
  return { rejectUnauthorized: true, ca: SUPABASE_ROOT_CA_2021 };
}

function parsedDatabaseUrl(connectionString: string): URL {
  try {
    return new URL(connectionString.trim().replace(/^postgresql:/i, "postgres:"));
  } catch {
    throw new Error("DATABASE_URL could not be parsed. Startup refused.");
  }
}

/**
 * Returns the explicit pg `ssl` option required for this URL.
 * `undefined` means the connection string already selects verifying TLS.
 */
export function productionDatabaseSsl(
  connectionString: string,
): { rejectUnauthorized: true; ca: string } | undefined {
  const url = parsedDatabaseUrl(connectionString);
  const params = url.searchParams;
  const sslmode = (params.get("sslmode") ?? "").toLowerCase();
  const compat = (params.get("uselibpqcompat") ?? "").toLowerCase() === "true";
  const sslFlag = (params.get("ssl") ?? "").toLowerCase();

  if (sslFlag === "0" || sslFlag === "false" || sslFlag === "disable" || sslFlag === "no-verify") {
    throw new Error(
      "Production DATABASE_URL must set sslmode=verify-full. Unverified and plaintext modes are refused.",
    );
  }
  if (sslmode === "disable" || sslmode === "allow" || sslmode === "prefer" || sslmode === "no-verify") {
    throw new Error(
      "Production DATABASE_URL must set sslmode=verify-full. Unverified and plaintext modes are refused.",
    );
  }
  if (compat && sslmode !== "verify-full") {
    throw new Error(
      "Production DATABASE_URL uses uselibpqcompat with a mode that disables certificate checks. Use sslmode=verify-full.",
    );
  }
  if (sslmode === "verify-full" || sslmode === "require" || sslmode === "verify-ca") {
    return undefined;
  }
  if (sslmode === "") {
    if (SUPABASE_DATABASE_HOST.test(url.hostname)) {
      return supabaseSsl();
    }
    throw new Error(
      "Production DATABASE_URL must set sslmode=verify-full. Unverified and plaintext modes are refused.",
    );
  }
  throw new Error("Production DATABASE_URL sslmode is not a certificate-verifying mode. Startup refused.");
}

export function assertProductionDatabaseTls(connectionString: string): void {
  productionDatabaseSsl(connectionString);
}
