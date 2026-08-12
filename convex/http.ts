import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { claim, receipt } from "./runnerHttp";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/runner/claim", method: "POST", handler: claim });
http.route({ path: "/runner/receipts", method: "POST", handler: receipt });

export default http;
