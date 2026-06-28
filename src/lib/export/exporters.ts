/**
 * Exporters: the formats a tester actually uses.
 *
 *  - JSON: the canonical, exact export. Money stays in integer minor units
 *    (cents) so the data round-trips losslessly and balances reconcile exactly.
 *  - CSV: one file per table (parties / accounts / transactions), money rendered
 *    as decimal dollars, ready to open in Excel or load into a test harness.
 */

import type { Dataset } from "../domain/types";
import { partyDisplayName } from "../generate/parties";

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

/** All export files for a dataset, including the data dictionary. */
export function allExportFiles(ds: Dataset): ExportFile[] {
  return [
    { name: "parties.csv", mime: "text/csv", content: partiesCsv(ds) },
    { name: "accounts.csv", mime: "text/csv", content: accountsCsv(ds) },
    { name: "transactions.csv", mime: "text/csv", content: transactionsCsv(ds) },
    { name: "dataset.json", mime: "application/json", content: datasetJson(ds) },
    { name: "DATA_DICTIONARY.md", mime: "text/markdown", content: dataDictionary(ds) },
  ];
}
