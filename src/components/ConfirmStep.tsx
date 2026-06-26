"use client";

import * as React from "react";
import {
  LIMITS,
  estimateTransactionCount,
  type GenerationSpec,
} from "@/lib/domain/spec";
import { PRODUCT_TYPES, type ProductType } from "@/lib/domain/types";
import type { EdgeCases } from "@/lib/domain/spec";
import type { InterpretSource } from "@/lib/interpret/merge";
import { Badge, Button, Card, Field, NumberInput, Select, Spinner, TextInput, Toggle, cn } from "./ui";

const PRODUCT_LABELS: Record<ProductType, string> = {
  checking: "Checking",
  savings: "Savings",
  money_market: "Money Market",
  cd: "Certificate of Deposit",
  loan_auto: "Auto Loan",
  loan_mortgage: "Mortgage",
  loan_personal: "Personal Loan",
  credit_line: "Credit Line",
};

const EDGE_CASES: { key: keyof EdgeCases; label: string; description: string }[] = [
  { key: "nsfOverdraft", label: "NSF / overdrafts", description: "Debits that push checking negative, plus a fee." },
  { key: "newAccountFunding", label: "New-account funding", description: "Accounts opened in-window, funded by a first deposit." },
  { key: "jointOwnership", label: "Joint ownership", description: "Deposit accounts with two owners." },
  { key: "largeWires", label: "Large wires", description: "Wires above the review threshold." },
  { key: "dormantAccounts", label: "Dormant accounts", description: "Little to no recent activity." },
  { key: "atLimitAccounts", label: "At product limit", description: "Maxed credit lines, balances at minimums." },
  { key: "backdatedPostings", label: "Backdated postings", description: "Posting date trails effective date." },
  { key: "closedWithResidual", label: "Closed w/ residual", description: "Closed accounts with trailing activity." },
];

const MIX_KEYS: { key: keyof GenerationSpec["transactionMix"]; label: string }[] = [
  { key: "ach", label: "ACH" },
  { key: "card", label: "Card / POS" },
  { key: "transfer", label: "Transfer" },
  { key: "atm", label: "ATM" },
  { key: "check", label: "Check" },
  { key: "wire", label: "Wire" },
];

export function ConfirmStep({
  spec,
  notes,
  source,
  model,
  generating,
  onChange,
  onBack,
  onGenerate,
}: {
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource;
  model?: string;
  generating: boolean;
  onChange: (s: GenerationSpec) => void;
  onBack: () => void;
  onGenerate: (s: GenerationSpec) => void;
}) {
  const set = <K extends keyof GenerationSpec>(key: K, value: GenerationSpec[K]) =>
    onChange({ ...spec, [key]: value });

  const setEdge = (key: keyof EdgeCases, value: boolean) =>
    onChange({ ...spec, edgeCases: { ...spec.edgeCases, [key]: value } });

  const setMix = (key: keyof GenerationSpec["transactionMix"], value: number) =>
    onChange({ ...spec, transactionMix: { ...spec.transactionMix, [key]: value } });

  const toggleProduct = (p: ProductType) => {
    const has = spec.products.includes(p);
    const next = has ? spec.products.filter((x) => x !== p) : [...spec.products, p];
    if (next.length === 0) return; // keep at least one
    set("products", next);
  };

  const estTxns = React.useMemo(() => estimateTransactionCount(spec), [spec]);
  const estAccounts = Math.round(spec.partyCount * spec.avgAccountsPerParty);
  const nearCap = estTxns > LIMITS.maxTransactions * 0.9;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: interpretation notes + estimate (the "transparency" panel) */}
      <div className="flex flex-col gap-4 lg:col-span-1">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">How we read that</h2>
            <Badge tone={source === "llm" ? "indigo" : "slate"}>
              {source === "llm" ? `AI${model ? ` · ${model}` : ""}` : "keyword parser"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Review and correct anything below before we generate. This is the step that
            keeps the wrong data from producing misleading test results.
          </p>
          {notes.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden className="text-indigo-500">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">This will generate</h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Estimate label="Customers" value={spec.partyCount.toLocaleString()} />
            <Estimate label="Accounts" value={`≈ ${estAccounts.toLocaleString()}`} />
            <Estimate label="Transactions" value={`≈ ${estTxns.toLocaleString()}`} />
          </dl>
          {nearCap && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Near the {LIMITS.maxTransactions.toLocaleString()}-transaction cap; volume may
              be trimmed to stay responsive.
            </p>
          )}
        </Card>

        <div className="hidden gap-2 lg:flex">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            &larr; Back
          </Button>
          <Button onClick={() => onGenerate(spec)} disabled={generating} className="flex-1">
            {generating ? (
              <>
                <Spinner className="h-4 w-4" /> Generating…
              </>
            ) : (
              <>Generate dataset &rarr;</>
            )}
          </Button>
        </div>
      </div>

      {/* Right: the editable spec */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Institution &amp; scale</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Institution type">
              <Select
                value={spec.institutionType}
                onChange={(e) => set("institutionType", e.target.value as GenerationSpec["institutionType"])}
              >
                <option value="community_bank">Community bank</option>
                <option value="credit_union">Credit union</option>
              </Select>
            </Field>
            <Field label="Institution name" hint="Leave blank to auto-generate.">
              <TextInput
                value={spec.institutionName ?? ""}
                placeholder="(auto)"
                onChange={(e) => set("institutionName", e.target.value || undefined)}
              />
            </Field>
            <Field label="Customers / members">
              <NumberInput
                min={1}
                max={LIMITS.maxParties}
                value={spec.partyCount}
                onChange={(e) => set("partyCount", clampInt(e.target.value, 1, LIMITS.maxParties, spec.partyCount))}
              />
            </Field>
            <Field label="Avg accounts per customer">
              <NumberInput
                min={1}
                max={6}
                step={0.1}
                value={spec.avgAccountsPerParty}
                onChange={(e) => set("avgAccountsPerParty", clampNum(e.target.value, 1, 6, spec.avgAccountsPerParty))}
              />
            </Field>
            <RatioField
              label="Businesses"
              value={spec.businessRatio}
              onChange={(v) => set("businessRatio", v)}
            />
            <RatioField
              label="Joint-owned deposit accounts"
              value={spec.jointOwnershipRatio}
              onChange={(v) => set("jointOwnershipRatio", v)}
            />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Products in scope</h3>
          <p className="mb-3 text-xs text-slate-500">Accounts are only opened for selected products.</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TYPES.map((p) => {
              const active = spec.products.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProduct(p)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-indigo-300 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {PRODUCT_LABELS[p]}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Time period &amp; volume</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <TextInput
                type="date"
                value={spec.dateRange.start}
                onChange={(e) => set("dateRange", { ...spec.dateRange, start: e.target.value })}
              />
            </Field>
            <Field label="End date">
              <TextInput
                type="date"
                value={spec.dateRange.end}
                onChange={(e) => set("dateRange", { ...spec.dateRange, end: e.target.value })}
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
              />
            </Field>
            <Field label="Large-wire review threshold ($)">
              <NumberInput
                min={0}
                step={1000}
                value={Math.round(spec.largeWireThresholdMinor / 100)}
                onChange={(e) =>
                  set("largeWireThresholdMinor", Math.max(0, Math.round(Number(e.target.value) || 0)) * 100)
                }
              />
            </Field>
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium text-slate-700">Transaction mix</span>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MIX_KEYS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <NumberInput
                    min={0}
                    value={spec.transactionMix[key]}
                    onChange={(e) => setMix(key, Math.max(0, Number(e.target.value) || 0))}
                  />
                </Field>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Edge cases</h3>
          <p className="mb-3 text-xs text-slate-500">
            Only the ones you enable are generated — and each enabled case is verified
            present by the validator.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {EDGE_CASES.map(({ key, label, description }) => (
              <Toggle
                key={key}
                checked={spec.edgeCases[key]}
                onChange={(v) => setEdge(key, v)}
                label={label}
                description={description}
              />
            ))}
          </div>
        </Card>

        {/* Mobile action bar */}
        <div className="flex gap-2 lg:hidden">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            &larr; Back
          </Button>
          <Button onClick={() => onGenerate(spec)} disabled={generating} className="flex-1">
            {generating ? <Spinner className="h-4 w-4" /> : <>Generate &rarr;</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Estimate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-3">
      <dd className="text-base font-semibold text-slate-900">{value}</dd>
      <dt className="mt-0.5 text-xs text-slate-500">{label}</dt>
    </div>
  );
}

function RatioField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <Field label={`${label} — ${pct}%`}>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-indigo-600"
      />
    </Field>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
