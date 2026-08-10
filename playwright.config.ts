import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @open-social-agent/web dev --port 3100",
    env: {
      NEXT_PUBLIC_CONVEX_URL: "invalid-for-fail-closed-test",
    },
    reuseExistingServer: false,
    timeout: 60_000,
    url: "http://localhost:3100",
  },
});
