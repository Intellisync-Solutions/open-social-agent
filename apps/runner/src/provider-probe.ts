import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { z } from "zod";

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) })),
});

export class ProviderProbeError extends Error {
  constructor(
    readonly status: number | undefined,
    code: string,
  ) {
    super(code);
  }
}

export async function runProviderProbe({
  apiKey,
  baseURL,
}: {
  apiKey: string;
  baseURL: string;
}): Promise<number> {
  const url = new URL(`${baseURL.replace(/\/$/, "")}/models`);
  const addresses = await dnsLookup(url.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new ProviderProbeError(undefined, "PROVIDER_DNS_REJECTED");
  }

  const pinned = addresses[0];
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [pinned]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
  return new Promise<number>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        lookup: pinnedLookup,
        timeout: 10_000,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new ProviderProbeError(status, "PROVIDER_HTTP_REJECTED"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_048_576) {
            request.destroy(
              new ProviderProbeError(status, "PROVIDER_RESPONSE_TOO_LARGE"),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            const parsed = modelListSchema.safeParse(
              JSON.parse(Buffer.concat(chunks).toString("utf8")),
            );
            if (!parsed.success) {
              reject(
                new ProviderProbeError(200, "PROVIDER_RESPONSE_INVALID"),
              );
              return;
            }
            resolve(Math.min(parsed.data.data.length, 500));
          } catch {
            reject(
              new ProviderProbeError(200, "PROVIDER_RESPONSE_INVALID"),
            );
          }
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(new ProviderProbeError(undefined, "PROVIDER_TIMEOUT")),
    );
    request.on("error", reject);
    request.end();
  });
}

export function validateProviderBaseUrl(
  value: string | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      isPrivateIp(hostname)
    )
      return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isPrivateIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (version === 4) {
    const octets = hostname.split(".").map(Number);
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
  if (version === 6) {
    const normalized = hostname.toLowerCase();
    const firstGroup = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
    // Public global-unicast IPv6 is 2000::/3. Reject every special, local,
    // mapped, multicast, documentation, and non-routable range outside it.
    return firstGroup < 0x2000 || firstGroup > 0x3fff;
  }
  return false;
}
