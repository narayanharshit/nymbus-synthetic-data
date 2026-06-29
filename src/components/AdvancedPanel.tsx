"use client";

import * as React from "react";
import type { GenerationSpec } from "@/lib/domain/spec";
import { NumberInput } from "./ui";

const MIX_KEYS: { key: keyof GenerationSpec["transactionMix"]; label: string }[] = [
  { key: "ach", label: "ACH" },
  { key: "card", label: "Card" },
  { key: "transfer", label: "Transfer" },
  { key: "atm", label: "ATM" },
  { key: "check", label: "Check" },
  { key: "wire", label: "Wire" },
];

/**
 * The escape hatch for power users: only the granular distribution knobs that a
 * consultant rarely needs. Everything they typically review/adjust lives on the
 * main request card (institution, products, scale, window, threshold, edge cases).
 */
export function AdvancedPanel({
  spec,
  onChange,
}: {
  spec: GenerationSpec;
  onChange: (s: GenerationSpec) => void;
}) {
  const setMix = (key: keyof GenerationSpec["transactionMix"], value: number) =>
    onChange({ ...spec, transactionMix: { ...spec.transactionMix, [key]: value } });

  return (
    <div className="space-y-4 text-[13px]">
      <Ratio label="Businesses" value={spec.businessRatio} onChange={(v) => onChange({ ...spec, businessRatio: v })} />
      <Ratio
        label="Joint-owned deposits"
        value={spec.jointOwnershipRatio}
        onChange={(v) => onChange({ ...spec, jointOwnershipRatio: v })}
      />

      <label className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-ink">Avg accounts per customer</span>
        <NumberInput
          min={1}
          max={5}
          step={0.1}
          value={spec.avgAccountsPerParty}
          onChange={(e) =>
            onChange({ ...spec, avgAccountsPerParty: clampNum(e.target.value, 1, 5, spec.avgAccountsPerParty) })
          }
          className="w-24 py-1.5"
        />
      </label>

      <div>
        <div className="micro mb-1.5">Transaction mix (relative weights)</div>
        <div className="grid grid-cols-3 gap-2">
          {MIX_KEYS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11.5px] text-ink-muted">{label}</span>
              <NumberInput
                min={0}
                value={spec.transactionMix[key]}
                onChange={(e) => setMix(key, Math.max(0, Number(e.target.value) || 0))}
                className="py-1"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ratio({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        <span className="font-mono tnum text-[11px] text-ink-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="w-full accent-accent"
      />
    </div>
  );
}

function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}
