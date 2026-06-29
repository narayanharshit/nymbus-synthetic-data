"use client";

import * as React from "react";
import { LIMITS, type EdgeCases, type GenerationSpec } from "@/lib/domain/spec";
import { PRODUCT_TYPES, type ProductType } from "@/lib/domain/types";
import { NumberInput, Select, TextInput, cn } from "./ui";

const PRODUCT_LABELS: Record<ProductType, string> = {
  checking: "Checking",
  savings: "Savings",
  money_market: "Money market",
  cd: "Certificate of deposit",
  loan_auto: "Auto loan",
  loan_mortgage: "Mortgage",
  loan_personal: "Personal loan",
  credit_line: "Credit line",
};

const EDGE_CASES: { key: keyof EdgeCases; label: string }[] = [
  { key: "nsfOverdraft", label: "Overdrafts / NSF" },
  { key: "largeWires", label: "Large wires" },
  { key: "newAccountFunding", label: "New-account funding" },
  { key: "dormantAccounts", label: "Dormant accounts" },
  { key: "closedWithResidual", label: "Closed with residual" },
  { key: "atLimitAccounts", label: "At product limit" },
  { key: "backdatedPostings", label: "Backdated postings" },
];

const MIX_KEYS: { key: keyof GenerationSpec["transactionMix"]; label: string }[] = [
  { key: "ach", label: "ACH" },
  { key: "card", label: "Card" },
  { key: "transfer", label: "Transfer" },
  { key: "atm", label: "ATM" },
  { key: "check", label: "Check" },
  { key: "wire", label: "Wire" },
];

export function AdvancedPanel({
  spec,
  onChange,
}: {
  spec: GenerationSpec;
  onChange: (s: GenerationSpec) => void;
}) {
  const set = <K extends keyof GenerationSpec>(key: K, value: GenerationSpec[K]) =>
    onChange({ ...spec, [key]: value });
  const setEdge = (key: keyof EdgeCases, value: boolean) =>
    onChange({ ...spec, edgeCases: { ...spec.edgeCases, [key]: value } });
  const setMix = (key: keyof GenerationSpec["transactionMix"], value: number) =>
    onChange({ ...spec, transactionMix: { ...spec.transactionMix, [key]: value } });
  const toggleProduct = (p: ProductType) => {
    const next = spec.products.includes(p) ? spec.products.filter((x) => x !== p) : [...spec.products, p];
    if (next.length) set("products", next);
  };

  return (
    <div className="space-y-4 text-[13px]">
      <Field label="Institution type">
        <Select
          value={spec.institutionType}
          onChange={(e) => set("institutionType", e.target.value as GenerationSpec["institutionType"])}
          className="py-1.5"
        >
          <option value="community_bank">Community bank</option>
          <option value="credit_union">Credit union</option>
        </Select>
      </Field>

      <Field label="Products in scope">
        <div className="flex flex-wrap gap-1.5">
          {PRODUCT_TYPES.map((p) => {
            const active = spec.products.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleProduct(p)}
                aria-pressed={active}
                className={cn(
                  "rounded border px-2 py-1 text-[12px]",
                  active ? "border-accent/40 bg-accent-weak text-accent" : "border-line bg-surface text-ink-muted hover:bg-sunken",
                )}
              >
                {PRODUCT_LABELS[p]}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={spec.institutionType === "credit_union" ? "Members" : "Customers"}>
          <NumberInput
            min={1}
            max={LIMITS.maxParties}
            value={spec.partyCount}
            onChange={(e) => set("partyCount", clampInt(e.target.value, 1, LIMITS.maxParties, spec.partyCount))}
            className="py-1.5"
          />
        </Field>
        <Field label="Transactions / account / month">
          <NumberInput
            min={0}
            max={120}
            value={spec.avgTransactionsPerAccountPerMonth}
            onChange={(e) =>
              set("avgTransactionsPerAccountPerMonth", clampNum(e.target.value, 0, 120, spec.avgTransactionsPerAccountPerMonth))
            }
            className="py-1.5"
          />
        </Field>
        <Field label="Window start">
          <TextInput
            type="date"
            value={spec.dateRange.start}
            onChange={(e) => set("dateRange", { ...spec.dateRange, start: e.target.value })}
            className="py-1.5 text-[12px]"
          />
        </Field>
        <Field label="Window end">
          <TextInput
            type="date"
            value={spec.dateRange.end}
            onChange={(e) => set("dateRange", { ...spec.dateRange, end: e.target.value })}
            className="py-1.5 text-[12px]"
          />
        </Field>
      </div>

      <Ratio label="Businesses" value={spec.businessRatio} onChange={(v) => set("businessRatio", v)} />
      <Ratio label="Joint-owned deposits" value={spec.jointOwnershipRatio} onChange={(v) => set("jointOwnershipRatio", v)} />

      <div>
        <div className="micro mb-1.5">Transaction mix</div>
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Large-wire threshold ($)">
          <NumberInput
            min={0}
            step={1000}
            value={Math.round(spec.largeWireThresholdMinor / 100)}
            onChange={(e) => set("largeWireThresholdMinor", Math.max(0, Math.round(Number(e.target.value) || 0)) * 100)}
            className="py-1.5"
          />
        </Field>
        <Field label="Seed">
          <NumberInput
            min={1}
            value={spec.seed}
            onChange={(e) => set("seed", Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className="py-1.5"
          />
        </Field>
      </div>

      <div>
        <div className="micro mb-1.5">Edge cases</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {EDGE_CASES.map(({ key, label }) => (
            <RailToggle key={key} label={label} checked={spec.edgeCases[key]} onChange={(v) => setEdge(key, v)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
    </label>
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

function RailToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-0.5 text-[12.5px] text-ink"
    >
      <span>{label}</span>
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-accent" : "bg-line-strong")}>
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}
function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}
