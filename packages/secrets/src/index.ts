import { Entry } from "@napi-rs/keyring";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export interface SecretStore {
  delete(secretRef: string): Promise<void>;
  get(secretRef: string): Promise<string | null>;
  set(secretRef: string, value: string): Promise<void>;
}

export class KeyringSecretStore implements SecretStore {
  constructor(private readonly service = "com.intellisync.open-social-agent") {}

  async set(secretRef: string, value: string): Promise<void> {
    new Entry(this.service, secretRef).setPassword(value);
  }

  async get(secretRef: string): Promise<string | null> {
    try {
      return new Entry(this.service, secretRef).getPassword();
    } catch (error) {
      if (isMissingSecret(error)) return null;
      throw error;
    }
  }

  async delete(secretRef: string): Promise<void> {
    try {
      new Entry(this.service, secretRef).deletePassword();
    } catch (error) {
      if (!isMissingSecret(error)) throw error;
    }
  }
}

const encryptedEntry = z.object({
  iv: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  tag: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const encryptedFile = z.object({
  version: z.literal(1),
  entries: z.record(z.string().min(1).max(160), encryptedEntry),
});
type EncryptedFile = z.infer<typeof encryptedFile>;

export class EncryptedFileSecretStore implements SecretStore {
  private readonly key: Buffer;

  constructor(
    private readonly filePath: string,
    encodedKey: string,
  ) {
    this.key = decodeEncryptionKey(encodedKey);
  }

  async set(secretRef: string, value: string): Promise<void> {
    validateSecretRef(secretRef);
    const file = await this.read();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(secretRef, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    file.entries[secretRef] = {
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
    await this.write(file);
  }

  async get(secretRef: string): Promise<string | null> {
    validateSecretRef(secretRef);
    const entry = (await this.read()).entries[secretRef];
    if (!entry) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(entry.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(secretRef, "utf8"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  async delete(secretRef: string): Promise<void> {
    validateSecretRef(secretRef);
    const file = await this.read();
    if (!(secretRef in file.entries)) return;
    delete file.entries[secretRef];
    await this.write(file);
  }

  private async read(): Promise<EncryptedFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      if (Buffer.byteLength(raw) > 256_000)
        throw new Error("SECRET_STORE_TOO_LARGE");
      return encryptedFile.parse(JSON.parse(raw));
    } catch (error) {
      if (isFileMissing(error)) return { version: 1, entries: {} };
      throw error;
    }
  }

  private async write(file: EncryptedFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(file), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await chmod(temporary, 0o600);
    await rename(temporary, this.filePath);
    await chmod(this.filePath, 0o600);
  }
}

export function createSecretStore(options: {
  fallbackFilePath: string;
  fallbackEncryptionKey?: string;
  forceEncryptedFile?: boolean;
}): SecretStore {
  if (options.forceEncryptedFile) {
    if (!options.fallbackEncryptionKey)
      throw new Error("LOCAL_SECRET_ENCRYPTION_KEY_REQUIRED");
    return new EncryptedFileSecretStore(
      options.fallbackFilePath,
      options.fallbackEncryptionKey,
    );
  }
  return new KeyringSecretStore();
}

export function decodeEncryptionKey(value: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("LOCAL_SECRET_ENCRYPTION_KEY_INVALID");
  return key;
}

function validateSecretRef(value: string) {
  if (!/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(value))
    throw new Error("SECRET_REF_INVALID");
}

function isFileMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isMissingSecret(error: unknown): boolean {
  return (
    error instanceof Error && /not found|no entry|missing/i.test(error.message)
  );
}
