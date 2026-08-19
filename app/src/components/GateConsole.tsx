"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Rocket,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useGate } from "@/hooks/useGate";
import {
  APP_NETWORK_LABEL,
  MidnightClient,
  verifyContractIndexed,
  type AccessVerificationResult,
  type SessionInfo,
  type TransactionProgressStage,
  type WalletActionResult,
  type WalletOption,
} from "@/lib/midnight-client";
import {
  DEFAULT_GATE,
  formatContractId,
  gateUrl,
  isValidContractId,
  normalizeContractId,
  resetGateToDraft,
  restorePublishedGate,
  saveGate,
  shorten,
  vaultUrl,
  type GateRecord,
} from "@/lib/gate-store";
import { explorerContractUrl, explorerTransactionUrl } from "@/lib/explorer";
import { getGateAccess, markGateUnlocked } from "@/lib/access-session";
import { ProgressPanel } from "@/components/ui/ProgressPanel";
import { ProofReference } from "@/components/ui/ProofReference";
import { StatusBanner, StageBadge, type StatusTone } from "@/components/ui/StatusBanner";
import { PageShell } from "@/components/ui/PageShell";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { WalletSessionBar } from "@/components/WalletSessionBar";
import type { ProgressStage } from "@/lib/transaction-stages";

type GateConsoleProps = {
  mode: "admin" | "gate" | "vault";
};

type UiStatus = {
  tone: StatusTone;
  title: string;
  message: string;
};

type ContractStatus = "idle" | "checking" | "published" | "unpublished" | "error";
type ActionContext = "deploy" | "enroll" | "prove";

const titles = {
  admin: {
    eyebrow: "Admin console",
    title: "Publish a private gate.",
    description: "Configure the member experience, publish the gate, then issue private member credentials from the administrator wallet.",
  },
  gate: {
    eyebrow: "Private access gate",
    title: "Verify without revealing.",
    description: "Open a published gate, connect a Preprod wallet, and prove access with the private credential you received.",
  },
  vault: {
    eyebrow: "Member vault",
    title: "Generate a private access proof.",
    description: "Paste your private credential and let Nexora verify membership without revealing it.",
  },
} as const;

const ADMIN_STEPS = ["Configure", "Connect", "Publish", "Issue Access"] as const;

function firstParam(value: string | string[] | null): string | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseCredential(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("CREDENTIAL_REQUIRED");
  const hex = trimmed.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  }
  const encoded = new TextEncoder().encode(trimmed);
  if (encoded.length > 32) throw new Error("CREDENTIAL_FORMAT");
  const bytes = new Uint8Array(32);
  bytes.set(encoded);
  return bytes;
}

function statusFromError(error: unknown): UiStatus {
  return {
    tone: "error",
    title: "Action failed",
    message: MidnightClient.messageFor(error),
  };
}

function logWalletActionUi(
  action: "credential_enrollment" | "access_verification",
  result: WalletActionResult,
  finalState: string,
): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.info("[Nexora:wallet-action-ui]", {
      action,
      wallet: result.wallet,
      success: result.success,
      confirmed: result.confirmed,
      txHashPresent: Boolean(result.txHash),
      status: result.status,
      finalState,
    });
  } catch {
    // diagnostics only
  }
}

function randomCredential(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function absolutePath(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function fullGateUrl(gate: GateRecord): string {
  return absolutePath(gateUrl(gate));
}

async function copyText(value: string): Promise<void> {
  if (!value) throw new Error("Nothing to copy.");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed.");
}

function ButtonCopy({
  value,
  copyKey,
  copiedKey,
  disabled = false,
  onCopied,
  onCopyFailed,
  children,
}: {
  value: string;
  copyKey: string;
  copiedKey: string | null;
  disabled?: boolean;
  onCopied: (copyKey: string) => void;
  onCopyFailed: () => void;
  children: React.ReactNode;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await copyText(value);
          onCopied(copyKey);
        } catch {
          onCopyFailed();
        }
      }}
      disabled={disabled || !value}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle px-4 text-xs font-semibold text-muted transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Copy size={14} aria-hidden="true" />
      {copied ? "Copied ✓" : children}
    </button>
  );
}

function StepProgress({
  gateName,
  configured,
  connected,
  published,
  issued,
}: {
  gateName: string;
  configured: boolean;
  connected: boolean;
  published: boolean;
  issued: boolean;
}) {
  const state = [configured, connected, published, issued];
  const completed = state.filter(Boolean).length;
  const percent = Math.round((completed / ADMIN_STEPS.length) * 100);
  const activeIndex = state.findIndex((done) => !done);
  const currentIndex = activeIndex === -1 ? ADMIN_STEPS.length - 1 : activeIndex;

  return (
    <section className="paper-card p-5" aria-label="Gate setup progress">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow break-words">Gate setup - {gateName}</p>
        <p className="font-mono text-xs font-semibold text-muted">{percent}%</p>
      </div>
      <div className="mt-4 h-1 rounded-full bg-secondary" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-4">
        {ADMIN_STEPS.map((label, index) => {
          const done = state[index];
          const current = index === currentIndex && !done;
          const Icon = done ? CheckCircle2 : current ? CircleDot : Circle;
          return (
            <div key={label} className={`flex items-center gap-2 ${done || current ? "text-accent" : "text-faint"}`}>
              <Icon size={16} aria-hidden="true" />
              <span className="font-medium">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-card text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      </div>
    </div>
  );
}

export function GateConsole({ mode }: GateConsoleProps) {
  const searchParams = useSearchParams();
  const [client] = useState(() => new MidnightClient());

  const { gate: resolvedGate } = useGate({
    gate: firstParam(searchParams.get("gate")),
    contract: firstParam(searchParams.get("contract")),
    name: firstParam(searchParams.get("name")),
    description: firstParam(searchParams.get("description")),
    network: firstParam(searchParams.get("network")),
  });

  const [localGate, setLocalGate] = useState<GateRecord | null>(null);
  const [gateName, setGateName] = useState(resolvedGate.name);
  const [gateDescription, setGateDescription] = useState(resolvedGate.description);
  const [privateContent, setPrivateContent] = useState(resolvedGate.privateContent);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletRdns, setWalletRdns] = useState<string | null>(null);
  const [walletInjectionKey, setWalletInjectionKey] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [credential, setCredential] = useState("");
  const [credentialIssued, setCredentialIssued] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [restoreAddress, setRestoreAddress] = useState("");
  const [stage, setStage] = useState<ProgressStage>("idle");
  const [actionContext, setActionContext] = useState<ActionContext>("prove");
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<ContractStatus>("idle");
  const [contractStatusDetail, setContractStatusDetail] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<UiStatus>({
    tone: "info",
    title: "Ready",
    message: "Start with the next highlighted step.",
  });

  const current = localGate ?? resolvedGate;
  const configured = gateName.trim().length > 0 && gateDescription.trim().length > 0;
  const hasContractAddress = Boolean(current.contractId && isValidContractId(current.contractId));
  const contractChecking = hasContractAddress && (contractStatus === "idle" || contractStatus === "checking");
  const published = hasContractAddress && contractStatus === "published";
  const title = titles[mode];
  const contractUrl = current.contractId ? explorerContractUrl(current.contractId, current.network) : null;
  const txUrl = lastTx ? explorerTransactionUrl(lastTx, current.network) : null;
  const controlsBusy = busy || walletConnecting || contractChecking;
  const memberLink = published ? fullGateUrl(current) : "";

  const markCopied = (key: string) => {
    setCopiedKey(key);
    setStatus({
      tone: "success",
      title: "Member gate link copied",
      message: key.includes("member-link") ? "The member-facing gate link was copied to your clipboard." : "Copied to your clipboard.",
    });
    window.setTimeout(() => {
      setCopiedKey((currentKey) => (currentKey === key ? null : currentKey));
    }, 1800);
  };

  const handleCopyFailed = () => {
    setStatus({
      tone: "error",
      title: "Could not copy the link",
      message: "Could not copy the link. Please try again.",
    });
  };

  useEffect(() => {
    setGateName(resolvedGate.name);
    setGateDescription(resolvedGate.description);
    setPrivateContent(resolvedGate.privateContent);
    setLocalGate(null);
    setCredentialIssued(false);
    setAccessGranted(Boolean(getGateAccess(resolvedGate.id)));
  }, [resolvedGate.id, resolvedGate.name, resolvedGate.description, resolvedGate.privateContent, resolvedGate.contractId]);

  useEffect(() => {
    setWallets(client.getInjectedWallets());
    return () => {
      client.dispose();
    };
  }, [client]);

  useEffect(() => {
    const contractId = current.contractId;
    if (!contractId) {
      setContractStatus("idle");
      setContractStatusDetail("");
      return;
    }
    if (!isValidContractId(contractId)) {
      setContractStatus("unpublished");
      setContractStatusDetail("The saved gate address is not a valid Preprod contract address.");
      return;
    }

    let active = true;
    setContractStatus("checking");
    setContractStatusDetail("Checking the saved gate on Midnight Preprod.");
    verifyContractIndexed(contractId)
      .then((lookup) => {
        if (!active) return;
        if (lookup.found && lookup.resolvedAddress) {
          const restored = restorePublishedGate({
            id: current.id,
            contractId: lookup.resolvedAddress,
            name: gateName,
            description: gateDescription,
            privateContent,
            deploymentTxId: current.deploymentTxId,
          });
          setLocalGate(restored);
          setContractStatus("published");
          setContractStatusDetail("The gate is live on Midnight Preprod.");
        } else {
          setContractStatus("unpublished");
          setContractStatusDetail("The saved address was not found on Midnight Preprod.");
        }
      })
      .catch((error) => {
        if (!active) return;
        setContractStatus("error");
        setContractStatusDetail(error instanceof Error ? error.message : "Could not verify the saved gate.");
      });

    return () => {
      active = false;
    };
  }, [current.contractId]);

  const saveConfiguration = () => {
    const next: GateRecord = {
      ...current,
      name: gateName.trim().slice(0, 80) || DEFAULT_GATE.name,
      description: gateDescription.trim().slice(0, 500) || DEFAULT_GATE.description,
      privateContent: privateContent.trim().slice(0, 2000) || DEFAULT_GATE.privateContent,
      network: "preprod",
    };
    saveGate(next);
    setLocalGate(next);
    setStatus({
      tone: "success",
      title: "Gate configuration saved",
      message: "Next, connect the wallet that will manage this gate.",
    });
  };

  const connectWallet = async (wallet?: WalletOption) => {
    if (walletConnecting) return;
    setWalletConnecting(true);
    setStage("idle");
    setWalletModalOpen(false);
    setStatus({
      tone: "info",
      title: "Wallet approval pending",
      message: `Approve the connection request in ${wallet?.name ?? "your Midnight wallet"}.`,
    });
    try {
      const connected = await client.connectWallet("preprod", wallet);
      setSession(connected);
      setWalletName(client.walletName);
      setWalletRdns(client.walletRdns);
      setWalletInjectionKey(client.walletInjectionKey);
      setStage("idle");
      setStatus({
        tone: "success",
        title: "Wallet connected",
        message: `${client.walletName ?? "Wallet"} is connected to ${APP_NETWORK_LABEL}.`,
      });
    } catch (error) {
      setStage("idle");
      setStatus(statusFromError(error));
    } finally {
      setWalletConnecting(false);
    }
  };

  const chooseWallet = async () => {
    if (walletConnecting) return;
    setWallets(client.getInjectedWallets());
    setWalletModalOpen(true);
  };

  const publishGate = async () => {
    setBusy(true);
    setActionContext("deploy");
    setStage("preparing");
    setLastTx(null);
    try {
      if (!configured) throw new Error("Save the gate configuration before publishing.");
      if (!client.isConnected) throw new Error("WALLET_NOT_CONNECTED");
      if (current.contractId && isValidContractId(current.contractId)) {
        const existing = await verifyContractIndexed(current.contractId);
        if (existing.found && existing.resolvedAddress) {
          const restored = restorePublishedGate({
            id: current.id,
            contractId: existing.resolvedAddress,
            name: gateName,
            description: gateDescription,
            privateContent,
            deploymentTxId: current.deploymentTxId,
          });
          setLocalGate(restored);
          setContractStatus("published");
          setStatus({
            tone: "success",
            title: `${restored.name} published`,
            message: "Existing Preprod deployment detected and reused.",
          });
          return;
        }
        throw new Error("Saved gate address was not found on Midnight Preprod. Restore the correct address before publishing again.");
      }

      if (!client.addresses) await client.loadWalletAddresses();
      const deployed = await client.deployContract();
      setStage("confirming");
      await client.waitForContractDeployment(deployed.contractId);
      const next = restorePublishedGate({
        id: current.id,
        contractId: formatContractId(deployed.contractId),
        deploymentTxId: deployed.txId,
        name: gateName,
        description: gateDescription,
        privateContent,
      });
      setLocalGate(next);
      setContractStatus("published");
      setLastTx(deployed.txId);
      setStage("confirmed");
      setStatus({
        tone: "success",
        title: `${next.name} published`,
        message: "The Midnight indexer confirmed the gate deployment.",
      });
    } catch (error) {
      setStage("error");
      setStatus(statusFromError(error));
    } finally {
      setBusy(false);
    }
  };

  const restoreGate = async () => {
    setBusy(true);
    setStage("idle");
    try {
      if (!isValidContractId(restoreAddress)) throw new Error("Invalid contract address.");
      const lookup = await verifyContractIndexed(restoreAddress);
      if (!lookup.found || !lookup.resolvedAddress) throw new Error(lookup.detail);
      const restored = restorePublishedGate({
        contractId: lookup.resolvedAddress,
        name: gateName,
        description: gateDescription,
        privateContent,
      });
      setLocalGate(restored);
      setGateName(restored.name);
      setGateDescription(restored.description);
      setPrivateContent(restored.privateContent);
      setContractStatus("published");
      setStage("idle");
      setStatus({
        tone: "success",
        title: "Gate restored",
        message: "The Preprod indexer confirmed this published gate.",
      });
    } catch (error) {
      setStage("idle");
      setStatus(statusFromError(error));
    } finally {
      setBusy(false);
    }
  };

  const enrollCredential = async () => {
    setBusy(true);
    setActionContext("enroll");
    setStage("preparing");
    setLastTx(null);
    try {
      if (!published || !current.contractId) throw new Error("GATE_NOT_CONFIGURED");
      if (!client.isConnected) throw new Error("WALLET_NOT_CONNECTED");
      if (!client.addresses) await client.loadWalletAddresses();
      const secret = parseCredential(credential);
      const result = await client.addCredential(secret, current.contractId, setStage as (stage: TransactionProgressStage) => void);
      if (!result.success) throw new Error("CREDENTIAL_SUBMIT:Wallet did not submit the credential enrollment.");
      if (!result.alreadyEnrolled) {
        setStage("confirming");
        setStatus({
          tone: "busy",
          title: "Confirming enrollment",
          message: "Waiting for the Preprod indexer to confirm the credential enrollment.",
        });
        await client.waitForCredentialEnrollment(current.contractId, result.credentialHash);
      }
      const confirmedResult = {
        ...result,
        confirmed: true,
        status: result.alreadyEnrolled ? result.status : "confirmed",
      };
      setCredentialIssued(true);
      if (confirmedResult.txHash) setLastTx(confirmedResult.txHash);
      setStage("confirmed");
      setStatus({
        tone: "success",
        title: confirmedResult.alreadyEnrolled ? "Credential already enrolled" : "Credential enrolled",
        message: confirmedResult.alreadyEnrolled
          ? "The Preprod indexer already has this credential in the gate allowlist."
          : confirmedResult.txHash
            ? "The Preprod indexer confirmed this credential enrollment."
            : `The Preprod indexer confirmed this credential enrollment. Confirmed by ${confirmedResult.wallet === "1am" ? "1AM Wallet" : "the wallet"}.`,
      });
      logWalletActionUi("credential_enrollment", confirmedResult, "credential_enrolled");
    } catch (error) {
      setStage("error");
      setStatus(statusFromError(error));
    } finally {
      setBusy(false);
    }
  };

  const proveAccess = async () => {
    setBusy(true);
    setActionContext("prove");
    setStage("preparing");
    setLastTx(null);
    try {
      if (!published || !current.contractId) throw new Error("GATE_NOT_CONFIGURED");
      if (!client.isConnected) throw new Error("WALLET_NOT_CONNECTED");
      if (!client.addresses) await client.loadWalletAddresses();
      const result: AccessVerificationResult = await client.verifyCredential(parseCredential(credential), current.contractId, setStage as (stage: TransactionProgressStage) => void);
      if (!result.success) throw new Error("ACCESS_SUBMIT:Wallet did not submit the access request.");
      if (result.txHash) {
        setStage("confirming");
        setStatus({
          tone: "busy",
          title: "Confirming access proof",
          message: "Waiting for the Preprod indexer to confirm this transaction.",
        });
        await client.waitForTransaction(result.txHash);
        setLastTx(result.txHash);
      }
      const confirmedResult = {
        ...result,
        confirmed: true,
        status: "confirmed",
      };
      markGateUnlocked({
        gateId: current.id,
        contractId: current.contractId,
        txId: confirmedResult.txHash ?? null,
        unlockedAt: Date.now(),
      });
      setAccessGranted(true);
      setCredential("");
      setStage("confirmed");
      setStatus({
        tone: "success",
        title: "Access granted",
        message: confirmedResult.txHash
          ? `Your membership was verified for ${current.name} without revealing your private credential.`
          : `Your membership was verified for ${current.name} without revealing your private credential. Verification confirmed by ${confirmedResult.wallet === "1am" ? "1AM Wallet" : "the wallet"}.`,
      });
      logWalletActionUi("access_verification", confirmedResult, "access_granted");
    } catch (error) {
      setStage("error");
      setStatus(statusFromError(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await client.disconnect();
    setSession(null);
    setWalletName(null);
    setWalletRdns(null);
    setWalletInjectionKey(null);
    setWalletConnecting(false);
    setAccessGranted(false);
    setStage("idle");
    setStatus({
      tone: "neutral",
      title: "Wallet disconnected",
      message: "The local wallet session was cleared.",
    });
  };

  const resetDraft = () => {
    const next = resetGateToDraft(current);
    setLocalGate(next);
    setLastTx(null);
    setContractStatus("idle");
    setStatus({
      tone: "warning",
      title: "Draft reset",
      message: "Local gate data was cleared. Any previously published gate remains on Midnight and can be restored by address.",
    });
  };

  const walletBlock = session ? (
    <WalletSessionBar
      walletName={walletName}
      address={session.unshieldedAddress}
      network={session.networkId}
      busy={controlsBusy}
      onDisconnect={disconnect}
      onSwitch={chooseWallet}
    />
  ) : (
    <button
      type="button"
      onClick={chooseWallet}
      disabled={controlsBusy}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
    >
      <WalletCards size={17} aria-hidden="true" />
      {walletConnecting ? "Wallet approval pending" : "Connect wallet"}
    </button>
  );

  const renderTransactionStatus = stage !== "idle" && (
    <>
      <StatusBanner tone={status.tone} title={status.title}>{status.message}</StatusBanner>
      {(busy || walletConnecting || stage === "error" || stage === "confirmed") && (
        <ProgressPanel stage={stage} context={actionContext} />
      )}
      {lastTx && <ProofReference value={lastTx} network={current.network} />}
      {txUrl && (
        <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-primary">
          View latest transaction
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      )}
    </>
  );

  if (mode === "admin") {
    return (
      <PageShell eyebrow={title.eyebrow} title={title.title} description={title.description} maxWidth="7xl">
        <div className="space-y-6">
          <StepProgress
            gateName={gateName || DEFAULT_GATE.name}
            configured={configured}
            connected={Boolean(session)}
            published={published}
            issued={credentialIssued}
          />

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-6">
              <div className="paper-card p-5 sm:p-6">
                <SectionTitle
                  icon={ShieldCheck}
                  title="Gate setup"
                  body="Members see this information before they connect."
                />
                <label className="mt-6 block">
                  <span className="field-label">Gate name</span>
                  <input
                    className="field-input mt-2"
                    value={gateName}
                    onChange={(event) => setGateName(event.target.value)}
                    disabled={controlsBusy}
                  />
                </label>
                <label className="mt-5 block">
                  <span className="field-label">Public description</span>
                  <textarea
                    className="field-input mt-2 min-h-28 resize-y"
                    value={gateDescription}
                    onChange={(event) => setGateDescription(event.target.value)}
                    disabled={controlsBusy}
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-faint">Avoid secrets or personal information. This description is public gate metadata.</p>
                <label className="mt-5 block">
                  <span className="field-label">Private content</span>
                  <textarea
                    className="field-input mt-2 min-h-36 resize-y"
                    value={privateContent}
                    onChange={(event) => setPrivateContent(event.target.value)}
                    disabled={controlsBusy}
                    placeholder="Members-only content shown only after successful verification"
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-faint">Only verified members will see this. Do not put private credentials here.</p>
                <StatusBanner tone="info" className="mt-5">
                  preprod network - one-time proof - private credential verification for {gateName || DEFAULT_GATE.name}
                </StatusBanner>
                <button
                  type="button"
                  onClick={saveConfiguration}
                  disabled={controlsBusy || !configured}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save gate configuration
                </button>
              </div>

              <div className="paper-card p-5 sm:p-6">
                <SectionTitle
                  icon={WalletCards}
                  title="Wallet and publishing"
                  body="Connect a Midnight Preprod wallet, then publish the saved gate."
                />
                <div className="mt-5 flex items-center gap-2 text-sm text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
                  {wallets.length} compatible wallet{wallets.length === 1 ? "" : "s"} detected
                </div>
                <div className="mt-4">{walletBlock}</div>

                {contractChecking && (
                  <StatusBanner tone="busy" title="Checking published gate" className="mt-5">
                    {contractStatusDetail}
                  </StatusBanner>
                )}

                {published && current.contractId && (
                  <StatusBanner tone="success" title={`${current.name} published`} className="mt-5">
                    <div className="space-y-3">
                      <p>The gate is live on Midnight Preprod.</p>
                      <p className="break-all font-mono text-xs">{shorten(current.contractId, 14)}</p>
                      <div className="flex flex-wrap gap-2">
                        <ButtonCopy
                          value={normalizeContractId(current.contractId)}
                          copyKey="contract-address"
                          copiedKey={copiedKey}
                          onCopied={markCopied}
                          onCopyFailed={handleCopyFailed}
                        >
                          Copy full address
                        </ButtonCopy>
                        {contractUrl && (
                          <a href={contractUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle px-4 text-xs font-semibold text-muted hover:bg-secondary hover:text-primary">
                            <ExternalLink size={14} aria-hidden="true" />
                            View on Explorer
                          </a>
                        )}
                        <ButtonCopy
                          value={memberLink}
                          copyKey="published-member-link"
                          copiedKey={copiedKey}
                          onCopied={markCopied}
                          onCopyFailed={handleCopyFailed}
                        >
                          Copy member gate link
                        </ButtonCopy>
                      </div>
                    </div>
                  </StatusBanner>
                )}

                {hasContractAddress && (contractStatus === "unpublished" || contractStatus === "error") && (
                  <StatusBanner tone="warning" title="Published gate needs attention" className="mt-5">
                    {contractStatusDetail || "The saved gate could not be confirmed on Midnight Preprod. Restore the correct address before publishing again."}
                  </StatusBanner>
                )}

                {!hasContractAddress && !published && !contractChecking && configured && session && (
                  <div className="mt-5 rounded-2xl border border-border-subtle bg-card p-5">
                    <SectionTitle
                      icon={Rocket}
                      title="Publish gate"
                      body={`Publish ${gateName || DEFAULT_GATE.name} on Midnight Preprod.`}
                    />
                    <button
                      type="button"
                      onClick={publishGate}
                      disabled={controlsBusy}
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Publish private gate
                    </button>
                  </div>
                )}

                {!session && configured && !published && (
                  <StatusBanner tone="neutral" title="Wallet required" className="mt-5">
                    Connect Lace or 1AM Wallet on Preprod to continue.
                  </StatusBanner>
                )}

                {renderTransactionStatus}
              </div>

              <div className="paper-card p-5 sm:p-6">
                <SectionTitle
                  icon={Link2}
                  title="Restore published gate"
                  body="Paste an existing Preprod gate address to reattach this admin console on a new device or after cleared storage."
                />
                <label className="mt-5 block">
                  <span className="field-label">Contract address</span>
                  <input
                    className="field-input mt-2 font-mono text-xs"
                    value={restoreAddress}
                    onChange={(event) => setRestoreAddress(event.target.value)}
                    placeholder="Contract hex from publish or Explorer (0x optional)"
                    disabled={controlsBusy}
                  />
                </label>
                <button
                  type="button"
                  onClick={restoreGate}
                  disabled={controlsBusy || !restoreAddress.trim()}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary px-5 text-sm font-semibold text-primary transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 size={16} aria-hidden="true" />
                  Verify and restore
                </button>
                <div className="mt-8 border-t border-border-subtle pt-5">
                  <button
                    type="button"
                    onClick={resetDraft}
                    disabled={controlsBusy}
                    className="text-sm font-medium text-muted underline underline-offset-4 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear local gate data and start fresh
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="paper-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <SectionTitle
                    icon={KeyRound}
                    title="Issue a member credential"
                    body="Generate a private credential for someone who should be allowed to access this gate."
                  />
                  <StageBadge label={published ? "Ready to issue" : "Publish first"} tone={published ? "success" : "warning"} />
                </div>
                <StatusBanner tone="info" title="Privacy notice" className="mt-5">
                  Nexora hashes the credential locally before enrollment. Only the hash is submitted for the public allowlist.
                </StatusBanner>

                <button
                  type="button"
                  onClick={() => {
                    setCredential(randomCredential());
                    setCredentialIssued(false);
                    setStatus({
                      tone: "success",
                      title: "Credential generated locally",
                      message: "Enroll its hash, then share the raw value through a private channel.",
                    });
                  }}
                  disabled={controlsBusy || !published}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border-subtle px-5 text-sm font-semibold text-muted transition-colors hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound size={16} aria-hidden="true" />
                  Generate credential locally
                </button>

                <label className="mt-5 block">
                  <span className="field-label">Private credential</span>
                  <input
                    className="field-input mt-2 font-mono text-xs"
                    value={credential}
                    onChange={(event) => setCredential(event.target.value)}
                    disabled={controlsBusy || !published}
                    placeholder="Generate a credential or paste one to enroll"
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-faint">Keep this secret. It is not saved by Nexora.</p>

                <button
                  type="button"
                  onClick={enrollCredential}
                  disabled={controlsBusy || !published || !credential.trim()}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound size={16} aria-hidden="true" />
                  Enroll credential
                </button>

                {credentialIssued && credential && (
                  <StatusBanner tone="success" title="Credential enrolled" className="mt-5">
                    <div className="space-y-3">
                      <p>This member can now verify access.</p>
                      <div className="rounded-2xl border border-amber-300/40 bg-amber-100 p-4 text-primary">
                        <p className="font-semibold uppercase">Share privately</p>
                        <p className="mt-2 break-all font-mono text-xs">{credential}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ButtonCopy
                            value={memberLink}
                            copyKey="credential-member-link"
                            copiedKey={copiedKey}
                            onCopied={markCopied}
                            onCopyFailed={handleCopyFailed}
                          >
                            Copy gate link
                          </ButtonCopy>
                          <ButtonCopy
                            value={credential}
                            copyKey="credential-secret"
                            copiedKey={copiedKey}
                            onCopied={markCopied}
                            onCopyFailed={handleCopyFailed}
                          >
                            Copy credential
                          </ButtonCopy>
                          <button
                            type="button"
                            onClick={() => setCredential("")}
                            className="inline-flex min-h-10 items-center rounded-full border border-border-subtle px-4 text-xs font-semibold text-muted hover:bg-secondary hover:text-primary"
                          >
                            Clear from this page
                          </button>
                        </div>
                      </div>
                    </div>
                  </StatusBanner>
                )}
              </div>

              <div className="paper-card p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-primary">What members need</h2>
                <ul className="mt-5 space-y-4 text-sm leading-6 text-muted">
                  <li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" />A compatible Midnight wallet on preprod.</li>
                  <li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" />The private credential you shared with them.</li>
                  <li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" />The member gate link, not this admin console.</li>
                </ul>
                {published && (
                  <Link href={gateUrl(current)} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-primary">
                    Open member gate
                    <ExternalLink size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </section>
          </div>
        </div>

        <WalletConnectModal
          open={walletModalOpen}
          wallets={wallets}
          selectedRdns={walletRdns}
          selectedInjectionKey={walletInjectionKey}
          disabled={walletConnecting}
          onClose={() => {
            if (!walletConnecting) setWalletModalOpen(false);
          }}
          onSelect={connectWallet}
        />
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={title.eyebrow} title={current.name} description={current.description} maxWidth="6xl">
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="paper-card p-6 sm:p-8">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-border-subtle bg-card text-accent" aria-hidden="true">
            <ShieldCheck size={34} />
          </span>
          <h2 className="mt-8 text-2xl font-semibold text-primary">Verify without revealing</h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            Nexora proves that your private credential belongs to this gate without revealing the credential.
          </p>
          <div className="mt-8 border-t border-border-subtle pt-6">
            <dl className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Network</dt>
                <dd className="font-mono text-accent">preprod</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Contract</dt>
                <dd className={published ? "text-accent" : "text-amber-500"}>
                  {contractChecking ? "Checking" : published ? "Published" : "Not published"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Gate</dt>
                <dd className="max-w-[12rem] truncate font-medium text-primary">{current.name}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="paper-card p-6 sm:p-8">
          {accessGranted ? (
            <div className="space-y-6">
              <StatusBanner tone="success" title="Access granted">
                Your membership was verified without revealing your private credential.
              </StatusBanner>

              <div className="rounded-2xl border border-accent/20 bg-accent/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{current.name} - Private Area</p>
                <h2 className="mt-3 text-2xl font-semibold text-primary">Welcome to {current.name}</h2>
                <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-muted">
                  {current.privateContent || DEFAULT_GATE.privateContent}
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted">
                <p>Verified with {walletName ?? "your Midnight wallet"} on Preprod.</p>
                {lastTx && <ProofReference value={lastTx} network={current.network} />}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-primary">Complete verification</h2>
                  <p className="mt-3 text-sm leading-6 text-muted">Paste the private credential sent to you by the gate administrator.</p>
                </div>
                <StageBadge label={published ? "Credential ready" : contractChecking ? "Checking gate" : "Wallet required"} tone={published ? "success" : "warning"} />
              </div>

              {contractChecking && (
                <StatusBanner tone="busy" title="Checking gate" className="mt-6">
                  {contractStatusDetail}
                </StatusBanner>
              )}

              {!published && !contractChecking && (
                <StatusBanner tone="warning" title="This gate is not published yet" className="mt-6">
                  The administrator must publish the gate and share the member link before access can be verified.
                </StatusBanner>
              )}

              <div className="mt-6">{walletBlock}</div>

              <label className="mt-6 block">
                <span className="field-label">Private access credential</span>
                <textarea
                  className="field-input mt-2 min-h-28 resize-y font-mono text-xs"
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  disabled={controlsBusy || !published}
                  placeholder="Paste the private credential from the gate administrator"
                />
              </label>
              <p className="mt-3 text-xs leading-5 text-faint">
                Your credential stays private. Nexora hashes it locally and uses it during proof generation.
              </p>

              <button
                type="button"
                onClick={proveAccess}
                disabled={controlsBusy || !published || !session || !credential.trim()}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                Generate private proof
              </button>

              <div className="mt-5 space-y-4">{renderTransactionStatus}</div>
            </>
          )}
        </section>
      </div>

      <WalletConnectModal
        open={walletModalOpen}
        wallets={wallets}
        selectedRdns={walletRdns}
        selectedInjectionKey={walletInjectionKey}
        disabled={walletConnecting}
        onClose={() => {
          if (!walletConnecting) setWalletModalOpen(false);
        }}
        onSelect={connectWallet}
      />
    </PageShell>
  );
}
