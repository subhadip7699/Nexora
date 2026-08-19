"use client";

import { useEffect, useRef } from "react";
import { Check, Shield, X } from "lucide-react";
import type { WalletOption } from "@/lib/midnight-client";

type WalletConnectModalProps = {
  open: boolean;
  wallets: WalletOption[];
  selectedRdns?: string | null;
  selectedInjectionKey?: string | null;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (wallet: WalletOption) => void;
};

function walletKey(wallet: WalletOption): string {
  return `${wallet.injectionKey}:${wallet.rdns}:${wallet.apiVersion}`;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "W";
}

export function WalletConnectModal({
  open,
  wallets,
  selectedRdns,
  selectedInjectionKey,
  disabled = false,
  onClose,
  onSelect,
}: WalletConnectModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-dark/35 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-border-subtle bg-card shadow-[0_24px_80px_rgba(20,22,26,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        aria-describedby="wallet-modal-description"
        aria-busy={disabled}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5 sm:p-6">
          <div className="min-w-0">
            <p className="eyebrow">Wallet connection</p>
            <h2 id="wallet-modal-title" className="mt-2 font-display text-2xl leading-tight text-primary sm:text-3xl">
              Choose a wallet
            </h2>
            <p id="wallet-modal-description" className="mt-2 text-sm leading-6 text-muted">
              Select the wallet you want to use for this Midnight session. Midnight will request permission only from that wallet.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-muted hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close wallet selection"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          {wallets.map((wallet) => {
            const selected = wallet.injectionKey === selectedInjectionKey && wallet.rdns === selectedRdns;
            return (
              <button
                key={walletKey(wallet)}
                type="button"
                onClick={() => onSelect(wallet)}
                disabled={disabled}
                className={`flex min-h-16 w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  selected ? "border-accent-soft bg-accent-dim" : "border-border-subtle bg-card hover:bg-secondary"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-secondary font-semibold text-accent" aria-hidden="true">
                  {initials(wallet.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-primary">{wallet.name}</span>
                  <span className="mt-1 block truncate font-mono text-xs text-faint">
                    {wallet.rdns}  -  API {wallet.apiVersion}
                  </span>
                </span>
                {selected ? <Check size={18} className="text-accent" aria-label="Selected" /> : <Shield size={18} className="text-faint" aria-hidden="true" />}
              </button>
            );
          })}
          {wallets.length === 0 && (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-100 p-4 text-sm leading-6 text-primary">
              No compatible Midnight wallet is available. Enable Lace or 1AM, then reload this page.
            </div>
          )}
        </div>
        <div className="border-t border-border-subtle px-6 py-4 text-xs leading-5 text-muted">
          Your wallet stays in the extension. Midnight never receives your seed phrase or private keys.
        </div>
      </section>
    </div>
  );
}
