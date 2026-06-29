"use client";

import * as React from "react";
import { Check, Copy, Download, Link2 } from "lucide-react";
import { estimateTransactionCount, type EdgeCases, type GenerationSpec } from "@/lib/domain/spec";
import type { ProductType } from "@/lib/domain/types";
import type { Confidence, InterpretSource } from "@/lib/interpret/merge";
import { Badge, cn } from "./ui";

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

const EDGE_LABELS: Record<keyof EdgeCases, string> = {
  nsfOverdraft: "Overdrafts / NSF",
  largeWires: "Large wires",
  newAccountFunding: "New-account funding",
  dormantAccounts: "Dormant accounts",
  closedWithResidual: "Closed with residual",
  atLimitAccounts: "At product limit",
  backdatedPostings: "Backdated postings",
  jointOwnership: "Joint ownership",
};

export function buildRequest(spec: GenerationSpec, notes: string[]) {
  const days = Math.round(
    (new Date(spec.dateRange.end).getTime() - new Date(spec.dateRange.start).getTime()) / 86_400_000,
  );
  return {
    institution: { type: spec.institutionType, name: spec.institutionName ?? null },
    scale: {
      customers: spec.partyCount,
      businessShare: spec.businessRatio,
      avgAccountsPerCustomer: spec.avgAccountsPerParty,
      jointOwnershipShare: spec.jointOwnershipRatio,
      estimatedAccounts: Math.round(spec.partyCount * spec.avgAccountsPerParty),
      estimatedTransactions: estimateTransactionCount(spec),
    },
    products: spec.products,
    window: { start: spec.dateRange.start, end: spec.dateRange.end, days },
    volume: { transactionsPerAccountPerMonth: spec.avgTransactionsPerAccountPerMonth, mix: spec.transactionMix },
    edgeCases: (Object.keys(spec.edgeCases) as (keyof EdgeCases)[]).filter((k) => spec.edgeCases[k]),
    largeWireThreshold: spec.largeWireThresholdMinor / 100,
    seed: spec.seed,
    assumptions: notes,
  };
}

export function RequestCard({
  spec,
  notes,
  source,
  model,
  confidence,
  getShareUrl,
}: {
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource | null;
  model?: string;
  confidence: Confidence;
  getShareUrl?: () => string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const days = Math.round(
    (new Date(spec.dateRange.end).getTime() - new Date(spec.dateRange.start).getTime()) / 86_400_000,
  );
  const estAccounts = Math.round(spec.partyCount * spec.avgAccountsPerParty);
  const estTxns = estimateTransactionCount(spec);
  const enabledEdges = (Object.keys(spec.edgeCases) as (keyof EdgeCases)[]).filter((k) => spec.edgeCases[k]);
  const json = React.useMemo(() => JSON.stringify(buildRequest(spec, notes), null, 2), [spec, notes]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const copyLink = async () => {
    if (!getShareUrl) return;
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const downloadRequest = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-data-request.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-medium text-ink">Test data request</h2>
          {source && (
            <Badge tone={source === "llm" ? "indigo" : "slate"}>
              {source === "llm" ? `read by ${model ?? "AI"}` : "keyword parser"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-pass" /> : <Copy className="h-3.5 w-3.5 text-ink-muted" />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button
            onClick={downloadRequest}
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken"
          >
            <Download className="h-3.5 w-3.5 text-ink-muted" /> Download request
          </button>
          {getShareUrl && (
            <button
              onClick={copyLink}
              title="Copy a link that reopens this request"
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken"
            >
              {linkCopied ? (
                <Check className="h-3.5 w-3.5 text-pass" />
              ) : (
                <Link2 className="h-3.5 w-3.5 text-ink-muted" />
              )}
              {linkCopied ? "Link copied" : "Copy link"}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3" aria-live="polite">
        {confidence !== "high" && (
          <div
            role="status"
            className={cn(
              "mb-3 rounded-md border px-3 py-2 text-[12.5px]",
              confidence === "low" ? "border-fail/30 bg-fail-bg text-fail" : "border-warn/30 bg-warn-bg text-warn",
            )}
          >
            {confidence === "low"
              ? "Low confidence — I couldn't confidently read that. The fields below are mostly defaults; review before generating."
              : "Partial read — I caught some of your description and assumed the rest. Check the fields below."}
          </div>
        )}

        <dl className="grid grid-cols-[170px_1fr] text-[13px]">
          <Row label="Institution" value={spec.institutionType === "credit_union" ? "Credit union" : "Community bank"} />
          <Row label="Products" value={spec.products.map((p) => PRODUCT_LABELS[p]).join(", ")} />
          <Row label="Customers" value={spec.partyCount.toLocaleString()} mono />
          <Row label="Businesses" value={`${Math.round(spec.businessRatio * 100)}%`} mono />
          <Row label="Joint-owned deposits" value={`${Math.round(spec.jointOwnershipRatio * 100)}%`} mono />
          <Row label="Window" value={`${spec.dateRange.start} → ${spec.dateRange.end} (${days} days)`} mono />
          <Row label="Volume" value={`${spec.avgTransactionsPerAccountPerMonth} transactions / account / month`} mono />
          <Row label="Large-wire threshold" value={`$${(spec.largeWireThresholdMinor / 100).toLocaleString()}`} mono />
          <Row label="Edge cases" value={enabledEdges.length ? enabledEdges.map((k) => EDGE_LABELS[k]).join(", ") : "none"} />
          <Row label="Seed" value={String(spec.seed)} mono />
          <Row
            label="Will generate"
            value={`≈ ${estAccounts.toLocaleString()} accounts · ${estTxns.toLocaleString()} transactions`}
            mono
          />
        </dl>

        {notes.length > 0 && (
          <div className="mt-4">
            <div className="micro mb-2">Assumptions</div>
            <ul className="space-y-1.5">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] text-ink-muted">
                  <span className="select-none text-accent">·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="border-t border-line py-2 text-ink-faint">{label}</dt>
      <dd className={cn("border-t border-line py-2 text-ink", mono && "font-mono tnum")}>{value}</dd>
    </>
  );
}
