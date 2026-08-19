"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_GATE,
  resolveGate,
  type GateRecord,
  type GateSearchParams,
} from "@/lib/gate-store";

/**
 * Hydration-safe gate loader.
 * SSR + first paint use a stable shell; after mount, merge localStorage + URL params
 * (including `contract` so share links restore the published gate without admin storage).
 */
export function useGate(params: GateSearchParams | string | null | undefined = {}): {
  gate: GateRecord;
  ready: boolean;
} {
  const normalized: GateSearchParams =
    typeof params === "string" || params == null
      ? { gate: params ?? DEFAULT_GATE.id }
      : params;

  const shellId = normalized.gate && normalized.gate.length > 0 ? normalized.gate : DEFAULT_GATE.id;
  const [gate, setGate] = useState<GateRecord>(() => ({
    ...DEFAULT_GATE,
    id: shellId,
  }));
  const [ready, setReady] = useState(false);

  const contract = normalized.contract ?? null;
  const name = normalized.name ?? null;
  const description = normalized.description ?? null;
  const network = normalized.network ?? null;
  const gateParam = normalized.gate ?? null;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setGate(
        resolveGate({
          gate: gateParam,
          contract,
          name,
          description,
          network,
        }),
      );
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [gateParam, contract, name, description, network]);

  return { gate, ready };
}
