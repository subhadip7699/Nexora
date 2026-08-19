import { existsSync } from "node:fs";
import { resolve } from "node:path";

const contractsRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(contractsRoot, "..");
const browserArtifactsDir = resolve(repoRoot, "app", "public", "contract", "Midnight");

const REQUIRED_BROWSER_ARTIFACTS = [
  "contract/index.js",
  "compiler/contract-info.json",
  "keys/add_valid_credential.prover",
  "keys/add_valid_credential.verifier",
  "keys/verify_access.prover",
  "keys/verify_access.verifier",
  "zkir/add_valid_credential.bzkir",
  "zkir/verify_access.bzkir",
];

function requireCompiledBrowserArtifacts() {
  const missing = REQUIRED_BROWSER_ARTIFACTS.filter((relativePath) => {
    return !existsSync(resolve(browserArtifactsDir, relativePath));
  });

  if (missing.length > 0) {
    throw new Error(
      [
        "Compiled contract artifacts are missing from the browser-served deployment path.",
        ...missing.map((path) => `- app/public/contract/Midnight/${path}`),
        "",
        "Run only if artifacts need to be refreshed:",
        "npm run compile --workspace=contracts",
      ].join("\n"),
    );
  }
}

function main() {
  requireCompiledBrowserArtifacts();

  console.log("");
  console.log("1AM WALLET DEPLOYMENT REQUIRES BROWSER APPROVAL");
  console.log("");
  console.log("The official 1AM API is an injected browser provider at window.midnight['1am'].");
  console.log("This CLI command no longer uses the old generated wallet, syncs wallet state, reads a seed, or generates a new seed.");
  console.log("");
  console.log("Use the existing Preprod 1AM deployment flow:");
  console.log("");
  console.log("npm run dev --workspace=app");
  console.log("");
  console.log("Then open:");
  console.log("");
  console.log("http://localhost:3000/admin");
  console.log("");
  console.log("In the browser: connect 1AM on preprod, approve the wallet request, then click Deploy contract.");
  console.log("1AM handles proof generation and DUST sponsorship through its injected provider / ProofStation flow.");
  console.log("");
  console.log("No deployment transaction was submitted by this CLI process.");
  process.exitCode = 2;
}

main();
