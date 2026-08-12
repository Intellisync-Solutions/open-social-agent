import { constants } from "node:fs";
import { access } from "node:fs/promises";

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
