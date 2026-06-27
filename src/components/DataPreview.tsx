"use client";

import * as React from "react";
import { Check, ChevronDown, Database, Download } from "lucide-react";
import type { Account, Dataset, Party, Transaction } from "@/lib/domain/types";
import type { ValidationResult, CheckStatus } from "@/lib/validate/validate";
import type { DatasetSummary } from "@/lib/summary";
import { formatUSD } from "@/lib/domain/money";
import { maskAccount } from "@/lib/generate/identity";
import { partyDisplayName } from "@/lib/generate/parties";
import { allExportFiles, type ExportFile } from "@/lib/export/exporters";
import { DataGrid, type GridColumn } from "./DataGrid";
import { Badge, cn } from "./ui";

type Tab = "accounts" | "transactions" | "parties";

function compactUSD(minor: number): string {
  const dollars = minor / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return formatUSD(minor);
}

function download(file: ExportFile) {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function statusTone(status: string): React.ComponentProps<typeof Badge>["tone"] {
  if (status === "active") return "green";
  if (status === "dormant") return "amber";
  if (status === "closed") return "red";
  return "slate";
}

export function DataPreview({
  dataset,
  validation,
  summary,
  generating,
}: {
  dataset: Dataset | null;
  validation: ValidationResult | null;
  summary: DatasetSummary | null;
  generating: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>("accounts");

  if (!dataset || !validation || !summary) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="max-w-sm text-center">
          <Database className="mx-auto h-6 w-6 text-ink-faint" />
          <p className="mt-3 text-[13px] font-medium text-ink">
            {generating ? "Generating dataset…" : "No dataset yet"}
          </p>
          <p className="mt-1 text-[12px] text-ink-muted">
            Configure the spec on the left and generate to preview a realistic, reconciling
            dataset here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <MetricStrip dataset={dataset} validation={validation} summary={summary} />

      <div className="flex items-center gap-4 border-b border-line px-3">
        {(["accounts", "transactions", "parties"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 py-2 text-[12px] capitalize",
              tab === t
                ? "border-accent font-semibold text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t}{" "}
            <span className="font-mono tnum text-[11px] text-ink-faint">
              {(t === "accounts"
                ? dataset.accounts.length
                : t === "transactions"
                  ? dataset.transactions.length
                  : dataset.parties.length
              ).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsGrid dataset={dataset} />}
      {tab === "transactions" && <TransactionsGrid dataset={dataset} />}
      {tab === "parties" && <PartiesGrid dataset={dataset} />}
    </div>
  );
}

/* ----------------------------- metric strip ----------------------------- */

function MetricStrip({
  dataset,
  validation,
  summary,
}: {
  dataset: Dataset;
  validation: ValidationResult;
  summary: DatasetSummary;
}) {
  const peopleLabel = dataset.institution.type === "credit_union" ? "Members" : "Customers";
  return (
    <div className="flex flex-wrap items-stretch border-b border-line">
      <Metric label={peopleLabel} value={summary.stats.parties.toLocaleString()} />
      <Metric label="Accounts" value={summary.stats.accounts.toLocaleString()} />
      <Metric label="Transactions" value={summary.stats.transactions.toLocaleString()} />
      <Metric label="Deposits" value={compactUSD(summary.stats.totalDepositsMinor)} />
      <Metric label="Loans o/s" value={compactUSD(summary.stats.totalLoansOutstandingMinor)} />
      <div className="ml-auto flex items-center px-3">
        <ReconChip validation={validation} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[96px] border-r border-line px-3 py-2">
      <div className="micro">{label}</div>
      <div className="font-mono tnum text-[19px] font-medium text-ink">{value}</div>
    </div>
  );
}

function ReconChip({ validation }: { validation: ValidationResult }) {
  const [open, setOpen] = React.useState(false);
  const warnCount = validation.checks.filter((c) => c.status === "warn").length;
  const tone = !validation.ok ? "red" : warnCount ? "amber" : "green";
  const label = !validation.ok
    ? "Issues found"
    : warnCount
      ? `Passed · ${warnCount} note${warnCount === 1 ? "" : "s"}`
      : `Reconciled ${validation.stats.accountsReconciled}/${validation.stats.accountsReconciled}`;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}>
        <Badge tone={tone}>
          <Check className="h-3 w-3" /> {label} <ChevronDown className="h-3 w-3" />
        </Badge>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-[22rem] rounded-md border border-line bg-surface p-3 shadow-md">
            <div className="micro mb-2">Validation &amp; reconciliation</div>
            <ul className="space-y-2">
              {validation.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <StatusGlyph status={c.status} />
                  <div>
                    <p className="text-[12px] font-medium text-ink">{c.label}</p>
                    <p className="text-[11px] text-ink-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: CheckStatus }) {
  const map = {
    pass: { tone: "bg-pass-bg text-pass", glyph: "✓" },
    fail: { tone: "bg-fail-bg text-fail", glyph: "✕" },
    warn: { tone: "bg-warn-bg text-warn", glyph: "!" },
  }[status];
  return (
    <span
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
        map.tone,
      )}
    >
      {map.glyph}
    </span>
  );
}

/* ----------------------------- export menu ----------------------------- */

function ExportMenu({ dataset }: { dataset: Dataset }) {
  const [open, setOpen] = React.useState(false);
  const files = React.useMemo(() => allExportFiles(dataset), [dataset]);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken"
      >
        <Download className="h-3.5 w-3.5 text-ink-muted" /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-line bg-surface p-1 shadow-md">
            {files.map((f) => (
              <button
                key={f.name}
                onClick={() => {
                  download(f);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-sunken"
              >
                <span className="font-mono">{f.name}</span>
                <span className="text-[10px] text-ink-faint">{formatBytes(f.content.length)}</span>
              </button>
            ))}
            <button
              onClick={() => {
                files.forEach(download);
                setOpen(false);
              }}
              className="mt-1 w-full rounded border border-accent/30 bg-accent-weak px-2 py-1.5 text-[12px] font-medium text-accent"
            >
              Download all
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ----------------------------- grids ----------------------------- */

const mono = "font-mono";

function Flags({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-ink-faint">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((t) => (
        <Badge key={t} tone="slate">
          {t}
        </Badge>
      ))}
      {tags.length > 2 && <span className="text-[10px] text-ink-faint">+{tags.length - 2}</span>}
    </span>
  );
}

function AccountsGrid({ dataset }: { dataset: Dataset }) {
  const products = [...new Set(dataset.accounts.map((a) => a.product))];
  const columns: GridColumn<Account>[] = [
    { key: "id", header: "ID", sortValue: (a) => a.id, render: (a) => <span className={mono}>{a.id}</span> },
    { key: "acct", header: "Acct No.", render: (a) => <span className={mono}>{maskAccount(a.accountNumber)}</span> },
    { key: "product", header: "Product", sortValue: (a) => a.productName, render: (a) => a.productName },
    { key: "status", header: "Status", sortValue: (a) => a.status, render: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge> },
    { key: "opened", header: "Opened", sortValue: (a) => a.openDate, render: (a) => <span className={mono}>{a.openDate}</span> },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sortValue: (a) => a.currentBalanceMinor,
      render: (a) => (
        <span className={cn(mono, "tnum", a.currentBalanceMinor < 0 ? "text-fail" : "text-ink")}>
          {formatUSD(a.currentBalanceMinor)}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      sortValue: (a) => a.interestRateBps ?? -1,
      render: (a) => <span className={cn(mono, "tnum")}>{a.interestRateBps != null ? `${(a.interestRateBps / 100).toFixed(2)}%` : "—"}</span>,
    },
    { key: "tags", header: "Flags", defaultHidden: true, render: (a) => <Flags tags={a.tags} /> },
  ];
  const tallies = edgeTallies(dataset.accounts.map((a) => ({ neg: a.currentBalanceMinor < 0, status: a.status })));
  return (
    <DataGrid
      rows={dataset.accounts}
      rowKey={(a) => a.id}
      columns={columns}
      searchText={(a) => `${a.id} ${a.productName} ${a.product} ${a.status} ${a.tags.join(" ")}`}
      tagsOf={(a) => a.tags}
      category={{ label: "Product", options: products, of: (a) => a.product }}
      toolbarRight={<ExportMenu dataset={dataset} />}
      footerExtra={<span className="font-mono tnum">{tallies}</span>}
    />
  );
}

function edgeTallies(rows: { neg: boolean; status: string }[]): string {
  const neg = rows.filter((r) => r.neg).length;
  const dormant = rows.filter((r) => r.status === "dormant").length;
  const closed = rows.filter((r) => r.status === "closed").length;
  const parts: string[] = [];
  if (neg) parts.push(`${neg} negative`);
  if (dormant) parts.push(`${dormant} dormant`);
  if (closed) parts.push(`${closed} closed`);
  return parts.join(" · ");
}

function TransactionsGrid({ dataset }: { dataset: Dataset }) {
  const columns: GridColumn<Transaction>[] = [
    { key: "id", header: "ID", sortValue: (t) => t.id, render: (t) => <span className={mono}>{t.id}</span> },
    { key: "account", header: "Account", sortValue: (t) => t.accountId, render: (t) => <span className={mono}>{t.accountId}</span> },
    { key: "posted", header: "Posted", sortValue: (t) => t.postingDate, render: (t) => <span className={mono}>{t.postingDate}</span> },
    { key: "type", header: "Type", sortValue: (t) => t.type, render: (t) => t.type },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (t) => t.amountMinor,
      render: (t) => (
        <span className={cn(mono, "tnum", t.amountMinor < 0 ? "text-fail" : "text-pass")}>
          {formatUSD(t.amountMinor)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sortValue: (t) => t.balanceAfterMinor,
      render: (t) => <span className={cn(mono, "tnum text-ink-muted")}>{formatUSD(t.balanceAfterMinor)}</span>,
    },
    { key: "desc", header: "Description", render: (t) => <span className="block max-w-[18rem] truncate">{t.description}</span> },
    { key: "tags", header: "Flags", defaultHidden: true, render: (t) => <Flags tags={t.tags} /> },
  ];
  return (
    <DataGrid
      rows={dataset.transactions}
      rowKey={(t) => t.id}
      columns={columns}
      searchText={(t) => `${t.id} ${t.accountId} ${t.type} ${t.description} ${t.tags.join(" ")}`}
      tagsOf={(t) => t.tags}
      category={{
        label: "Category",
        options: ["ach", "wire", "card", "atm", "check", "transfer", "fee", "interest", "loan", "deposit"],
        of: (t) => t.category,
      }}
      toolbarRight={<ExportMenu dataset={dataset} />}
    />
  );
}

function PartiesGrid({ dataset }: { dataset: Dataset }) {
  const columns: GridColumn<Party>[] = [
    { key: "id", header: "ID", sortValue: (p) => p.id, render: (p) => <span className={mono}>{p.id}</span> },
    { key: "type", header: "Type", sortValue: (p) => p.type, render: (p) => <Badge tone={p.type === "business" ? "blue" : "slate"}>{p.type}</Badge> },
    { key: "name", header: "Name", sortValue: (p) => partyDisplayName(p), render: (p) => partyDisplayName(p) },
    { key: "taxId", header: "Tax ID", render: (p) => <span className={mono}>{p.taxId}</span> },
    { key: "dob", header: "DOB", defaultHidden: true, sortValue: (p) => p.dateOfBirth ?? "", render: (p) => <span className={mono}>{p.dateOfBirth ?? "—"}</span> },
    { key: "loc", header: "Location", render: (p) => `${p.address.city}, ${p.address.state}` },
    { key: "since", header: "Member since", sortValue: (p) => p.memberSince, render: (p) => <span className={mono}>{p.memberSince}</span> },
  ];
  return (
    <DataGrid
      rows={dataset.parties}
      rowKey={(p) => p.id}
      columns={columns}
      searchText={(p) => `${p.id} ${partyDisplayName(p)} ${p.type} ${p.address.city} ${p.address.state} ${p.taxId}`}
      category={{ label: "Type", options: ["individual", "business"], of: (p) => p.type }}
      toolbarRight={<ExportMenu dataset={dataset} />}
    />
  );
}
