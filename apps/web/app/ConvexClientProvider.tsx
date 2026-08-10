"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { parseConvexDeploymentUrl } from "@/lib/config";

const convexUrl = parseConvexDeploymentUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (convex === null) {
    return (
      <main className="config-error">
        <p className="eyebrow">Configuration required</p>
        <h1>Connect a Convex development deployment.</h1>
        <p>
          Set <code>NEXT_PUBLIC_CONVEX_URL</code> in{" "}
          <code>apps/web/.env.local</code>. The app intentionally fails closed
          instead of connecting to a placeholder.
        </p>
      </main>
    );
  }
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
