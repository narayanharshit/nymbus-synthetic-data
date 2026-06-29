"use client";

import * as React from "react";
import { Check, Copy, Download, Link2 } from "lucide-react";
import { estimateTransactionCount, LIMITS, type EdgeCases, type GenerationSpec } from "@/lib/domain/spec";
import { PRODUCT_TYPES, type ProductType } from "@/lib/domain/types";
import type {
  Confidence,
  FieldProvenance,
  InterpretSource,
  Provenance,
  ProvenanceField,
} from "@/lib/interpret/merge";
import { WHAT_TO_TEST } from "@/lib/validate/validate";
import { cn } from "./ui";

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

// The boolean edge cases. Joint ownership is a ratio (in Advanced), not a toggle.
const EDGE_TOGGLES: { key: keyof EdgeCases; label: string }[] = [
  { key: "nsfOverdraft", label: "Overdrafts / NSF" },
  { key: "largeWires", label: "Large wires" },
  { key: "newAccountFunding", label: "New-account funding" },
  { key: "dormantAccounts", label: "Dormant" },
  { key: "closedWithResidual", label: "Closed w/ residual" },
  { key: "atLimitAccounts", label: "At product limit" },
  { key: "backdatedPostings", label: "Backdated" },
];

function daysBetween(spec: GenerationSpec): number {
  return Math.round(
    (new Date(spec.dateRange.end).getTime() - new Date(spec.dateRange.start).getTime()) / 86_400_000,
  );
}

/** Structured request artifact, including per-field stated/assumed provenance. */
export function buildRequest(spec: GenerationSpec, notes: string[], provenance?: Provenance) {
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
    window: { start: spec.dateRange.start, end: spec.dateRange.end, days: daysBetween(spec) },
    volume: { transactionsPerAccountPerMonth: spec.avgTransactionsPerAccountPerMonth, mix: spec.transactionMix },
    edgeCases: (Object.keys(spec.edgeCases) as (keyof EdgeCases)[]).filter((k) => spec.edgeCases[k]),
    largeWireThreshold: spec.largeWireThresholdMinor / 100,
    seed: spec.seed,
    assumptions: notes,
    ...(provenance ? { fieldSources: provenance } : {}),
  };
}

export function RequestCard({
  spec,
  onChange,
  provenance,
  onMarkStated,
  notes,
  source,
  model,
  confidence,
  getShareUrl,
}: {
  spec: GenerationSpec;
  onChange: (s: GenerationSpec) => void;
  provenance: Provenance;
  onMarkStated: (field: ProvenanceField) => void;
  notes: string[];
  source: InterpretSource | null;
  model?: string;
  confidence: Confidence;
  getShareUrl?: () => string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);

  const estAccounts = Math.round(spec.partyCount * spec.avgAccountsPerParty);
  const estTxns = estimateTransactionCount(spec);
  const days = daysBetween(spec);
  const capNote = notes.find((n) => /scaled down from|above the .*ceiling/i.test(n));
  const json = React.useMemo(() => JSON.stringify(buildRequest(spec, notes, provenance), null, 2), [spec, notes, provenance]);

  // Edit helpers: apply the change and mark the field as user-confirmed (stated).
  const edit = <K extends keyof GenerationSpec>(key: K, value: GenerationSpec[K], field: ProvenanceField) => {
    onChange({ ...spec, [key]: value });
    onMarkStated(field);
  };
  const toggleProduct = (p: ProductType) => {
    const next = spec.products.includes(p) ? spec.products.filter((x) => x !== p) : [...spec.products, p];
    if (next.length) edit("products", next, "products");
  };
  const toggleEdge = (key: keyof EdgeCases) => {
    onChange({ ...spec, edgeCases: { ...spec.edgeCases, [key]: !spec.edgeCases[key] } });
    onMarkStated("edgeCases");
  };

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

  const headerBtn =
    "flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken";

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-medium text-ink">Test data request — review &amp; edit</h2>
            {source && (
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                source === "llm" ? "bg-accent-weak text-accent" : "bg-sunken text-ink-muted",
              )}
            >
              {source === "llm" ? `read by ${model ?? "AI"}` : "keyword parser"}
            </span>
            )}
          </div>
          <p className="text-[12px] text-ink-muted">
            We filled this in from your description. Adjust anything, then generate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copy} className={headerBtn}>
            {copied ? <Check className="h-3.5 w-3.5 text-pass" /> : <Copy className="h-3.5 w-3.5 text-ink-muted" />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button onClick={downloadRequest} className={headerBtn}>
            <Download className="h-3.5 w-3.5 text-ink-muted" /> Download request
          </button>
          {getShareUrl && (
            <button onClick={copyLink} title="Copy a link that reopens this request" className={headerBtn}>
              {linkCopied ? <Check className="h-3.5 w-3.5 text-pass" /> : <Link2 className="h-3.5 w-3.5 text-ink-muted" />}
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

        <dl className="grid grid-cols-[150px_1fr] text-[13px]">
          <Row
            label="Institution"
            prov={provenance.institutionType}
            hint="Credit unions skew to members, joint accounts, and consumer lending; banks carry more business accounts."
          >
            <select
              value={spec.institutionType}
              aria-label="Institution type"
              onChange={(e) => edit("institutionType", e.target.value as GenerationSpec["institutionType"], "institutionType")}
              className="-mx-1 rounded px-1 py-0.5 text-[13px] text-ink hover:bg-sunken focus:bg-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <option value="community_bank">Community bank</option>
              <option value="credit_union">Credit union</option>
            </select>
          </Row>

          <Row label="Products" prov={provenance.products}>
            <div className="flex flex-wrap gap-1">
              {PRODUCT_TYPES.map((p) => {
                const active = spec.products.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleProduct(p)}
                    aria-pressed={active}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[11.5px]",
                      active
                        ? "border-accent/40 bg-accent-weak text-accent"
                        : "border-line bg-surface text-ink-faint hover:bg-sunken",
                    )}
                  >
                    {PRODUCT_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label={spec.institutionType === "credit_union" ? "Members" : "Customers"} prov={provenance.partyCount}>
            <InlineNumber
              value={spec.partyCount}
              min={1}
              max={LIMITS.maxParties}
              ariaLabel="customer count"
              muted={provenance.partyCount?.status === "assumed"}
              onCommit={(n) => edit("partyCount", n, "partyCount")}
            />
          </Row>

          <Row label="Window" prov={provenance.dateRange}>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={spec.dateRange.start}
                aria-label="Window start"
                onChange={(e) => edit("dateRange", { ...spec.dateRange, start: e.target.value }, "dateRange")}
                className="tnum rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink focus:border-accent focus:outline-none"
              />
              <span className="text-ink-faint">→</span>
              <input
                type="date"
                value={spec.dateRange.end}
                aria-label="Window end"
                onChange={(e) => edit("dateRange", { ...spec.dateRange, end: e.target.value }, "dateRange")}
                className="tnum rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink focus:border-accent focus:outline-none"
              />
              <span className="font-mono tnum text-[12px] text-ink-faint">({days} days)</span>
            </div>
          </Row>

          <Row label="Volume" prov={provenance.avgTransactionsPerAccountPerMonth}>
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1">
                <InlineNumber
                  value={spec.avgTransactionsPerAccountPerMonth}
                  min={0}
                  max={120}
                  ariaLabel="transactions per account per month"
                  muted={provenance.avgTransactionsPerAccountPerMonth?.status === "assumed"}
                  onCommit={(n) => edit("avgTransactionsPerAccountPerMonth", n, "avgTransactionsPerAccountPerMonth")}
                />
                <span className="text-[12.5px] text-ink-muted">transactions / account / month</span>
              </span>
              {capNote && <span className="text-[11.5px] text-warn">{capNote}</span>}
            </div>
          </Row>

          <Row
            label="Large-wire threshold"
            prov={provenance.largeWireThresholdMinor}
            hint={`Match the client's wire-monitoring rules so large-wire / AML alerts fire during testing. (Reference: the funds-transfer "Travel Rule" applies to wires of $3,000+.)`}
          >
            <InlineNumber
              value={Math.round(spec.largeWireThresholdMinor / 100)}
              min={0}
              ariaLabel="large-wire threshold in dollars"
              format={(n) => `$${n.toLocaleString()}`}
              muted={provenance.largeWireThresholdMinor?.status === "assumed"}
              onCommit={(n) => edit("largeWireThresholdMinor", Math.round(n) * 100, "largeWireThresholdMinor")}
            />
          </Row>

          <Row label="Edge cases" prov={provenance.edgeCases}>
            <div className="flex flex-wrap gap-1">
              {EDGE_TOGGLES.map(({ key, label }) => {
                const active = Boolean(spec.edgeCases[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleEdge(key)}
                    role="switch"
                    aria-checked={active}
                    title={WHAT_TO_TEST[key]}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[11.5px]",
                      active
                        ? "border-accent/40 bg-accent-weak text-accent"
                        : "border-line bg-surface text-ink-faint hover:bg-sunken",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label="Seed" prov={provenance.seed}>
            <InlineNumber
              value={spec.seed}
              min={1}
              ariaLabel="random seed"
              muted={provenance.seed?.status === "assumed"}
              onCommit={(n) => edit("seed", Math.max(1, n), "seed")}
            />
          </Row>

          <dt className="border-t border-line py-2 text-ink-faint">Will generate</dt>
          <dd className="border-t border-line py-2 font-mono tnum text-ink">
            ≈ {estAccounts.toLocaleString()} accounts · {estTxns.toLocaleString()} transactions
          </dd>
        </dl>

        {(() => {
          // The volume-cap note is shown inline next to Volume; don't repeat it here.
          const listNotes = notes.filter((n) => n !== capNote);
          if (!listNotes.length) return null;
          return (
            <div className="mt-4">
              <div className="micro mb-2">Assumptions</div>
              <ul className="space-y-1.5">
                {listNotes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-ink-muted">
                    <span className="select-none text-accent">·</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** One request row: label, the editable value, a stated/assumed tag, optional hint. */
function Row({
  label,
  prov,
  hint,
  children,
}: {
  label: string;
  prov?: FieldProvenance;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center border-t border-line py-2 text-ink-faint">{label}</dt>
      <dd className="border-t border-line py-2 text-ink">
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <ProvTag prov={prov} />
        </div>
        {hint && <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">{hint}</p>}
      </dd>
    </>
  );
}

/** Muted "assumed" pill that reveals its reason on hover/focus. Stated → no tag. */
function ProvTag({ prov }: { prov?: FieldProvenance }) {
  if (!prov || prov.status === "stated") return null;
  return (
    <span className="group/prov relative inline-flex">
      <span
        tabIndex={0}
        role="note"
        className="cursor-help rounded bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-ink-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        assumed
      </span>
      {prov.reason && (
        <span className="pointer-events-none absolute left-0 top-[calc(100%+4px)] z-20 hidden w-60 rounded-md border border-line bg-surface p-2 text-[11.5px] leading-snug text-ink-muted shadow-md group-hover/prov:block group-focus-within/prov:block">
          {prov.reason}
        </span>
      )}
    </span>
  );
}

/** Click-to-edit number: shows the value as text; click → input; Enter/blur commits, Esc cancels. */
function InlineNumber({
  value,
  onCommit,
  min,
  max,
  format,
  ariaLabel,
  muted,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  format?: (n: number) => string;
  ariaLabel: string;
  muted?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    let n = Number(draft);
    if (Number.isNaN(n)) n = value;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    n = Math.round(n);
    setEditing(false);
    if (n !== value) onCommit(n);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className="tnum w-28 rounded border border-accent bg-surface px-1.5 py-0.5 text-[13px] text-ink focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      aria-label={`Edit ${ariaLabel}`}
      className={cn(
        "tnum -mx-1 rounded px-1 py-0.5 text-left font-mono hover:bg-sunken focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        muted ? "text-ink-muted" : "text-ink",
      )}
    >
      {format ? format(value) : value.toLocaleString()}
    </button>
  );
}
