import type { TransactionProgressStage } from "@/lib/midnight-client";

export type ProgressStage = TransactionProgressStage | "idle" | "confirming" | "confirmed" | "error";

export function isActiveProgress(stage: ProgressStage): boolean {
  return ["preparing", "proving", "balancing", "awaiting_wallet", "submitted", "confirming"].includes(stage);
}

export function progressLabel(stage: ProgressStage, context: "enroll" | "prove" | "deploy" = "prove"): string {
  const map: Record<ProgressStage, string> = {
    idle: context === "enroll" ? "Ready to issue" : context === "deploy" ? "Ready to publish" : "Ready",
    preparing: context === "deploy" ? "Preparing gate" : context === "enroll" ? "Preparing credential" : "Preparing credential",
    proving: context === "deploy" ? "Preparing privacy contract" : "Generating private proof",
    balancing: "Preparing wallet approval",
    awaiting_wallet: "Approve in your wallet",
    submitted: "Confirming on Midnight",
    confirming: "Finalizing",
    confirmed: context === "enroll" ? "Credential enrolled" : context === "deploy" ? "Gate published" : "Access confirmed",
    error: "Needs attention",
  };
  return map[stage];
}

export function progressDetail(stage: ProgressStage): string {
  switch (stage) {
    case "preparing":
      return "Preparing the request from the current gate state.";
    case "proving":
      return "Generating the private proof. This can take several seconds.";
    case "balancing":
      return "Your wallet is preparing the final request.";
    case "awaiting_wallet":
      return "Confirm the request in your wallet extension when prompted.";
    case "submitted":
      return "The request was sent to Midnight Preprod.";
    case "confirming":
      return "Waiting until Midnight confirms the gate state.";
    case "confirmed":
      return "The network has confirmed this action.";
    case "error":
      return "Review the message below, then retry when ready.";
    default:
      return "Waiting for the next action.";
  }
}
