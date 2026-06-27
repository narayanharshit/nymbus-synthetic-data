"use client";

import * as React from "react";
import { Building2, Handshake, Landmark, Search, ShieldCheck, Sprout, Wand2 } from "lucide-react";
import { LIMITS, estimateTransactionCount, type EdgeCases, type GenerationSpec } from "@/lib/domain/spec";
import { PRODUCT_TYPES, type ProductType } from "@/lib/domain/types";
import { PRESETS } from "@/lib/domain/presets";
import type { Confidence } from "@/lib/interpret/merge";
import { Button, NumberInput, Select, Spinner, TextArea, TextInput, cn } from "./ui";

const PRODUCT_LABELS: Record<ProductType, string> = {
  checking: "Checking",
  savings: "Savings",
  money_market: "Money Mkt",
  cd: "CD",
  loan_auto: "Auto Loan",
  loan_mortgage: "Mortgage",
  loan_personal: "Personal Loan",
  credit_line: "Credit Line",
};

const EDGE_CASES: { key: keyof EdgeCases; label: string }[] = [
  { key: "nsfOverdraft", label: "Overdrafts / NSF" },
  { key: "largeWires", label: "Large wires" },
  { key: "newAccountFunding", label: "New-account funding" },
  { key: "dormantAccounts", label: "Dormant accounts" },
  { key: "closedWithResidual", label: "Closed w/ residual" },
  { key: "atLimitAccounts", label: "At product limit" },
  { key: "backdatedPostings", label: "Backdated postings" },
];

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  community_retail: Landmark,
  credit_union_lending: Handshake,
  business_banking: Building2,
  bsa_exceptions: ShieldCheck,
  de_novo: Sprout,
};

export function SpecRail({
  spec,
  onChange,
  text,
  setText,
  onInterpret,
  interpreting,
  interpretError,
  notes,
  confidence,
  source,
  model,
  onPreset,
  onGenerate,
  generating,
  stale,
}: {
  spec: GenerationSpec;
  onChange: (s: GenerationSpec) => void;
  text: string;
  setText: (t: string) => void;
  onInterpret: () => void;
  interpreting: boolean;
  interpretError: string | null;
  notes: string[];
  confidence: Confidence;
  source: "llm" | "heuristic" | null;
  model?: string;
  onPreset: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
  stale: boolean;
}) {
  const set = <K extends keyof GenerationSpec>(key: K, value: GenerationSpec[K]) =>
    onChange({ ...spec, [key]: value });
  const setEdge = (key: keyof EdgeCases, value: boolean) =>
    onChange({ ...spec, edgeCases: { ...spec.edgeCases, [key]: value } });

  const toggleProduct = (p: ProductType) => {
    const next = spec.products.includes(p) ? spec.products.filter((x) => x !== p) : [...spec.products, p];
    if (next.length) set("products", next);
  };

  const estTxns = estimateTransactionCount(spec);
  const estAccounts = Math.round(spec.partyCount * spec.avgAccountsPerParty);

  return (
    <aside className="flex w-[330px] flex-none flex-col border-r border-line bg-sunken">
      <div className="thin-scroll flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => {
            const Icon = PRESET_ICONS[p.id] ?? Landmark;
            return (
              <button
                key={p.id}
                onClick={() => onPreset(p.id)}
                title={p.label}
                aria-label={p.label}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <span className="micro ml-1">Presets</span>
        </div>

        <Group label="Describe the client">
          <TextArea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Community bank, 150 customers, checking & savings, auto loans, last 90 days; flag overdrafts and wires over $25,000."
            className="text-[12px]"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-ink-faint">
              {source ? (source === "llm" ? `Read by ${model ?? "AI"}` : "Read by keyword parser") : " "}
            </span>
            <Button variant="secondary" size="sm" onClick={onInterpret} disabled={interpreting}>
              {interpreting ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
              Interpret
            </Button>
          </div>
        </Group>

        {interpretError && (
          <div className="rounded-md border border-fail/30 bg-fail-bg px-2.5 py-2 text-[12px] text-fail">
            {interpretError}
          </div>
        )}

        {confidence !== "high" && (
          <div
            className={cn(
              "rounded-md border px-2.5 py-2 text-[11.5px]",
              confidence === "low" ? "border-fail/30 bg-fail-bg text-fail" : "border-warn/30 bg-warn-bg text-warn",
            )}
          >
            {confidence === "low"
              ? "Low confidence — I couldn't confidently read that. The fields below are mostly defaults; review before generating."
              : "Partial read — I caught some of it and assumed the rest. Check the fields below."}
          </div>
        )}

        {notes.length > 0 && (
          <ul className="space-y-1">
            {notes.slice(0, 4).map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[11.5px] text-ink-muted">
                <span className="text-accent">·</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-line pt-3">
          <Group label="Institution">
            <Select
              value={spec.institutionType}
              onChange={(e) => set("institutionType", e.target.value as GenerationSpec["institutionType"])}
              className="py-1.5 text-[12px]"
            >
              <option value="community_bank">Community bank</option>
              <option value="credit_union">Credit union</option>
            </Select>
          </Group>
        </div>

        <Group label="Products in scope">
          <div className="flex flex-wrap gap-1.5">
            {PRODUCT_TYPES.map((p) => {
              const active = spec.products.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => toggleProduct(p)}
                  className={cn(
                    "rounded border px-2 py-1 text-[11.5px]",
                    active
                      ? "border-accent/40 bg-accent-weak text-accent"
                      : "border-line bg-surface text-ink-muted hover:bg-surface",
                  )}
                >
                  {PRODUCT_LABELS[p]}
                </button>
              );
            })}
          </div>
        </Group>

        <div className="grid grid-cols-2 gap-2">
          <Group label={spec.institutionType === "credit_union" ? "Members" : "Customers"}>
            <NumberInput
              min={1}
              max={LIMITS.maxParties}
              value={spec.partyCount}
              onChange={(e) => set("partyCount", clampInt(e.target.value, 1, LIMITS.maxParties, spec.partyCount))}
              className="py-1.5"
            />
          </Group>
          <Group label="Txns / acct / mo">
            <NumberInput
              min={0}
              max={120}
              value={spec.avgTransactionsPerAccountPerMonth}
              onChange={(e) =>
                set("avgTransactionsPerAccountPerMonth", clampNum(e.target.value, 0, 120, spec.avgTransactionsPerAccountPerMonth))
              }
              className="py-1.5"
            />
          </Group>
          <Group label="Window start">
            <TextInput
              type="date"
              value={spec.dateRange.start}
              onChange={(e) => set("dateRange", { ...spec.dateRange, start: e.target.value })}
              className="py-1.5 text-[12px]"
            />
          </Group>
          <Group label="Window end">
            <TextInput
              type="date"
              value={spec.dateRange.end}
              onChange={(e) => set("dateRange", { ...spec.dateRange, end: e.target.value })}
              className="py-1.5 text-[12px]"
            />
          </Group>
        </div>

        <Ratio label="Businesses" value={spec.businessRatio} onChange={(v) => set("businessRatio", v)} />
        <Ratio
          label="Joint-owned deposits"
          value={spec.jointOwnershipRatio}
          onChange={(v) => set("jointOwnershipRatio", v)}
        />

        <Group label="Edge cases">
          <div className="space-y-1">
            {EDGE_CASES.map(({ key, label }) => (
              <RailToggle key={key} label={label} checked={spec.edgeCases[key]} onChange={(v) => setEdge(key, v)} />
            ))}
          </div>
        </Group>

        <div className="grid grid-cols-2 gap-2">
          <Group label="Large-wire ≥ $">
            <NumberInput
              min={0}
              step={1000}
              value={Math.round(spec.largeWireThresholdMinor / 100)}
              onChange={(e) => set("largeWireThresholdMinor", Math.max(0, Math.round(Number(e.target.value) || 0)) * 100)}
              className="py-1.5"
            />
          </Group>
          <Group label="Seed">
            <NumberInput
              min={1}
              value={spec.seed}
              onChange={(e) => set("seed", Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="py-1.5"
            />
          </Group>
        </div>
      </div>

      <div className="border-t border-line bg-sunken p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-ink-faint">
          <span className="micro">Will generate</span>
          <span className="font-mono tnum">
            ≈ {estAccounts.toLocaleString()} acct · {estTxns.toLocaleString()} txn
          </span>
        </div>
        <Button onClick={onGenerate} disabled={generating} className="w-full">
          {generating ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          {stale ? "Regenerate dataset" : "Generate dataset"}
        </Button>
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="micro mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Ratio({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="micro">{label}</span>
        <span className="font-mono tnum text-[11px] text-ink-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-accent"
      />
    </div>
  );
}

function RailToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-0.5 text-[12px] text-ink"
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
