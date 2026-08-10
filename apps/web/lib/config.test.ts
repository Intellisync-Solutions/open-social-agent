import { describe, expect, it } from "vitest";
import { parseConvexDeploymentUrl } from "./config";

describe("Convex deployment configuration", () => {
  it("accepts an HTTPS deployment", () => {
    expect(parseConvexDeploymentUrl("https://example.convex.cloud")).toBe(
      "https://example.convex.cloud",
    );
  });

  it("allows HTTP only for local development", () => {
    expect(parseConvexDeploymentUrl("http://127.0.0.1:3210")).toBe(
      "http://127.0.0.1:3210",
    );
    expect(parseConvexDeploymentUrl("http://example.com")).toBeNull();
  });

  it("rejects credentials and malformed URLs", () => {
    expect(
      parseConvexDeploymentUrl("https://user:secret@example.com"),
    ).toBeNull();
    expect(parseConvexDeploymentUrl("not-a-url")).toBeNull();
  });
});
