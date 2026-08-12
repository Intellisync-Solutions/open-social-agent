import { describe, expect, it } from "vitest";
import { isPrivateIp, validateProviderBaseUrl } from "./provider-probe";

describe("provider probe network policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPrivateIp(address)).toBe(true);
  });

  it("accepts a public HTTPS provider origin and path", () => {
    expect(validateProviderBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1",
    );
  });

  it.each([
    "http://api.example.com/v1",
    "https://user:pass@api.example.com/v1",
    "https://api.example.com/v1?target=internal",
    "https://127.0.0.1/v1",
    "https://metadata.localhost/v1",
  ])("rejects unsafe provider URL %s", (url) => {
    expect(validateProviderBaseUrl(url)).toBeNull();
  });
});
