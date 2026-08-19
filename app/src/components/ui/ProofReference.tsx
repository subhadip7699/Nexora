"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { shorten } from "@/lib/gate-store";
import {
  explorerContractUrl,
  explorerTransactionUrl,
  type ExplorerNetwork,
} from "@/lib/explorer";

type ProofReferenceProps = {
  value: string;
  label?: string;
  className?: string;
  /** Defaults to transaction explorer link */
  kind?: "transaction" | "contract";
  network?: ExplorerNetwork;
};

export function ProofReference({
  value,
  label,
  className = "",
  kind = "transaction",
  network = "preprod",
}: ProofReferenceProps) {
  const [copied, setCopied] = useState(false);
  const displayLabel = label ?? (kind === "contract" ? "Contract" : "Transaction");
  const explorerUrl =
    kind === "contract" ? explorerContractUrl(value, network) : explorerTransactionUrl(value, network);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard may be denied
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <span className="text-xs text-faint">{displayLabel}</span>
      <code className="min-w-0 break-all font-mono text-xs text-muted">{shorten(value, 8)}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {copied ? "Copied" : kind === "contract" ? "Copy contract ID" : "Copy transaction ID"}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          View on explorer <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
