import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { claim, claimHarness, receipt, receiptHarness } from "./runnerHttp";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/runner/claim", method: "POST", handler: claim });
http.route({ path: "/runner/receipts", method: "POST", handler: receipt });
http.route({ path: "/runner/harness/claim", method: "POST", handler: claimHarness });
http.route({ path: "/runner/harness/receipts", method: "POST", handler: receiptHarness });

export default http;
