/**
 * Deterministic plain-English summary of a generated dataset.
 *
 * Pure function over the Dataset — no LLM. (The LLM *could* polish this prose,
 * but the facts come from counting the real data so the numbers are always
 * correct.) Drives the "here's what we made" panel in the UI.
 */

import type { Dataset, ProductType } from "./domain/types";
import { DEPOSIT_PRODUCTS, LOAN_PRODUCTS } from "./domain/types";
import { formatUSD } from "./domain/money";
import { monthsBetween } from "./domain/spec";

const PRODUCT_LABELS: Record<ProductType, string> = {
  checking: "Checking",
  savings: "Savings",
  money_market: "Money Market",
  cd: "CDs",
  loan_auto: "Auto Loans",
  loan_mortgage: "Mortgages",
  loan_personal: "Personal Loans",
  credit_line: "Credit Lines",
};

export interface DatasetSummary {
  headline: string;
  bullets: string[];
  stats: {
    parties: number;
    individuals: number;
    businesses: number;
    accounts: number;
    transactions: number;
    months: number;
    byProduct: { product: ProductType; label: string; count: number }[];
    totalDepositsMinor: number;
    totalLoansOutstandingMinor: number;
    edgeCounts: Record<string, number>;
  };
}

export function summarizeDataset(ds: Dataset): DatasetSummary {
  const individuals = ds.parties.filter((p) => p.type === "individual").length;
  const businesses = ds.parties.length - individuals;
  const months = Math.round(monthsBetween(ds.meta.spec.dateRange.start, ds.meta.spec.dateRange.end));

  const byProductMap = new Map<ProductType, number>();
  for (const a of ds.accounts) byProductMap.set(a.product, (byProductMap.get(a.product) ?? 0) + 1);
  const byProduct = [...byProductMap.entries()]
    .map(([product, count]) => ({ product, label: PRODUCT_LABELS[product], count }))
    .sort((a, b) => b.count - a.count);

  const isDeposit = (p: ProductType) => (DEPOSIT_PRODUCTS as ProductType[]).includes(p);
  const isLoan = (p: ProductType) => (LOAN_PRODUCTS as ProductType[]).includes(p);

  let totalDepositsMinor = 0;
  let totalLoansOutstandingMinor = 0;
  for (const a of ds.accounts) {
    if (isDeposit(a.product) && a.currentBalanceMinor > 0) totalDepositsMinor += a.currentBalanceMinor;
    if (isLoan(a.product) && a.currentBalanceMinor < 0) totalLoansOutstandingMinor += -a.currentBalanceMinor;
  }

  const edgeCounts: Record<string, number> = {
    "overdraft / NSF events": ds.transactions.filter((t) => t.tags.includes("overdraft")).length,
    "large wires": ds.transactions.filter((t) => t.tags.includes("large_wire")).length,
    "backdated postings": ds.transactions.filter((t) => t.tags.includes("backdated")).length,
    "dormant accounts": ds.accounts.filter((a) => a.status === "dormant").length,
    "closed accounts": ds.accounts.filter((a) => a.status === "closed").length,
    "accounts at product limit": ds.accounts.filter((a) => a.tags.includes("at_limit")).length,
    "new-account funding": ds.accounts.filter((a) => a.tags.includes("new_funding")).length,
    "joint accounts": ds.accounts.filter((a) => a.owners.length > 1).length,
  };

  const instLabel = ds.institution.type === "credit_union" ? "credit union" : "community bank";
  const peopleWord = ds.institution.type === "credit_union" ? "members" : "customers";

  const headline =
    `${ds.institution.name} — a synthetic ${instLabel} with ` +
    `${ds.parties.length.toLocaleString()} ${peopleWord}, ` +
    `${ds.accounts.length.toLocaleString()} accounts, and ` +
    `${ds.transactions.length.toLocaleString()} transactions over ` +
    `${months} month${months === 1 ? "" : "s"} ` +
    `(${ds.meta.spec.dateRange.start} → ${ds.meta.spec.dateRange.end}).`;

  const bullets: string[] = [];
  bullets.push(
    `${individuals.toLocaleString()} individuals and ${businesses.toLocaleString()} businesses.`,
  );
  bullets.push(
    "Accounts by product: " +
      byProduct.map((p) => `${p.count} ${p.label}`).join(", ") + ".",
  );
  bullets.push(
    `Total deposits on the books: ${formatUSD(totalDepositsMinor)}; ` +
      `total loan/credit balances outstanding: ${formatUSD(totalLoansOutstandingMinor)}.`,
  );

  const presentEdges = Object.entries(edgeCounts).filter(([, n]) => n > 0);
  if (presentEdges.length) {
    bullets.push(
      "Edge cases included: " +
        presentEdges.map(([label, n]) => `${n} ${label}`).join(", ") + ".",
    );
  } else {
    bullets.push("No special edge cases were requested.");
  }

  return {
    headline,
    bullets,
    stats: {
      parties: ds.parties.length,
      individuals,
      businesses,
      accounts: ds.accounts.length,
      transactions: ds.transactions.length,
      months,
      byProduct,
      totalDepositsMinor,
      totalLoansOutstandingMinor,
      edgeCounts,
    },
  };
}
