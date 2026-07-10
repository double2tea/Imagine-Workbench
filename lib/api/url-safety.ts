import { ApiError } from "./errors";

const BLOCKED_HOSTNAMES = new Set(["0.0.0.0", "localhost"]);

export function assertPublicHttpUrl(value: string, code = "unsafe_remote_url"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(502, code, "Provider result URL must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(502, code, "Provider result URL must use http or https");
  }

  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new ApiError(502, code, "Provider result URL cannot target local or private network addresses");
  }

  return url;
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) return true;
  if (isBlockedIpv4(hostname)) return true;
  return isBlockedIpv6(hostname);
}

export function assertPublicIpAddress(address: string, code = "unsafe_remote_url"): void {
  const normalized = normalizeHostname(address);
  if (isBlockedIpv4(normalized) || isBlockedIpv6(normalized)) {
    throw new ApiError(502, code, "Provider result URL cannot resolve to local or private network addresses");
  }
}

export async function fetchPublicHttpUrlWithRedirectValidation(
  value: string,
  init: RequestInit = {},
  code = "unsafe_remote_url",
): Promise<Response> {
  let url = assertPublicHttpUrl(value, code);
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirectCount === 4) throw new ApiError(502, code, "Provider result URL exceeded the redirect limit");
    const location = response.headers.get("Location");
    if (!location) throw new ApiError(502, code, "Provider result redirect is missing Location");
    url = assertPublicHttpUrl(new URL(location, url).href, code);
  }
  throw new ApiError(502, code, "Provider result URL exceeded the redirect limit");
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(part => Number(part));
  if (!octets.every(Number.isInteger)) return false;
  if (!octets.every(octet => octet >= 0 && octet <= 255)) return false;

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const mappedIpv4 = readIpv4MappedIpv6(hostname);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  return (
    hostname === "::1" ||
    hostname === "::" ||
    hostname.startsWith("64:ff9b:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("ff") ||
    hostname === "2001:db8::" ||
    hostname.startsWith("2001:db8:")
  );
}

function readIpv4MappedIpv6(hostname: string): string | undefined {
  const prefix = "::ffff:";
  if (!hostname.startsWith(prefix)) return undefined;

  const suffix = hostname.slice(prefix.length);
  if (suffix.includes(".")) return suffix;

  const parts = suffix.split(":");
  if (parts.length !== 2) return undefined;

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return undefined;
  }

  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}
