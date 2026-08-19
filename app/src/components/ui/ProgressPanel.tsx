"use client";

import { LoaderCircle } from "lucide-react";
import { progressDetail, progressLabel, type ProgressStage } from "@/lib/transaction-stages";

const ORDER: ProgressStage[] = ["preparing", "proving", "balancing", "awaiting_wallet", "submitted", "confirming", "confirmed"];

function stageIndex(stage: ProgressStage): number {
  const index = ORDER.indexOf(stage);
  return index >= 0 ? index : -1;
}

type ProgressPanelProps = {
  stage: ProgressStage;
  context?: "enroll" | "prove" | "deploy";
  message?: string;
};

export function ProgressPanel({ stage, context = "prove", message }: ProgressPanelProps) {
  const current = stageIndex(stage);
  const active = current >= 0 && stage !== "confirmed" && stage !== "error" && stage !== "idle";

  return (
    <div className="paper-card p-5" role="status" aria-live="polite">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="eyebrow">Progress</p>
        <p className="break-words text-xs font-semibold text-accent">{progressLabel(stage, context)}</p>
      </div>
      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {ORDER.slice(0, 6).map((item, index) => {
          const done = current > index || stage === "confirmed";
          const here = current === index;
          return (
            <div
              key={item}
              className={`h-1 flex-1 rounded-full ${done ? "bg-accent" : here ? "bg-accent/60 animate-pulse" : "bg-secondary"}`}
            />
          );
        })}
      </div>
      <div className="mt-4 flex items-start gap-3">
        {active && <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">{progressLabel(stage, context)}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{message || progressDetail(stage)}</p>
        </div>
      </div>
    </div>
  );
}
