"use client";

import { LogOut, WalletCards } from "lucide-react";

type WalletSessionBarProps = {
  walletName?: string | null;
  address?: string | null;
  network?: string | null;
  busy?: boolean;
  onDisconnect: () => void;
  onSwitch?: () => void;
  className?: string;
};

function shortAddress(address: string): string {
  if (address.length <= 18) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function WalletSessionBar({
  walletName,
  address,
  network,
  busy = false,
  onDisconnect,
  onSwitch,
  className = "",
}: WalletSessionBarProps) {
  const onPreprod = network === "preprod";

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-accent-soft/40 bg-accent-dim p-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent-soft/60 bg-card text-accent" aria-hidden="true">
          <WalletCards size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-accent">
            {walletName || "Wallet"} connected
          </p>
          <p className={`mt-1 text-xs font-semibold ${onPreprod ? "text-accent" : "text-red-500"}`}>
            {onPreprod ? "Network: Midnight Preprod" : "Wrong Network - switch to Preprod"}
          </p>
          {address && (
            <p className="mt-1 break-all font-mono text-xs text-muted" title={address}>
              {shortAddress(address)}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onSwitch && (
          <button
            type="button"
            onClick={onSwitch}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-primary px-4 text-xs font-semibold text-primary transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Switch wallet
          </button>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border-subtle px-4 text-xs font-semibold text-muted transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <LogOut size={14} aria-hidden="true" />
          Disconnect
        </button>
      </div>
    </div>
  );
}
