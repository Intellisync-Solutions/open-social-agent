import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "AGENTS.md",
  "BUILD_INIT.md",
  "SECURITY.md",
  "README.md",
  "docs/architecture/README.md",
  "docs/product/v1-scope.md",
];

const failures = [];

for (const path of required) {
  try {
    await access(join(root, path));
  } catch {
    failures.push(`missing required authority: ${path}`);
  }
}

const architecture = await readFile(join(root, "BUILD_INIT.md"), "utf8");
if (!/^architecture_status: (draft|approved|superseded)$/m.test(architecture)) {
  failures.push("BUILD_INIT.md has an invalid architecture_status");
}
if (!/^implementation_status: (not_started|partial|current|legacy)$/m.test(architecture)) {
  failures.push("BUILD_INIT.md has an invalid implementation_status");
}

const rootEntries = await readdir(root);
if (rootEntries.includes("AGENTS.override.md")) {
  failures.push("permanent AGENTS.override.md is prohibited");
}

const trackedText = await Promise.all(
  required.map(async (path) => [path, await readFile(join(root, path), "utf8")]),
);
for (const [path, text] of trackedText) {
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) {
    failures.push(`possible OpenAI secret in ${path}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Governance verified: ${required.length} authorities, valid status metadata, no override.`);
