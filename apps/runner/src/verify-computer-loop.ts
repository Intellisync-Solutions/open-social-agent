import { createServer } from "node:http";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { withApprovedComputerEnvironment } from "@open-social-agent/browser";
import { runOpenAIComputerLoop } from "@open-social-agent/providers";

if (process.env.RUN_COMPUTER_LOOP_DRY_RUN !== "1") {
  throw new Error(
    "Computer loop dry run is disabled. Set RUN_COMPUTER_LOOP_DRY_RUN=1.",
  );
}
const executablePath = process.env.OSA_TEST_BROWSER_EXECUTABLE;
if (!executablePath) throw new Error("OSA_TEST_BROWSER_EXECUTABLE is required.");

const approvedBody = "Controlled local computer-loop approval proof.";
const fixture = await readFile(
  resolve(process.cwd(), "../../tests/browser/fixtures/controlled-social.html"),
  "utf8",
);
const server = createServer((request, response) => {
  if (
    request.url === "/feed/acme" ||
    request.url?.startsWith("/feed/acme/post/")
  ) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixture);
    return;
  }
  response.writeHead(404).end();
});
await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("DRY_RUN_SERVER_FAILED");
}
const destinationUrl = `http://127.0.0.1:${address.port}/feed/acme`;
const profilePath = await mkdtemp(join(tmpdir(), "osa-computer-loop-"));
let providerCalls = 0;
const create = async () => {
  providerCalls += 1;
  if (providerCalls === 1) {
    return {
      id: "resp_controlled_1",
      model: "gpt-5.6",
      status: "completed",
      output: [
        {
          type: "computer_call",
          call_id: "call_controlled_1",
          status: "completed",
          actions: [{ type: "screenshot" }],
          pending_safety_checks: [],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
  }
  if (providerCalls === 2) {
    return {
      id: "resp_controlled_2",
      model: "gpt-5.6",
      status: "completed",
      output: [
        {
          type: "computer_call",
          call_id: "call_controlled_2",
          status: "completed",
          actions: [
            { type: "keypress", keys: ["TAB"] },
            { type: "type", text: approvedBody },
            { type: "keypress", keys: ["TAB"] },
            { type: "keypress", keys: ["ENTER"] },
          ],
          pending_safety_checks: [],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
  }
  return {
    id: "resp_controlled_3",
    model: "gpt-5.6",
    status: "completed",
    output: [],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
};

try {
  const result = await withApprovedComputerEnvironment(
    {
      executablePath,
      profilePath,
      destinationUrl,
      approvedBody,
      headless: true,
      allowLoopbackHttp: true,
    },
    async (environment) =>
      await runOpenAIComputerLoop({
        apiKey: "synthetic-local-only",
        model: "gpt-5.6",
        destinationUrl,
        approvedBody,
        environment,
        clientFactory: () => ({ responses: { create } }) as never,
      }),
  );
  const directDetail = result.finalUrl.startsWith(`${destinationUrl}/post/`);
  console.log(
    JSON.stringify({
      state: result.state,
      turns: result.turns,
      actionsExecuted: result.actionsExecuted,
      directDetail,
      isolatedProfile: true,
      providerNetworkCall: false,
      externalWrite: false,
    }),
  );
  if (result.state !== "completed" || !directDetail) process.exitCode = 1;
} finally {
  await new Promise<void>((closed) => server.close(() => closed()));
}
