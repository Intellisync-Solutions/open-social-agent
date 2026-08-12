import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeEncryptionKey, EncryptedFileSecretStore } from "./index";

describe("encrypted fallback secret store", () => {
  it("encrypts values at rest and applies owner-only permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "osa-secret-test-"));
    const filePath = join(directory, "secrets.json");
    const store = new EncryptedFileSecretStore(
      filePath,
      randomBytes(32).toString("base64"),
    );
    await store.set("provider:openai:default", "synthetic-test-secret");

    expect(await store.get("provider:openai:default")).toBe(
      "synthetic-test-secret",
    );
    expect(await readFile(filePath, "utf8")).not.toContain(
      "synthetic-test-secret",
    );
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);

    await store.delete("provider:openai:default");
    expect(await store.get("provider:openai:default")).toBeNull();
  });

  it("fails closed on an invalid encryption key", () => {
    expect(() => decodeEncryptionKey("too-short")).toThrow(
      "LOCAL_SECRET_ENCRYPTION_KEY_INVALID",
    );
  });
});
