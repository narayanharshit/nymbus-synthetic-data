/**
 * Exporters: the formats a tester actually uses.
 *
 *  - JSON: the canonical, exact export. Money stays in integer minor units
 *    (cents) so the data round-trips losslessly and balances reconcile exactly.
 *  - CSV: one file per table (parties / accounts / transactions), money rendered
 *    as decimal dollars, ready to open in Excel or load into a test harness.
 */

import type { Account, Dataset, Transaction } from "../domain/types";
import { partyDisplayName } from "../generate/parties";
import { validateDataset, type CheckStatus, type ValidationResult } from "../validate/validate";

export interface ExportFile {
  name: string;
  mime: string;
  content: string;
}

function dollars(minor: number): string {
  return (minor / 100).toFixed(2);
}

function pct(bps?: number): string {
  return bps == null ? "" : (bps / 100).toFixed(2);
}

/** Serialize an array of flat records to CSV with a fixed column order. */
function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const lines = rows.map((r) => columns.map((c) => esc(r[c])).join(","));
  return [header, ...lines].join("\n");
}

export function partiesCsv(ds: Dataset): string {
  const cols = [
    "id", "type", "name", "dateOfBirth", "taxId", "taxIdType",
    "email", "phone", "addressLine1", "city", "state", "zip", "memberSince",
  ];
  const rows = ds.parties.map((p) => ({
    id: p.id,
    type: p.type,
    name: partyDisplayName(p),
    dateOfBirth: p.dateOfBirth ?? "",
    taxId: p.taxId,
    taxIdType: p.taxIdType,
    email: p.email,
    phone: p.phone,
    addressLine1: p.address.line1,
    city: p.address.city,
    state: p.address.state,
    zip: p.address.zip,
    memberSince: p.memberSince,
  }));
  return toCsv(cols, rows);
}

export function accountsCsv(ds: Dataset): string {
  const cols = [
    "id", "accountNumber", "product", "productName", "status",
    "primaryPartyId", "jointPartyIds", "openDate", "closeDate", "currency",
    "openingBalance", "currentBalance", "availableBalance",
    "interestRatePct", "termMonths", "minimumBalance", "creditLimit",
    "originalPrincipal", "maturityDate", "branch", "tags",
  ];
  const rows = ds.accounts.map((a) => ({
    id: a.id,
    accountNumber: a.accountNumber,
    product: a.product,
    productName: a.productName,
    status: a.status,
    primaryPartyId: a.owners.find((o) => o.role === "primary")?.partyId ?? "",
    jointPartyIds: a.owners.filter((o) => o.role === "joint").map((o) => o.partyId).join(";"),
    openDate: a.openDate,
    closeDate: a.closeDate ?? "",
    currency: a.currency,
    openingBalance: dollars(a.openingBalanceMinor),
    currentBalance: dollars(a.currentBalanceMinor),
    availableBalance: dollars(a.availableBalanceMinor),
    interestRatePct: pct(a.interestRateBps),
    termMonths: a.termMonths ?? "",
    minimumBalance: a.minimumBalanceMinor != null ? dollars(a.minimumBalanceMinor) : "",
    creditLimit: a.creditLimitMinor != null ? dollars(a.creditLimitMinor) : "",
    originalPrincipal: a.originalPrincipalMinor != null ? dollars(a.originalPrincipalMinor) : "",
    maturityDate: a.maturityDate ?? "",
    branch: a.branch ?? "",
    tags: a.tags.join(";"),
  }));
  return toCsv(cols, rows);
}

export function transactionsCsv(ds: Dataset): string {
  const cols = [
    "id", "accountId", "partyId", "type", "category", "amount", "balanceAfter",
    "effectiveDate", "postingDate", "description", "merchant", "mcc",
    "counterpartyName", "counterpartyAccount", "channel", "reference", "status", "tags",
  ];
  const rows = ds.transactions.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    partyId: t.partyId,
    type: t.type,
    category: t.category,
    amount: dollars(t.amountMinor),
    balanceAfter: dollars(t.balanceAfterMinor),
    effectiveDate: t.effectiveDate,
    postingDate: t.postingDate,
    description: t.description,
    merchant: t.merchant ?? "",
    mcc: t.mcc ?? "",
    counterpartyName: t.counterpartyName ?? "",
    counterpartyAccount: t.counterpartyAccount ?? "",
    channel: t.channel ?? "",
    reference: t.reference,
    status: t.status,
    tags: t.tags.join(";"),
  }));
  return toCsv(cols, rows);
}

export function datasetJson(ds: Dataset): string {
  return JSON.stringify(ds, null, 2);
}

/** Human-readable data dictionary describing every exported column + enum. */
export function dataDictionary(ds: Dataset): string {
  return `# Data dictionary — ${ds.institution.name}

Run ${ds.meta.runId} · seed ${ds.meta.seed} · generated ${ds.meta.generatedAt}
Routing number (synthetic, ABA-checksum-valid): ${ds.institution.routingNumber}

All data is SYNTHETIC and deliberately invalid — never real PII. In the CSV files
monetary values are decimal dollars; in dataset.json they are integer minor units
(cents), which is the exact, reconciling representation.

## parties.csv
| column | description |
|---|---|
| id | Party id (PTY-000001). Primary key. |
| type | individual \\| business |
| name | Display name (synthetic) |
| dateOfBirth | ISO date (individuals only) |
| taxId | Synthetic SSN (666 area) or EIN (00 prefix) — guaranteed invalid |
| taxIdType | ssn \\| ein |
| email, phone | Synthetic (example.com domain; 555-01xx range) |
| addressLine1, city, state, zip | Synthetic US address |
| memberSince | Relationship start (ISO date) |

## accounts.csv
| column | description |
|---|---|
| id | Account id (ACC-000001). Primary key. |
| accountNumber | 10-digit synthetic number |
| product | checking \\| savings \\| money_market \\| cd \\| loan_auto \\| loan_mortgage \\| loan_personal \\| credit_line |
| productName | Marketing name; interest rate is a property of the named product |
| status | active \\| dormant \\| closed \\| frozen |
| primaryPartyId, jointPartyIds | Foreign keys to parties.id (jointPartyIds is ;-separated) |
| openDate, closeDate | ISO dates |
| openingBalance, currentBalance, availableBalance | Dollars. currentBalance = openingBalance + sum(transaction amounts). Loans/credit lines carry a negative balance (amount owed). |
| interestRatePct, termMonths, minimumBalance, creditLimit, originalPrincipal, maturityDate | Product attributes (blank where not applicable) |
| branch | Originating branch |
| tags | Edge-case markers: new_funding, dormant, closed_residual, at_limit, joint |

## transactions.csv
| column | description |
|---|---|
| id | Transaction id (TXN-00000001) |
| accountId | Foreign key to accounts.id |
| partyId | Foreign key to parties.id |
| type | ach_credit \\| ach_debit \\| wire_in \\| wire_out \\| card_pos \\| atm_withdrawal \\| atm_deposit \\| check_deposit \\| check_paid \\| transfer_in \\| transfer_out \\| fee \\| interest_credit \\| interest_charge \\| loan_disbursement \\| loan_payment \\| deposit \\| withdrawal |
| category | ach \\| wire \\| card \\| atm \\| check \\| transfer \\| fee \\| interest \\| loan \\| deposit |
| amount | Signed dollars (credit positive, debit negative) |
| balanceAfter | Running account balance after this transaction |
| effectiveDate, postingDate | ISO dates; postingDate >= effectiveDate (backdated/holiday edge cases widen the gap) |
| description, merchant, mcc, counterpartyName, counterpartyAccount, channel, reference | Detail fields (blank where not applicable) |
| status | posted \\| pending \\| returned |
| tags | Edge-case markers: overdraft, nsf, nsf_fee, large_wire, backdated, holiday_posting, residual_after_close, credit_draw |

## Integrity guarantees (validated before export)
- Every account: ending balance equals opening balance plus the sum of its transactions.
- Every foreign key (transaction→account, transaction→party, account→owner) resolves.
- Dates are coherent and within the requested window.
- Every requested edge case is present (counts shown in the app's validation panel).
`;
}

const STATUS_ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✗" };

/** Human-readable money for the markdown report (CSVs stay comma-free via dollars()). */
function money(minor: number): string {
  const s = (Math.abs(minor) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${minor < 0 ? "-" : ""}$${s}`;
}

function mdTable(headers: string[], rows: string[][]): string {
  const cell = (v: string) => v.replace(/\|/g, "/").replace(/\n/g, " ");
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

/**
 * Human-readable validation report: the same deterministic checks the app runs
 * before showing any data, plus a sample of the actual rows behind each edge-case
 * claim so a reviewer can falsify them by hand against the CSVs.
 */
export function validationReport(ds: Dataset, validation: ValidationResult): string {
  const m = ds.meta;
  const date = m.generatedAt.slice(0, 10);
  const out: string[] = [];

  out.push(`# Validation report — ${m.runId}`, "");
  out.push(`Generated ${date} · seed ${m.seed} · overall ${validation.ok ? "PASS" : "FAIL"}`, "");
  out.push(
    "Produced by the same validator the app runs before showing any data. Generation is",
    "deterministic: the same request and seed reproduce this dataset and this report.",
    "",
  );

  out.push("## Integrity checks", "");
  out.push(`- Accounts reconciled: ${validation.stats.accountsReconciled} / ${ds.accounts.length}`);
  out.push(`- Foreign keys checked: ${validation.stats.foreignKeysChecked.toLocaleString()}`);
  out.push(`- Transactions checked: ${validation.stats.transactionsChecked.toLocaleString()}`, "");
  for (const c of validation.checks) {
    const count = c.count != null ? ` (${c.count})` : "";
    out.push(`### ${STATUS_ICON[c.status]} ${c.label}${count}`, c.detail, "");
  }

  out.push("## Sampled proof rows", "");
  out.push("A sample of the actual rows behind the edge-case claims above.", "");

  const txnSample = (title: string, pred: (t: Transaction) => boolean, n = 5) => {
    const hits = ds.transactions.filter(pred);
    if (!hits.length) return;
    out.push(`### ${title} — ${hits.length} total, showing ${Math.min(n, hits.length)}`, "");
    out.push(
      mdTable(
        ["id", "posted", "type", "amount", "description"],
        hits.slice(0, n).map((t) => [t.id, t.postingDate, t.type, money(t.amountMinor), t.description ?? ""]),
      ),
      "",
    );
  };
  const acctSample = (title: string, pred: (a: Account) => boolean, n = 5) => {
    const hits = ds.accounts.filter(pred);
    if (!hits.length) return;
    out.push(`### ${title} — ${hits.length} total, showing ${Math.min(n, hits.length)}`, "");
    out.push(
      mdTable(
        ["id", "status", "product", "balance"],
        hits.slice(0, n).map((a) => [a.id, a.status, a.productName, money(a.currentBalanceMinor)]),
      ),
      "",
    );
  };

  txnSample("Large wires above threshold", (t) => t.tags.includes("large_wire"));
  txnSample("NSF / overdraft events", (t) => t.tags.includes("nsf") || t.tags.includes("overdraft"));
  txnSample("Backdated postings", (t) => t.tags.includes("backdated"));
  acctSample("New-account funding", (a) => a.tags.includes("new_funding"));
  acctSample("Dormant accounts", (a) => a.status === "dormant");
  acctSample("Accounts at product limit", (a) => a.tags.includes("at_limit"));
  acctSample("Closed accounts with residual activity", (a) => a.tags.includes("residual_after_close"));

  return out.join("\n");
}

/** Plain-text manifest so a colleague who receives the bundle knows what's inside. */
export function readmeText(ds: Dataset): string {
  const m = ds.meta;
  return [
    "Synthetic Banking Data Studio — export bundle",
    `Run ${m.runId} · generated ${m.generatedAt.slice(0, 10)} · seed ${m.seed}`,
    "",
    "Files:",
    "  parties.csv / accounts.csv / transactions.csv  — the dataset as tables (money in decimal dollars)",
    "  dataset.json         — canonical export (money in integer cents; balances reconcile exactly)",
    "  DATA_DICTIONARY.md   — every column, its meaning, and enum values",
    "  VALIDATION_REPORT.md — each integrity & edge-case check, counts, and sampled proof rows",
    "",
    "Reproducibility: the same request + seed regenerate this exact dataset.",
    "",
    "All names, IDs, Social Security numbers, and EINs are SYNTHETIC and deliberately",
    "invalid (SSN area 666, EIN prefix 00) — never real PII.",
    "",
  ].join("\n");
}

/** All export files for a dataset: a readme, tables, canonical JSON, data
 *  dictionary, and a validation report. Validation is recomputed if not supplied. */
export function allExportFiles(ds: Dataset, validation: ValidationResult = validateDataset(ds)): ExportFile[] {
  return [
    { name: "README.txt", mime: "text/plain", content: readmeText(ds) },
    { name: "parties.csv", mime: "text/csv", content: partiesCsv(ds) },
    { name: "accounts.csv", mime: "text/csv", content: accountsCsv(ds) },
    { name: "transactions.csv", mime: "text/csv", content: transactionsCsv(ds) },
    { name: "dataset.json", mime: "application/json", content: datasetJson(ds) },
    { name: "DATA_DICTIONARY.md", mime: "text/markdown", content: dataDictionary(ds) },
    { name: "VALIDATION_REPORT.md", mime: "text/markdown", content: validationReport(ds, validation) },
  ];
}
