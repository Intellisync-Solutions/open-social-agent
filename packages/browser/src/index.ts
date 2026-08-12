import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { BrowserActionSchema } from "@open-social-agent/contracts";
import type { z } from "zod";
import { chromium, type BrowserContext } from "playwright-core";

export type SupportedBrowserKind = "brave" | "chrome" | "edge" | "chromium";

export type DetectedBrowser = {
  kind: SupportedBrowserKind;
  label: string;
  executablePath: string;
};

const macCandidates: ReadonlyArray<DetectedBrowser> = [
  {
    kind: "brave",
    label: "Brave Browser",
    executablePath:
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  },
  {
    kind: "chrome",
    label: "Google Chrome",
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  },
  {
    kind: "edge",
    label: "Microsoft Edge",
    executablePath:
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  },
  {
    kind: "chromium",
    label: "Chromium",
    executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
  },
];

const linuxCandidates: ReadonlyArray<DetectedBrowser> = [
  {
    kind: "brave",
    label: "Brave Browser",
    executablePath: "/usr/bin/brave-browser",
  },
  {
    kind: "chrome",
    label: "Google Chrome",
    executablePath: "/usr/bin/google-chrome",
  },
  {
    kind: "edge",
    label: "Microsoft Edge",
    executablePath: "/usr/bin/microsoft-edge",
  },
  { kind: "chromium", label: "Chromium", executablePath: "/usr/bin/chromium" },
];

export async function detectInstalledBrowsers(
  options: {
    platform?: NodeJS.Platform;
    canExecute?: (path: string) => Promise<boolean>;
  } = {},
): Promise<DetectedBrowser[]> {
  const platform = options.platform ?? process.platform;
  const candidates =
    platform === "darwin"
      ? macCandidates
      : platform === "linux"
        ? linuxCandidates
        : [];
  const canExecute = options.canExecute ?? isExecutable;
  const detected: DetectedBrowser[] = [];
  for (const candidate of candidates) {
    if (await canExecute(candidate.executablePath)) detected.push(candidate);
  }
  return detected;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export function isolatedProfilePath(
  dataDirectory: string,
  userId: string,
  browser: SupportedBrowserKind,
): string {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(userId)) {
    throw new Error("BROWSER_PROFILE_ID_INVALID");
  }
  const root = resolve(dataDirectory, "browser-profiles");
  const target = resolve(root, userId, browser);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("BROWSER_PROFILE_PATH_REJECTED");
  }
  return target;
}

export async function ensureIsolatedProfile(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

export function assertAllowedNavigation(
  targetUrl: string,
  allowedDestinationUrl: string,
  options: { allowLoopbackHttp?: boolean } = {},
): void {
  const target = new URL(targetUrl);
  const allowed = new URL(allowedDestinationUrl);
  const loopbackDryRun =
    options.allowLoopbackHttp === true &&
    target.protocol === "http:" &&
    allowed.protocol === "http:" &&
    target.hostname === "127.0.0.1" &&
    allowed.hostname === "127.0.0.1";
  if (
    (target.protocol !== "https:" && !loopbackDryRun) ||
    allowed.username ||
    allowed.password ||
    target.username ||
    target.password ||
    target.origin !== allowed.origin ||
    !pathWithin(target.pathname, allowed.pathname)
  ) {
    throw new Error("DOMAIN_NOT_ALLOWED");
  }
}

export function validateBrowserAction(
  action: BrowserAction,
  options: { allowedDestinationUrl: string; approvedBody: string },
): BrowserAction {
  if (action.type === "navigate") {
    assertAllowedNavigation(action.url, options.allowedDestinationUrl);
  }
  if (action.type === "type" && action.text !== options.approvedBody) {
    throw new Error("APPROVAL_CONTENT_MISMATCH");
  }
  return action;
}

export function directVerificationState(input: {
  currentUrl: string;
  destinationUrl: string;
  renderedBody: string;
  approvedBody: string;
}): "live" | "pending" | "blocked" {
  try {
    assertAllowedNavigation(input.currentUrl, input.destinationUrl);
  } catch {
    return "blocked";
  }
  if (new URL(input.currentUrl).href === new URL(input.destinationUrl).href) {
    return "pending";
  }
  return input.renderedBody.includes(input.approvedBody) ? "live" : "pending";
}

function pathWithin(target: string, allowed: string): boolean {
  const base = allowed.endsWith("/") ? allowed : `${allowed}/`;
  return target === allowed || target.startsWith(base);
}

export async function executeApprovedLocalDryRun(options: {
  executablePath: string;
  profilePath: string;
  destinationUrl: string;
  approvedBody: string;
  submitSelector: string;
  bodySelector: string;
}): Promise<{ state: "live" | "pending" | "blocked"; directUrl: string | null }> {
  await ensureIsolatedProfile(options.profilePath);
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(options.profilePath, {
      executablePath: options.executablePath,
      headless: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.destinationUrl, { waitUntil: "domcontentloaded" });
    assertAllowedNavigation(page.url(), options.destinationUrl, {
      allowLoopbackHttp: true,
    });
    const textarea = page.locator(options.bodySelector);
    await textarea.fill(options.approvedBody);
    if ((await textarea.inputValue()) !== options.approvedBody) {
      throw new Error("APPROVAL_CONTENT_MISMATCH");
    }
    await page.locator(options.submitSelector).click();
    await page.waitForLoadState("domcontentloaded");
    const renderedBody = (await page.locator("body").innerText()).slice(0, 20_000);
    let state: "live" | "pending" | "blocked" = "blocked";
    try {
      assertAllowedNavigation(page.url(), options.destinationUrl, {
        allowLoopbackHttp: true,
      });
      state =
        page.url() !== options.destinationUrl &&
        renderedBody.includes(options.approvedBody)
          ? "live"
          : "pending";
    } catch {
      state = "blocked";
    }
    return { state, directUrl: state === "live" ? page.url() : null };
  } catch {
    return { state: "blocked", directUrl: null };
  } finally {
    await context?.close();
  }
}
