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

/** All export files for a dataset. */
export function allExportFiles(ds: Dataset): ExportFile[] {
  return [
    { name: "parties.csv", mime: "text/csv", content: partiesCsv(ds) },
    { name: "accounts.csv", mime: "text/csv", content: accountsCsv(ds) },
    { name: "transactions.csv", mime: "text/csv", content: transactionsCsv(ds) },
    { name: "dataset.json", mime: "application/json", content: datasetJson(ds) },
  ];
}
