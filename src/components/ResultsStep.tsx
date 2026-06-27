"use client";

import * as React from "react";
import type { Dataset } from "@/lib/domain/types";
import type { ValidationResult, CheckStatus } from "@/lib/validate/validate";
import type { DatasetSummary } from "@/lib/summary";
import { formatUSD } from "@/lib/domain/money";
import { maskAccount } from "@/lib/generate/identity";
import { partyDisplayName } from "@/lib/generate/parties";
import { allExportFiles, type ExportFile } from "@/lib/export/exporters";
import { Badge, Button, Card, Select, TextInput, cn } from "./ui";

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
  const warnCount = validation.checks.filter((c) => c.status === "warn").length;
  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Validation &amp; reconciliation</h3>
        {!validation.ok ? (
          <Badge tone="red">✕ Issues found</Badge>
        ) : warnCount > 0 ? (
          <Badge tone="amber">✓ Passed · {warnCount} note{warnCount === 1 ? "" : "s"}</Badge>
        ) : (
          <Badge tone="green">✓ All checks passed</Badge>
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

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Provide to make the column sortable (click its header). */
  sortValue?: (row: T) => number | string;
  align?: "right";
}

/** Sortable, filterable preview table with an optional category filter and a
 *  "flagged only" toggle so requested edge cases are easy to surface. */
function DataTable<T>({
  rows,
  rowKey,
  columns,
  searchText,
  tagsOf,
  category,
}: {
  rows: T[];
  rowKey: (r: T) => string;
  columns: Column<T>[];
  searchText: (r: T) => string;
  tagsOf?: (r: T) => string[];
  category?: { label: string; options: string[]; of: (r: T) => string };
}) {
  const [q, setQ] = React.useState("");
  const [flaggedOnly, setFlaggedOnly] = React.useState(false);
  const [cat, setCat] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const filtered = React.useMemo(() => {
    let r = rows;
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter((x) => searchText(x).toLowerCase().includes(needle));
    if (flaggedOnly && tagsOf) r = r.filter((x) => tagsOf(x).length > 0);
    if (category && cat !== "all") r = r.filter((x) => category.of(x) === cat);
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const sv = col.sortValue;
        r = [...r].sort((a, b) => {
          const av = sv(a);
          const bv = sv(b);
          const cmp =
            typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return r;
  }, [rows, q, flaggedOnly, cat, sortKey, sortDir, columns, searchText, tagsOf, category]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          className="max-w-[11rem]"
        />
        {category && (
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-[11rem]">
            <option value="all">{category.label}: all</option>
            {category.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        )}
        {tagsOf && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="accent-indigo-600"
            />
            Flagged only
          </label>
        )}
        <span className="ml-auto text-xs text-slate-500">
          Showing {Math.min(filtered.length, PREVIEW_ROWS).toLocaleString()} of{" "}
          {filtered.length.toLocaleString()}
          {filtered.length !== rows.length ? ` (of ${rows.length.toLocaleString()})` : ""}
        </span>
      </div>
      <div className="thin-scroll max-h-[28rem] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortValue && toggleSort(c.key)}
                  className={cn(
                    th,
                    c.align === "right" && "text-right",
                    c.sortValue && "cursor-pointer select-none hover:text-slate-900",
                  )}
                >
                  {c.header}
                  {c.sortValue && sortKey === c.key && (
                    <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, PREVIEW_ROWS).map((row) => (
              <tr key={rowKey(row)} className="border-t border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={cn(td, c.align === "right" && "text-right")}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  return (
    <DataTable
      rows={dataset.parties}
      rowKey={(p) => p.id}
      searchText={(p) => `${p.id} ${partyDisplayName(p)} ${p.type} ${p.address.city} ${p.address.state} ${p.taxId}`}
      category={{ label: "Type", options: ["individual", "business"], of: (p) => p.type }}
      columns={[
        { key: "id", header: "ID", sortValue: (p) => p.id, render: (p) => <span className="font-mono text-xs">{p.id}</span> },
        { key: "type", header: "Type", sortValue: (p) => p.type, render: (p) => <Badge tone={p.type === "business" ? "blue" : "slate"}>{p.type}</Badge> },
        { key: "name", header: "Name", sortValue: (p) => partyDisplayName(p), render: (p) => partyDisplayName(p) },
        { key: "taxId", header: "Tax ID", render: (p) => <span className="font-mono text-xs">{p.taxId}</span> },
        { key: "dob", header: "DOB", sortValue: (p) => p.dateOfBirth ?? "", render: (p) => p.dateOfBirth ?? "—" },
        { key: "loc", header: "Location", render: (p) => `${p.address.city}, ${p.address.state}` },
        { key: "since", header: "Member since", sortValue: (p) => p.memberSince, render: (p) => p.memberSince },
      ]}
    />
  );
}

function AccountsTable({ dataset }: { dataset: Dataset }) {
  const products = [...new Set(dataset.accounts.map((a) => a.product))];
  return (
    <DataTable
      rows={dataset.accounts}
      rowKey={(a) => a.id}
      searchText={(a) => `${a.id} ${a.productName} ${a.product} ${a.status} ${a.tags.join(" ")}`}
      tagsOf={(a) => a.tags}
      category={{ label: "Product", options: products, of: (a) => a.product }}
      columns={[
        { key: "id", header: "ID", sortValue: (a) => a.id, render: (a) => <span className="font-mono text-xs">{a.id}</span> },
        { key: "number", header: "Number", render: (a) => <span className="font-mono text-xs">{maskAccount(a.accountNumber)}</span> },
        { key: "product", header: "Product", sortValue: (a) => a.productName, render: (a) => a.productName },
        { key: "status", header: "Status", sortValue: (a) => a.status, render: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge> },
        { key: "opened", header: "Opened", sortValue: (a) => a.openDate, render: (a) => a.openDate },
        {
          key: "balance",
          header: "Balance",
          align: "right",
          sortValue: (a) => a.currentBalanceMinor,
          render: (a) => (
            <span className={cn("tabular-nums", a.currentBalanceMinor < 0 ? "text-red-600" : "text-slate-800")}>
              {formatUSD(a.currentBalanceMinor)}
            </span>
          ),
        },
        {
          key: "rate",
          header: "Rate",
          align: "right",
          sortValue: (a) => a.interestRateBps ?? -1,
          render: (a) => (a.interestRateBps != null ? `${(a.interestRateBps / 100).toFixed(2)}%` : "—"),
        },
        { key: "tags", header: "Tags", render: (a) => <TagBadges tags={a.tags} /> },
      ]}
    />
  );
}

function TransactionsTable({ dataset }: { dataset: Dataset }) {
  return (
    <DataTable
      rows={dataset.transactions}
      rowKey={(t) => t.id}
      searchText={(t) => `${t.id} ${t.accountId} ${t.type} ${t.description} ${t.tags.join(" ")}`}
      tagsOf={(t) => t.tags}
      category={{
        label: "Category",
        options: ["ach", "wire", "card", "atm", "check", "transfer", "fee", "interest", "loan", "deposit"],
        of: (t) => t.category,
      }}
      columns={[
        { key: "id", header: "ID", sortValue: (t) => t.id, render: (t) => <span className="font-mono text-xs">{t.id}</span> },
        { key: "account", header: "Account", sortValue: (t) => t.accountId, render: (t) => <span className="font-mono text-xs">{t.accountId}</span> },
        { key: "posted", header: "Posted", sortValue: (t) => t.postingDate, render: (t) => t.postingDate },
        { key: "type", header: "Type", sortValue: (t) => t.type, render: (t) => t.type },
        {
          key: "amount",
          header: "Amount",
          align: "right",
          sortValue: (t) => t.amountMinor,
          render: (t) => (
            <span className={cn("tabular-nums", t.amountMinor < 0 ? "text-red-600" : "text-emerald-700")}>
              {formatUSD(t.amountMinor)}
            </span>
          ),
        },
        {
          key: "balance",
          header: "Balance",
          align: "right",
          sortValue: (t) => t.balanceAfterMinor,
          render: (t) => <span className="tabular-nums text-slate-500">{formatUSD(t.balanceAfterMinor)}</span>,
        },
        { key: "desc", header: "Description", render: (t) => <span className="block max-w-xs truncate">{t.description}</span> },
        { key: "tags", header: "Tags", render: (t) => <TagBadges tags={t.tags} /> },
      ]}
    />
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
