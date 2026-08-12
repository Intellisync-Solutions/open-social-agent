import { describe, expect, it } from "vitest";
import { parseLoopbackRunnerUrl } from "./runner-url";

describe("local runner URL boundary", () => {
  it("defaults to the fixed loopback runner", () => {
    expect(parseLoopbackRunnerUrl(undefined)).toBe("http://localhost:43117");
  });

  it("accepts only loopback HTTP origins", () => {
    expect(parseLoopbackRunnerUrl("http://127.0.0.1:43117")).toBe(
      "http://127.0.0.1:43117",
    );
    expect(parseLoopbackRunnerUrl("https://runner.example.com")).toBeNull();
    expect(parseLoopbackRunnerUrl("http://192.168.1.4:43117")).toBeNull();
    expect(parseLoopbackRunnerUrl("http://localhost:43117/path")).toBeNull();
  });
});
