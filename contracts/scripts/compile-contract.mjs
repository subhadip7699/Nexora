import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

const contractsRoot = resolve(import.meta.dirname, "..");
const sourceFile = "src/midnight.compact";
const outputDir = "src/managed";

function toWslPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function bashQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

if (platform() === "win32") {
  const wslContractsRoot = toWslPath(contractsRoot);
  execFileSync(
    "wsl",
    ["bash", "-lc", `cd ${bashQuote(wslContractsRoot)} && compact compile ${sourceFile} ${outputDir}`],
    { stdio: "inherit" },
  );
} else {
  execFileSync("compact", ["compile", sourceFile, outputDir], {
    cwd: contractsRoot,
    stdio: "inherit",
  });
}

await import("./sync-artifacts.mjs");
