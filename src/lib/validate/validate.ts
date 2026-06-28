/**
 * Internal validation / reconciliation.
 *
 * This is the safety net that makes the dataset *trustworthy*. It re-derives
 * every account balance from its transactions, checks every foreign key, checks
 * date coherence, and confirms that each edge case the consultant asked for is
 * actually present. The UI shows these results; the smoke test asserts on them.
 *
 * Crucially, validation runs against the deterministic output — there is no LLM
 * in this path, so "the data is valid" is a guarantee, not a hope.
 */

import type { Dataset } from "../domain/types";
import type { EdgeCases } from "../domain/spec";

export type CheckStatus = "pass" | "fail" | "warn";

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Optional count of affected items (e.g. failing accounts). */
  count?: number;
}

export interface ValidationResult {
  ok: boolean; // true if no failing checks
  checks: ValidationCheck[];
  stats: {
    accountsReconciled: number;
    foreignKeysChecked: number;
    transactionsChecked: number;
  };
}

const EDGE_LABELS: Record<keyof EdgeCases, string> = {
  nsfOverdraft: "NSF / overdraft events",
  dormantAccounts: "Dormant accounts",
  atLimitAccounts: "Accounts at product limit",
  backdatedPostings: "Backdated / holiday postings",
  largeWires: "Large wires above threshold",
  newAccountFunding: "New-account funding",
  closedWithResidual: "Closed accounts with residual activity",
  jointOwnership: "Joint ownership",
};

export function validateDataset(ds: Dataset): ValidationResult {
  const checks: ValidationCheck[] = [];
  const accountById = new Map(ds.accounts.map((a) => [a.id, a]));
  const partyById = new Map(ds.parties.map((p) => [p.id, p]));

  // Pre-group transactions by account in array (generation) order.
  const txnsByAccount = new Map<string, typeof ds.transactions>();
  for (const t of ds.transactions) {
    const arr = txnsByAccount.get(t.accountId) ?? [];
    arr.push(t);
    txnsByAccount.set(t.accountId, arr);
  }

  // 1) Balance reconciliation -------------------------------------------------
  let reconciledAccounts = 0;
  const reconBreaks: string[] = [];
  for (const acct of ds.accounts) {
    const txns = txnsByAccount.get(acct.id) ?? [];
    let running = acct.openingBalanceMinor;
    let chainOk = true;
    for (const t of txns) {
      running += t.amountMinor;
      if (t.balanceAfterMinor !== running) {
        chainOk = false;
        break;
      }
    }
    if (chainOk && running === acct.currentBalanceMinor) {
      reconciledAccounts++;
    } else {
      reconBreaks.push(acct.id);
    }
  }
  checks.push({
    id: "reconciliation",
    label: "Balances reconcile to transactions",
    status: reconBreaks.length === 0 ? "pass" : "fail",
    count: reconBreaks.length,
    detail:
      reconBreaks.length === 0
        ? `All ${ds.accounts.length} accounts: ending balance = opening + Σ transactions, and every running balance matches.`
        : `${reconBreaks.length} account(s) failed reconciliation: ${reconBreaks.slice(0, 5).join(", ")}${reconBreaks.length > 5 ? "…" : ""}`,
  });

  // 2) Foreign-key integrity --------------------------------------------------
  let fkChecked = 0;
  const fkBreaks: string[] = [];
  for (const t of ds.transactions) {
    fkChecked += 2;
    if (!accountById.has(t.accountId)) fkBreaks.push(`${t.id}→account ${t.accountId}`);
    if (!partyById.has(t.partyId)) fkBreaks.push(`${t.id}→party ${t.partyId}`);
  }
  for (const a of ds.accounts) {
    for (const o of a.owners) {
      fkChecked++;
      if (!partyById.has(o.partyId)) fkBreaks.push(`${a.id}→owner ${o.partyId}`);
    }
    if (!a.owners.some((o) => o.role === "primary")) {
      fkBreaks.push(`${a.id} has no primary owner`);
    }
  }
  checks.push({
    id: "foreign_keys",
    label: "All references resolve",
    status: fkBreaks.length === 0 ? "pass" : "fail",
    count: fkBreaks.length,
    detail:
      fkBreaks.length === 0
        ? `${fkChecked.toLocaleString()} references checked (txn→account, txn→party, account→owner). All resolve.`
        : `${fkBreaks.length} broken reference(s): ${fkBreaks.slice(0, 5).join(", ")}${fkBreaks.length > 5 ? "…" : ""}`,
  });

  // 3) Date coherence ---------------------------------------------------------
  const dateBreaks: string[] = [];
  const wStart = ds.meta.spec.dateRange.start;
  const wEnd = ds.meta.spec.dateRange.end;
  for (const t of ds.transactions) {
    const acct = accountById.get(t.accountId);
    if (!acct) continue;
    if (t.postingDate < t.effectiveDate) dateBreaks.push(`${t.id} posts before effective`);
    if (t.effectiveDate < wStart || t.effectiveDate > wEnd) {
      dateBreaks.push(`${t.id} effective outside window`);
    }
    const isResidual = t.tags.includes("residual_after_close");
    if (!isResidual && t.effectiveDate < acct.openDate) {
      dateBreaks.push(`${t.id} before account open`);
    }
  }
  for (const a of ds.accounts) {
    if (a.closeDate && a.closeDate < a.openDate) dateBreaks.push(`${a.id} closed before open`);
  }
  checks.push({
    id: "date_coherence",
    label: "Dates are coherent",
    status: dateBreaks.length === 0 ? "pass" : "fail",
    count: dateBreaks.length,
    detail:
      dateBreaks.length === 0
        ? "Posting ≥ effective for every transaction; all activity falls within the account's lifecycle and the requested window."
        : `${dateBreaks.length} date issue(s): ${dateBreaks.slice(0, 5).join(", ")}${dateBreaks.length > 5 ? "…" : ""}`,
  });

  // 4) Requested edge cases present (feasibility-aware) -----------------------
  // A requested edge case that is *structurally impossible* for the chosen
  // products/parties/window (e.g. joint ownership on a loan-only config) is a
  // WARN with the reason — not a hard FAIL. Feasible-but-missing is still a FAIL
  // (a real generator bug).
  const ec = ds.meta.spec.edgeCases;
  const isTxnDeposit = (p: string) => p === "checking" || p === "savings" || p === "money_market";
  const isAnyDeposit = (p: string) => isTxnDeposit(p) || p === "cd";
  const individuals = ds.parties.filter((p) => p.type === "individual").length;
  const txnDepositAccts = ds.accounts.filter((a) => isTxnDeposit(a.product)).length;
  const depositAccts = ds.accounts.filter((a) => isAnyDeposit(a.product)).length;
  const txnCount = ds.transactions.length;
  const volume = ds.meta.spec.avgTransactionsPerAccountPerMonth;
  const windowDays = Math.round(
    (new Date(wEnd).getTime() - new Date(wStart).getTime()) / 86_400_000,
  );

  const has: Record<keyof EdgeCases, boolean> = {
    nsfOverdraft: ds.transactions.some((t) => t.tags.includes("overdraft") || t.tags.includes("nsf")),
    dormantAccounts: ds.accounts.some((a) => a.status === "dormant"),
    atLimitAccounts: ds.accounts.some((a) => a.tags.includes("at_limit")),
    backdatedPostings: ds.transactions.some((t) => t.tags.includes("backdated")),
    // Validate the ACTUAL condition the user asked for — a real wire whose
    // amount exceeds the threshold — not merely the presence of a tag.
    largeWires: ds.transactions.some(
      (t) => t.category === "wire" && Math.abs(t.amountMinor) > ds.meta.spec.largeWireThresholdMinor,
    ),
    newAccountFunding: ds.accounts.some((a) => a.tags.includes("new_funding")),
    closedWithResidual:
      ds.accounts.some((a) => a.status === "closed") &&
      ds.transactions.some((t) => t.tags.includes("residual_after_close")),
    jointOwnership: ds.accounts.some((a) => a.owners.length > 1),
  };

  // new_funding / dormant / closed are mutually-exclusive account states: hosting
  // them all needs at least one deposit account per requested state.
  const exclusiveRequested =
    (ec.newAccountFunding ? 1 : 0) + (ec.dormantAccounts ? 1 : 0) + (ec.closedWithResidual ? 1 : 0);
  const enoughForExclusive = depositAccts >= exclusiveRequested;

  const feasible: Record<keyof EdgeCases, boolean> = {
    nsfOverdraft: txnDepositAccts > 0 && volume > 0,
    dormantAccounts: depositAccts > 0 && enoughForExclusive,
    atLimitAccounts: ds.accounts.some((a) => a.status !== "closed" && !a.tags.includes("new_funding")),
    backdatedPostings: txnCount > 0,
    largeWires: txnDepositAccts > 0,
    newAccountFunding: txnDepositAccts > 0 && enoughForExclusive,
    closedWithResidual: depositAccts > 0 && windowDays >= 14 && enoughForExclusive,
    jointOwnership: individuals >= 2 && depositAccts > 0,
  };

  const reasonFor = (k: keyof EdgeCases): string => {
    switch (k) {
      case "nsfOverdraft":
        return txnDepositAccts === 0 ? "no checking/savings/money-market account" : "no transaction volume to overdraw";
      case "largeWires":
        return "no checking/savings/money-market account to wire from";
      case "newAccountFunding":
        return txnDepositAccts === 0 ? "no checking/savings/money-market account" : "too few deposit accounts to host every requested account state";
      case "dormantAccounts":
        return depositAccts === 0 ? "no deposit accounts" : "too few deposit accounts to host every requested account state";
      case "closedWithResidual":
        return depositAccts === 0
          ? "no deposit accounts"
          : windowDays < 14
            ? "the window is shorter than ~2 weeks"
            : "too few deposit accounts to host every requested account state";
      case "jointOwnership":
        return individuals < 2 ? "fewer than two individual customers" : "no deposit accounts";
      case "atLimitAccounts":
        return "no eligible accounts (all are brand-new or closed)";
      case "backdatedPostings":
        return "no transactions";
    }
  };

  const requested = (Object.keys(ec) as (keyof EdgeCases)[]).filter((k) => ec[k]);
  const present = requested.filter((k) => has[k]);
  const missingFeasible = requested.filter((k) => !has[k] && feasible[k]);
  const missingInfeasible = requested.filter((k) => !has[k] && !feasible[k]);

  const threshold = ds.meta.spec.largeWireThresholdMinor;
  const presentCount = (k: keyof EdgeCases): number => {
    switch (k) {
      case "nsfOverdraft":
        return ds.transactions.filter((t) => t.tags.includes("overdraft")).length;
      case "largeWires":
        return ds.transactions.filter((t) => t.category === "wire" && Math.abs(t.amountMinor) > threshold).length;
      case "backdatedPostings":
        return ds.transactions.filter((t) => t.tags.includes("backdated")).length;
      case "dormantAccounts":
        return ds.accounts.filter((a) => a.status === "dormant").length;
      case "closedWithResidual":
        return ds.accounts.filter((a) => a.status === "closed").length;
      case "atLimitAccounts":
        return ds.accounts.filter((a) => a.tags.includes("at_limit")).length;
      case "newAccountFunding":
        return ds.accounts.filter((a) => a.tags.includes("new_funding")).length;
      case "jointOwnership":
        return ds.accounts.filter((a) => a.owners.length > 1).length;
    }
  };
  const presentLabel = (k: keyof EdgeCases): string =>
    k === "largeWires"
      ? `Large wires ≥ $${(threshold / 100).toLocaleString()} (${presentCount(k)})`
      : `${EDGE_LABELS[k]} (${presentCount(k)})`;

  const edgeStatus: CheckStatus =
    missingFeasible.length > 0 ? "fail" : missingInfeasible.length > 0 ? "warn" : "pass";

  let edgeDetail: string;
  if (requested.length === 0) {
    edgeDetail = "No special edge cases were requested.";
  } else {
    const segments: string[] = [
      `${present.length}/${requested.length} requested edge case(s) verified present` +
        (present.length ? `: ${present.map(presentLabel).join(", ")}.` : "."),
    ];
    if (missingFeasible.length) {
      segments.push(`Missing (unexpected): ${missingFeasible.map((k) => EDGE_LABELS[k]).join(", ")}.`);
    }
    if (missingInfeasible.length) {
      segments.push(
        "Not applicable to this configuration: " +
          missingInfeasible.map((k) => `${EDGE_LABELS[k]} (${reasonFor(k)})`).join("; ") + ".",
      );
    }
    edgeDetail = segments.join(" ");
  }

  checks.push({
    id: "edge_cases",
    label: "Requested edge cases present",
    status: edgeStatus,
    count: missingFeasible.length + missingInfeasible.length,
    detail: edgeDetail,
  });

  // 5) Soft sanity checks (warnings, not failures) ---------------------------
  const zeroAmt = ds.transactions.filter((t) => t.amountMinor === 0).length;
  if (zeroAmt > 0) {
    checks.push({
      id: "nonzero_amounts",
      label: "Transaction amounts are non-zero",
      status: "warn",
      count: zeroAmt,
      detail: `${zeroAmt} transaction(s) have a zero amount.`,
    });
  }

  const overLimit = ds.accounts.filter(
    (a) => a.product === "credit_line" && a.creditLimitMinor != null && a.currentBalanceMinor < -a.creditLimitMinor - 100,
  ).length;
  if (overLimit > 0) {
    checks.push({
      id: "credit_within_limit",
      label: "Credit lines within limit",
      status: "warn",
      count: overLimit,
      detail: `${overLimit} credit line(s) exceed their limit (acceptable in some over-limit test scenarios).`,
    });
  }

  const ok = checks.every((c) => c.status !== "fail");
  return {
    ok,
    checks,
    stats: {
      accountsReconciled: reconciledAccounts,
      foreignKeysChecked: fkChecked,
      transactionsChecked: ds.transactions.length,
    },
  };
}
