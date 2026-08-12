import { describe, expect, it } from "vitest";
import { detectInstalledBrowsers } from "./index";

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
