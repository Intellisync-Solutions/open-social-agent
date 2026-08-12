import { describe, expect, it } from "vitest";
import {
  assertAllowedNavigation,
  detectInstalledBrowsers,
  directVerificationState,
  isolatedProfilePath,
  validateBrowserAction,
} from "./index";

describe("installed browser detection", () => {
  it("returns only executable allowlisted macOS browsers", async () => {
    const detected = await detectInstalledBrowsers({
      platform: "darwin",
      canExecute: async (path) =>
        path.includes("Brave Browser") || path.includes("Google Chrome"),
    });
    expect(detected.map((browser) => browser.kind)).toEqual([
      "brave",
      "chrome",
    ]);
  });

  it("does not guess unsupported platform paths", async () => {
    expect(
      await detectInstalledBrowsers({
        platform: "win32",
        canExecute: async () => true,
      }),
    ).toEqual([]);
  });
});

describe("browser publication corridor", () => {
  it("derives an app-owned profile path", () => {
    expect(isolatedProfilePath("/tmp/osa", "user_12345678", "brave")).toBe(
      "/tmp/osa/browser-profiles/user_12345678/brave",
    );
  });

  it("rejects cross-origin and sibling-path navigation", () => {
    expect(() =>
      assertAllowedNavigation(
        "https://attacker.example/feed/acme",
        "https://social.example/feed/acme",
      ),
    ).toThrow("DOMAIN_NOT_ALLOWED");
    expect(() =>
      assertAllowedNavigation(
        "https://social.example/feed/other",
        "https://social.example/feed/acme",
      ),
    ).toThrow("DOMAIN_NOT_ALLOWED");
    expect(() =>
      assertAllowedNavigation(
        "https://social.example/feed/acme",
        "https://user:password@social.example/feed/acme",
      ),
    ).toThrow("DOMAIN_NOT_ALLOWED");
  });

  it("rejects typing anything except the approved body", () => {
    expect(() =>
      validateBrowserAction(
        { type: "type", text: "changed text" },
        {
          allowedDestinationUrl: "https://social.example/feed/acme",
          approvedBody: "approved text",
          viewport: { width: 1280, height: 720 },
        },
      ),
    ).toThrow("APPROVAL_CONTENT_MISMATCH");
  });

  it("rejects out-of-bounds coordinates and unsupported modifiers", () => {
    const policy = {
      allowedDestinationUrl: "https://social.example/feed/acme",
      approvedBody: "approved text",
      viewport: { width: 1280, height: 720 },
    };
    expect(() =>
      validateBrowserAction(
        { type: "click", x: 1280, y: 50, button: "left" },
        policy,
      ),
    ).toThrow("COMPUTER_COORDINATE_OUT_OF_BOUNDS");
    expect(() =>
      validateBrowserAction(
        { type: "click", x: 100, y: 50, button: "left", keys: ["CTRL"] },
        policy,
      ),
    ).toThrow("COMPUTER_MODIFIERS_UNSUPPORTED");
  });

  it("requires direct detail URL and body evidence for live", () => {
    expect(
      directVerificationState({
        currentUrl: "https://social.example/feed/acme/post/123",
        destinationUrl: "https://social.example/feed/acme",
        renderedBody: "approved text",
        approvedBody: "approved text",
      }),
    ).toBe("live");
    expect(
      directVerificationState({
        currentUrl: "https://social.example/feed/acme",
        destinationUrl: "https://social.example/feed/acme",
        renderedBody: "approved text",
        approvedBody: "approved text",
      }),
    ).toBe("pending");
  });
});
