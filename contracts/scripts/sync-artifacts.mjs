import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const contractsRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(contractsRoot, "..");
const source = resolve(contractsRoot, "src", "managed");
const target = resolve(repoRoot, "app", "public", "contract", "Midnight");

const required = [
  "contract/index.js",
  "contract/index.d.ts",
  "compiler/contract-info.json",
  "zkir/add_valid_credential.bzkir",
  "zkir/verify_access.bzkir",
  "keys/add_valid_credential.prover",
  "keys/verify_access.prover",
];

async function copyDirectoryContents(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = resolve(sourceDir, entry.name);
    const targetPath = resolve(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await mkdir(resolve(targetPath, ".."), { recursive: true });
      await writeFile(targetPath, await readFile(sourcePath));
    }
  }
}

for (const relativePath of required) {
  const artifactPath = resolve(source, relativePath);
  if (!existsSync(artifactPath) || !(await stat(artifactPath)).isFile()) {
    throw new Error(`Missing generated Compact artifact: ${relativePath}`);
  }
}

await mkdir(resolve(target, ".."), { recursive: true });
await mkdir(target, { recursive: true });
for (const directory of ["contract", "compiler", "keys", "zkir"]) {
  await copyDirectoryContents(resolve(source, directory), resolve(target, directory));
}

console.log(`Synced Compact artifacts from ${source} to ${target}`);
