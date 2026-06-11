import { ApiError } from "./errors";

const BLOCKED_HOSTNAMES = new Set(["0.0.0.0", "localhost"]);

export function assertPublicHttpUrl(value: string, code = "unsafe_remote_url"): URL {
  const url = new URL(value);
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

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(part => Number(part));
  if (!octets.every(Number.isInteger)) return false;
  if (!octets.every(octet => octet >= 0 && octet <= 255)) return false;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isBlockedIpv6(hostname: string): boolean {
  return (
    hostname === "::1" ||
    hostname === "::" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:")
  );
}
