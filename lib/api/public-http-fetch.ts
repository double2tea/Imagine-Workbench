import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { ApiError } from "./errors";
import { assertPublicHttpUrl, assertPublicIpAddress } from "./url-safety";
export { limitedResponseBody, readResponseBytesWithLimit } from "./response-body";

const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADERS = new Set(["authorization", "api-key", "cookie", "cookie2", "proxy-authorization", "x-api-key"]);

type PinnedRequester = (url: URL, address: string, headers: Headers, signal?: AbortSignal) => Promise<Response>;

export interface PublicHttpFetchOptions {
  code?: string;
  headers?: HeadersInit;
  requester?: PinnedRequester;
  resolver?: (hostname: string) => Promise<readonly string[]>;
  signal?: AbortSignal;
}

export async function fetchPublicHttpUrl(value: string | URL, options: PublicHttpFetchOptions = {}): Promise<Response> {
  const code = options.code ?? "unsafe_remote_url";
  const requester = options.requester ?? requestPinnedUrl;
  const resolver = options.resolver ?? resolveHostname;
  const headers = new Headers(options.headers);
  let url = assertPublicHttpUrl(String(value), code);
  let redirectCount = 0;

  while (true) {
    const addresses = await resolvePublicAddresses(url, resolver, code);
    const response = await requester(url, addresses[0], headers, options.signal);
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    await response.body?.cancel();
    if (redirectCount === MAX_REDIRECTS) {
      throw new ApiError(502, code, "Provider result URL exceeded the redirect limit");
    }
    redirectCount += 1;
    const location = response.headers.get("location");
    if (!location) throw new ApiError(502, code, "Provider result redirect is missing Location");
    const nextUrl = readRedirectUrl(location, url, code);
    if (nextUrl.origin !== url.origin && hasSensitiveHeaders(headers)) {
      throw new ApiError(502, code, "Provider result URL cannot redirect credentials to another origin");
    }
    url = nextUrl;
  }
}

async function resolvePublicAddresses(
  url: URL,
  resolver: (hostname: string) => Promise<readonly string[]>,
  code: string,
): Promise<readonly string[]> {
  const addresses = await resolver(url.hostname);
  if (addresses.length === 0) throw new ApiError(502, code, "Provider result hostname did not resolve");
  for (const address of addresses) assertPublicIpAddress(address, code);
  return addresses;
}

async function resolveHostname(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(result => result.address);
}

function hasSensitiveHeaders(headers: Headers): boolean {
  for (const name of SENSITIVE_HEADERS) {
    if (headers.has(name)) return true;
  }
  return false;
}

function readRedirectUrl(location: string, baseUrl: URL, code: string): URL {
  try {
    return assertPublicHttpUrl(new URL(location, baseUrl).href, code);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, code, "Provider result redirect has an invalid Location");
  }
}

function requestPinnedUrl(url: URL, address: string, headers: Headers, signal?: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("Host")) requestHeaders.set("Host", url.host);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
      headers: Object.fromEntries(requestHeaders.entries()),
      hostname: address,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      port: url.port || undefined,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    }, response => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach(entry => responseHeaders.append(name, entry));
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        headers: responseHeaders,
        status: response.statusCode ?? 502,
        statusText: response.statusMessage,
      }));
    });
    request.once("error", reject);
    if (signal) {
      if (signal.aborted) request.destroy(signal.reason);
      else signal.addEventListener("abort", () => request.destroy(signal.reason), { once: true });
    }
    request.end();
  });
}
