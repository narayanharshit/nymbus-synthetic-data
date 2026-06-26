"use client";

import * as React from "react";
import type { Dataset } from "@/lib/domain/types";
import type { ValidationResult, CheckStatus } from "@/lib/validate/validate";
import type { DatasetSummary } from "@/lib/summary";
import { formatUSD } from "@/lib/domain/money";
import { maskAccount } from "@/lib/generate/identity";
import { partyDisplayName } from "@/lib/generate/parties";
import { allExportFiles, type ExportFile } from "@/lib/export/exporters";
import { Badge, Button, Card, TextInput, cn } from "./ui";

type Tab = "parties" | "accounts" | "transactions";
const PREVIEW_ROWS = 50;

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

export function ResultsStep({
  dataset,
  validation,
  summary,
  onAdjust,
  onRegenerate,
  onRestart,
}: {
  dataset: Dataset;
  validation: ValidationResult;
  summary: DatasetSummary;
  onAdjust: () => void;
  onRegenerate: () => void;
  onRestart: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("transactions");
  const files = React.useMemo(() => allExportFiles(dataset), [dataset]);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary + actions */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-base font-semibold text-slate-900">{summary.headline}</h2>
            <ul className="mt-3 space-y-1.5">
              {summary.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden className="text-indigo-500">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" onClick={onAdjust}>
              Adjust spec
            </Button>
            <Button variant="secondary" size="sm" onClick={onRegenerate}>
              Regenerate (new seed)
            </Button>
            <Button variant="ghost" size="sm" onClick={onRestart}>
              Start over
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <ValidationPanel validation={validation} />
        <ExportPanel files={files} />
      </div>

      {/* Browse the data */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <TabButton active={tab === "parties"} onClick={() => setTab("parties")}>
            Parties <Count n={dataset.parties.length} />
          </TabButton>
          <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")}>
            Accounts <Count n={dataset.accounts.length} />
          </TabButton>
          <TabButton active={tab === "transactions"} onClick={() => setTab("transactions")}>
            Transactions <Count n={dataset.transactions.length} />
          </TabButton>
        </div>
        {tab === "parties" && <PartiesTable dataset={dataset} />}
        {tab === "accounts" && <AccountsTable dataset={dataset} />}
        {tab === "transactions" && <TransactionsTable dataset={dataset} />}
      </Card>
    </div>
  );
}

function ValidationPanel({ validation }: { validation: ValidationResult }) {
  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Validation &amp; reconciliation</h3>
        {validation.ok ? (
          <Badge tone="green">✓ All checks passed</Badge>
        ) : (
          <Badge tone="red">✕ Issues found</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {validation.stats.accountsReconciled.toLocaleString()} accounts reconciled ·{" "}
        {validation.stats.foreignKeysChecked.toLocaleString()} references checked ·{" "}
        {validation.stats.transactionsChecked.toLocaleString()} transactions
      </p>
      <ul className="mt-3 space-y-2">
        {validation.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3">
            <StatusIcon status={c.status} />
            <div>
              <p className="text-sm font-medium text-slate-800">{c.label}</p>
              <p className="text-xs text-slate-500">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatusIcon({ status }: { status: CheckStatus }) {
  const map = {
    pass: { tone: "bg-green-100 text-green-700", glyph: "✓" },
    fail: { tone: "bg-red-100 text-red-700", glyph: "✕" },
    warn: { tone: "bg-amber-100 text-amber-700", glyph: "!" },
  }[status];
  return (
    <span
      className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        map.tone,
      )}
    >
      {map.glyph}
    </span>
  );
}

function ExportPanel({ files }: { files: ExportFile[] }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900">Export</h3>
      <p className="mt-1 text-xs text-slate-500">
        CSV per table (dollars, Excel-ready) or one exact JSON (integer cents).
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {files.map((f) => (
          <Button key={f.name} variant="secondary" size="sm" onClick={() => download(f)} className="justify-between">
            <span className="font-mono text-xs">{f.name}</span>
            <span className="text-xs text-slate-400">{formatBytes(f.content.length)}</span>
          </Button>
        ))}
        <Button size="sm" onClick={() => files.forEach(download)}>
          Download all
        </Button>
      </div>
    </Card>
  );
}

/* ----------------------------- tables ----------------------------- */

function useFilter<T>(rows: T[], toText: (r: T) => string) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => toText(r).toLowerCase().includes(needle));
  }, [rows, q, toText]);
  return { q, setQ, filtered };
}

function TableShell({
  q,
  setQ,
  total,
  shown,
  children,
}: {
  q: string;
  setQ: (s: string) => void;
  total: number;
  shown: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          className="max-w-xs"
        />
        <span className="text-xs text-slate-500">
          Showing {Math.min(shown, PREVIEW_ROWS).toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>
      <div className="thin-scroll max-h-[28rem] overflow-auto">{children}</div>
    </div>
  );
}

const th = "sticky top-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap";
const td = "px-3 py-2 text-sm text-slate-700 whitespace-nowrap";

function TagBadges({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((t) => (
        <Badge key={t} tone="slate">
          {t}
        </Badge>
      ))}
      {tags.length > 3 && <span className="text-xs text-slate-400">+{tags.length - 3}</span>}
    </span>
  );
}

function PartiesTable({ dataset }: { dataset: Dataset }) {
  const { q, setQ, filtered } = useFilter(
    dataset.parties,
    (p) => `${p.id} ${partyDisplayName(p)} ${p.type} ${p.address.city} ${p.address.state}`,
  );
  return (
    <TableShell q={q} setQ={setQ} total={dataset.parties.length} shown={filtered.length}>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={th}>ID</th>
            <th className={th}>Type</th>
            <th className={th}>Name</th>
            <th className={th}>Tax ID</th>
            <th className={th}>DOB</th>
            <th className={th}>Location</th>
            <th className={th}>Member since</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, PREVIEW_ROWS).map((p) => (
            <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className={cn(td, "font-mono text-xs")}>{p.id}</td>
              <td className={td}>
                <Badge tone={p.type === "business" ? "blue" : "slate"}>{p.type}</Badge>
              </td>
              <td className={td}>{partyDisplayName(p)}</td>
              <td className={cn(td, "font-mono text-xs")}>{p.taxId}</td>
              <td className={td}>{p.dateOfBirth ?? "—"}</td>
              <td className={td}>
                {p.address.city}, {p.address.state}
              </td>
              <td className={td}>{p.memberSince}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function AccountsTable({ dataset }: { dataset: Dataset }) {
  const { q, setQ, filtered } = useFilter(
    dataset.accounts,
    (a) => `${a.id} ${a.productName} ${a.product} ${a.status} ${a.tags.join(" ")}`,
  );
  return (
    <TableShell q={q} setQ={setQ} total={dataset.accounts.length} shown={filtered.length}>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={th}>ID</th>
            <th className={th}>Number</th>
            <th className={th}>Product</th>
            <th className={th}>Status</th>
            <th className={th}>Opened</th>
            <th className={cn(th, "text-right")}>Balance</th>
            <th className={th}>Rate</th>
            <th className={th}>Tags</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, PREVIEW_ROWS).map((a) => (
            <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className={cn(td, "font-mono text-xs")}>{a.id}</td>
              <td className={cn(td, "font-mono text-xs")}>{maskAccount(a.accountNumber)}</td>
              <td className={td}>{a.productName}</td>
              <td className={td}>
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
              </td>
              <td className={td}>{a.openDate}</td>
              <td className={cn(td, "text-right tabular-nums", a.currentBalanceMinor < 0 ? "text-red-600" : "text-slate-800")}>
                {formatUSD(a.currentBalanceMinor)}
              </td>
              <td className={td}>{a.interestRateBps != null ? `${(a.interestRateBps / 100).toFixed(2)}%` : "—"}</td>
              <td className={td}>
                <TagBadges tags={a.tags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function TransactionsTable({ dataset }: { dataset: Dataset }) {
  const { q, setQ, filtered } = useFilter(
    dataset.transactions,
    (t) => `${t.id} ${t.accountId} ${t.type} ${t.description} ${t.tags.join(" ")}`,
  );
  return (
    <TableShell q={q} setQ={setQ} total={dataset.transactions.length} shown={filtered.length}>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={th}>ID</th>
            <th className={th}>Account</th>
            <th className={th}>Posted</th>
            <th className={th}>Type</th>
            <th className={cn(th, "text-right")}>Amount</th>
            <th className={cn(th, "text-right")}>Balance</th>
            <th className={th}>Description</th>
            <th className={th}>Tags</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, PREVIEW_ROWS).map((t) => (
            <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className={cn(td, "font-mono text-xs")}>{t.id}</td>
              <td className={cn(td, "font-mono text-xs")}>{t.accountId}</td>
              <td className={td}>{t.postingDate}</td>
              <td className={td}>{t.type}</td>
              <td className={cn(td, "text-right tabular-nums", t.amountMinor < 0 ? "text-red-600" : "text-emerald-700")}>
                {formatUSD(t.amountMinor)}
              </td>
              <td className={cn(td, "text-right tabular-nums text-slate-500")}>{formatUSD(t.balanceAfterMinor)}</td>
              <td className={cn(td, "max-w-xs truncate")}>{t.description}</td>
              <td className={td}>
                <TagBadges tags={t.tags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function statusTone(status: string): React.ComponentProps<typeof Badge>["tone"] {
  switch (status) {
    case "active":
      return "green";
    case "dormant":
      return "amber";
    case "closed":
      return "red";
    default:
      return "slate";
  }
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-xs opacity-70">({n.toLocaleString()})</span>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
