import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { executeApprovedLocalDryRun } from "./index";

if (process.env.RUN_BROWSER_DRY_RUN !== "1") {
  throw new Error("Browser dry run is disabled. Set RUN_BROWSER_DRY_RUN=1.");
}
const executablePath = process.env.OSA_TEST_BROWSER_EXECUTABLE;
if (!executablePath) throw new Error("OSA_TEST_BROWSER_EXECUTABLE is required.");

const fixture = await readFile(
  resolve(process.cwd(), "../../tests/browser/fixtures/controlled-social.html"),
  "utf8",
);
const server = createServer((request, response) => {
  if (request.url === "/feed/acme" || request.url?.startsWith("/feed/acme/post/")) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixture);
    return;
  }
  response.writeHead(404).end();
});
await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
if (!address || typeof address === "string") throw new Error("DRY_RUN_SERVER_FAILED");
const profilePath = await mkdtemp(join(tmpdir(), "osa-browser-dry-run-"));
try {
  const result = await executeApprovedLocalDryRun({
    executablePath,
    profilePath,
    destinationUrl: `http://127.0.0.1:${address.port}/feed/acme`,
    approvedBody: "Controlled local approval proof.",
    submitSelector: "#submit",
    bodySelector: "#composer",
  });
  console.log(JSON.stringify({ ...result, isolatedProfile: true, externalWrite: false }));
  if (result.state !== "live") process.exitCode = 1;
} finally {
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
}
