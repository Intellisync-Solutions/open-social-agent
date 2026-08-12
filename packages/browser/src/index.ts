import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { BrowserActionSchema } from "@open-social-agent/contracts";
import type { z } from "zod";
import { chromium, type BrowserContext } from "playwright-core";
import type { Page } from "playwright-core";

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

export type ComputerExecutionPolicy = {
  allowedDestinationUrl: string;
  approvedBody: string;
  viewport: { width: number; height: number };
  allowLoopbackHttp?: boolean;
};

export type ApprovedComputerEnvironment = {
  execute(actions: BrowserAction[]): Promise<void>;
  screenshot(): Promise<{ imageDataUrl: string; currentUrl: string }>;
};

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
  options: ComputerExecutionPolicy,
): BrowserAction {
  if (action.type === "navigate") {
    assertAllowedNavigation(action.url, options.allowedDestinationUrl);
  }
  if (action.type === "type" && action.text !== options.approvedBody) {
    throw new Error("APPROVAL_CONTENT_MISMATCH");
  }
  for (const point of actionCoordinates(action)) {
    if (
      point.x >= options.viewport.width ||
      point.y >= options.viewport.height
    ) {
      throw new Error("COMPUTER_COORDINATE_OUT_OF_BOUNDS");
    }
  }
  if (
    "keys" in action &&
    action.type !== "keypress" &&
    action.keys &&
    action.keys.length > 0
  ) {
    throw new Error("COMPUTER_MODIFIERS_UNSUPPORTED");
  }
  return action;
}

export async function executeComputerActions(
  page: Page,
  actions: BrowserAction[],
  policy: ComputerExecutionPolicy,
): Promise<void> {
  if (actions.length < 1 || actions.length > 25) {
    throw new Error("COMPUTER_ACTION_BATCH_INVALID");
  }
  for (const unvalidated of actions) {
    const action = validateBrowserAction(unvalidated, policy);
    switch (action.type) {
      case "navigate":
        await page.goto(action.url, { waitUntil: "domcontentloaded" });
        assertAllowedNavigation(page.url(), policy.allowedDestinationUrl, {
          allowLoopbackHttp: policy.allowLoopbackHttp,
        });
        break;
      case "click":
        await page.mouse.click(action.x, action.y, {
          button: normalizeMouseButton(action.button),
        });
        break;
      case "double_click":
        await page.mouse.dblclick(action.x, action.y);
        break;
      case "drag": {
        const [start, ...rest] = action.path;
        if (!start) throw new Error("COMPUTER_DRAG_INVALID");
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (const point of rest) await page.mouse.move(point.x, point.y);
        await page.mouse.up();
        break;
      }
      case "keypress":
        for (const key of action.keys) {
          await page.keyboard.press(normalizeKey(key));
        }
        break;
      case "move":
        await page.mouse.move(action.x, action.y);
        break;
      case "screenshot":
        break;
      case "scroll":
        await page.mouse.move(action.x, action.y);
        await page.mouse.wheel(action.scroll_x, action.scroll_y);
        break;
      case "type":
        await page.keyboard.type(action.text);
        break;
      case "wait":
        await page.waitForTimeout(2_000);
        break;
    }
    assertAllowedNavigation(page.url(), policy.allowedDestinationUrl, {
      allowLoopbackHttp: policy.allowLoopbackHttp,
    });
  }
}

export async function withApprovedComputerEnvironment<T>(
  options: {
    executablePath: string;
    profilePath: string;
    destinationUrl: string;
    approvedBody: string;
    headless?: boolean;
    allowLoopbackHttp?: boolean;
    viewport?: { width: number; height: number };
  },
  task: (environment: ApprovedComputerEnvironment) => Promise<T>,
): Promise<T> {
  await ensureIsolatedProfile(options.profilePath);
  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const context = await chromium.launchPersistentContext(options.profilePath, {
    executablePath: options.executablePath,
    headless: options.headless ?? false,
    viewport,
    env: {},
    args: ["--disable-extensions", "--disable-file-system"],
  });
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.isNavigationRequest() &&
        request.frame().parentFrame() === null
      ) {
        try {
          assertAllowedNavigation(request.url(), options.destinationUrl, {
            allowLoopbackHttp: options.allowLoopbackHttp,
          });
        } catch {
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.destinationUrl, { waitUntil: "domcontentloaded" });
    assertAllowedNavigation(page.url(), options.destinationUrl, {
      allowLoopbackHttp: options.allowLoopbackHttp,
    });
    const policy: ComputerExecutionPolicy = {
      allowedDestinationUrl: options.destinationUrl,
      approvedBody: options.approvedBody,
      viewport,
      allowLoopbackHttp: options.allowLoopbackHttp,
    };
    return await task({
      execute: async (actions) => executeComputerActions(page, actions, policy),
      screenshot: async () => {
        assertAllowedNavigation(page.url(), options.destinationUrl, {
          allowLoopbackHttp: options.allowLoopbackHttp,
        });
        const bytes = await page.screenshot({ type: "png" });
        return {
          imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
          currentUrl: page.url(),
        };
      },
    });
  } finally {
    await context.close();
  }
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

function actionCoordinates(action: BrowserAction): Array<{ x: number; y: number }> {
  switch (action.type) {
    case "click":
    case "double_click":
    case "move":
    case "scroll":
      return [{ x: action.x, y: action.y }];
    case "drag":
      return action.path;
    default:
      return [];
  }
}

function normalizeMouseButton(
  button: "left" | "right" | "wheel" | "back" | "forward",
): "left" | "right" | "middle" {
  if (button === "wheel") return "middle";
  if (button === "left" || button === "right") return button;
  throw new Error("COMPUTER_MOUSE_BUTTON_UNSUPPORTED");
}

function normalizeKey(key: string): string {
  const keyMap: Record<string, string> = {
    ENTER: "Enter",
    RETURN: "Enter",
    ESC: "Escape",
    ESCAPE: "Escape",
    TAB: "Tab",
    SPACE: "Space",
    BACKSPACE: "Backspace",
    DELETE: "Delete",
    DEL: "Delete",
    HOME: "Home",
    END: "End",
    PAGEUP: "PageUp",
    PAGEDOWN: "PageDown",
    UP: "ArrowUp",
    ARROWUP: "ArrowUp",
    DOWN: "ArrowDown",
    ARROWDOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    ARROWLEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    ARROWRIGHT: "ArrowRight",
    CTRL: "Control",
    CONTROL: "Control",
    SHIFT: "Shift",
    OPTION: "Alt",
    ALT: "Alt",
    META: "Meta",
    CMD: "Meta",
    COMMAND: "Meta",
  };
  return keyMap[key.toUpperCase()] ?? key;
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
      env: {},
      args: ["--disable-extensions", "--disable-file-system"],
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
