/**
 * Account generation.
 *
 * Balance convention (universal, so reconciliation is one rule everywhere):
 *   currentBalance === openingBalance + Σ(transaction.amount)
 * Deposit accounts carry a positive balance; loans/credit lines carry a
 * negative balance representing money owed (UI shows the absolute "owed" value).
 *
 * `openingBalance` is the balance *brought forward at the start of the modeled
 * period*. Accounts opened before the data window get a realistic brought-
 * forward balance; accounts opened inside the window start at 0 and are funded
 * by their first transaction. Either way the invariant above holds exactly.
 */

import {
  type Account,
  type AccountOwner,
  type AccountStatus,
  type Party,
  type ProductType,
  DEPOSIT_PRODUCTS,
  LOAN_PRODUCTS,
} from "../domain/types";
import type { GenerationSpec } from "../domain/spec";
import { Rng } from "./rng";
import { BRANCHES } from "./pools";
import { accountNumber, formatId } from "./identity";
import { addDays, fromISO, isoMonthsLater, randomDateISO, toISO } from "./dates";

const PRODUCT_NAMES: Record<ProductType, string[]> = {
  checking: ["Everyday Checking", "Hometown Checking", "Premier Checking", "Free Checking"],
  savings: ["Statement Savings", "High-Yield Savings", "Holiday Club Savings"],
  money_market: ["Money Market", "Premier Money Market"],
  cd: ["Certificate of Deposit"],
  loan_auto: ["Auto Loan"],
  loan_mortgage: ["30-Year Fixed Mortgage", "15-Year Fixed Mortgage"],
  loan_personal: ["Personal Loan"],
  credit_line: ["Personal Line of Credit", "Business Line of Credit"],
};

/** Relative weights for which products a party opens (only in-scope ones count). */
const PRODUCT_WEIGHTS: Record<ProductType, number> = {
  checking: 32,
  savings: 24,
  money_market: 8,
  cd: 8,
  credit_line: 10,
  loan_auto: 7,
  loan_personal: 5,
  loan_mortgage: 3,
};

function isDeposit(p: ProductType): boolean {
  return (DEPOSIT_PRODUCTS as ProductType[]).includes(p);
}
function isLoan(p: ProductType): boolean {
  return (LOAN_PRODUCTS as ProductType[]).includes(p);
}

interface ProductAttrs {
  productName: string;
  interestRateBps?: number;
  termMonths?: number;
  minimumBalanceMinor?: number;
  creditLimitMinor?: number;
  originalPrincipalMinor?: number;
  maturityDate?: string;
  openingBalanceMinor: number;
}

function buildProductAttrs(
  rng: Rng,
  product: ProductType,
  openDateISO: string,
  openedInWindow: boolean,
): ProductAttrs {
  const name = rng.pick(PRODUCT_NAMES[product]);

  switch (product) {
    case "checking": {
      const min = rng.bool(0.5) ? 0 : 10000;
      return {
        productName: name,
        interestRateBps: rng.bool(0.3) ? rng.int(1, 15) : 0,
        minimumBalanceMinor: min,
        openingBalanceMinor: openedInWindow
          ? 0
          : Math.round(rng.gaussian(2500, 2500, 50, 18000)) * 100,
      };
    }
    case "savings": {
      return {
        productName: name,
        interestRateBps: rng.int(50, 150),
        minimumBalanceMinor: rng.bool(0.5) ? 0 : 2500,
        openingBalanceMinor: openedInWindow
          ? 0
          : Math.round(rng.gaussian(6000, 6000, 100, 45000)) * 100,
      };
    }
    case "money_market": {
      return {
        productName: name,
        interestRateBps: rng.int(150, 300),
        minimumBalanceMinor: rng.int(1000, 2500) * 100,
        openingBalanceMinor: openedInWindow
          ? 0
          : Math.round(rng.gaussian(22000, 18000, 1500, 120000)) * 100,
      };
    }
    case "cd": {
      const term = rng.pick([12, 24, 36, 60]);
      const principal = rng.int(5, 75) * 1000;
      return {
        productName: `${term}-Month ${name}`,
        interestRateBps: 300 + term * 3 + rng.int(0, 50),
        termMonths: term,
        minimumBalanceMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term),
        openingBalanceMinor: openedInWindow ? 0 : principal * 100,
      };
    }
    case "loan_auto": {
      const term = rng.pick([48, 60, 72]);
      const principal = rng.int(12, 45) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.3, 0.95));
      return {
        productName: name,
        interestRateBps: rng.int(500, 900),
        termMonths: term,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "loan_mortgage": {
      const term = rng.pick([180, 360]);
      const principal = rng.int(120, 450) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.5, 0.98));
      return {
        productName: term === 180 ? "15-Year Fixed Mortgage" : "30-Year Fixed Mortgage",
        interestRateBps: rng.int(550, 750),
        termMonths: term,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "loan_personal": {
      const term = rng.pick([24, 36, 60]);
      const principal = rng.int(3, 25) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.2, 0.9));
      return {
        productName: name,
        interestRateBps: rng.int(900, 1600),
        termMonths: term,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "credit_line": {
      const limit = rng.int(5, 50) * 1000;
      const util = openedInWindow ? 0 : rng.float(0, 0.6);
      return {
        productName: name,
        interestRateBps: rng.int(1000, 1800),
        creditLimitMinor: limit * 100,
        openingBalanceMinor: -Math.round(limit * util) * 100,
      };
    }
  }
}

function pickAccountCount(rng: Rng, avg: number): number {
  return Math.min(5, Math.max(1, Math.round(rng.gaussian(avg, 0.9, 1, 5))));
}

/** Choose the product list for a party: a primary deposit first, then extras. */
function chooseProducts(rng: Rng, inScope: ProductType[], count: number): ProductType[] {
  const deposits = inScope.filter(isDeposit);
  const result: ProductType[] = [];

  // Primary deposit account (checking preferred), else any in-scope product.
  if (deposits.length) {
    result.push(deposits.includes("checking") ? "checking" : rng.pick(deposits));
  } else {
    result.push(rng.pick(inScope));
  }

  const weights = inScope.map((p) => PRODUCT_WEIGHTS[p]);
  while (result.length < count) {
    result.push(rng.weightedPick(inScope, weights));
  }
  return result;
}

function sampleIndices(rng: Rng, n: number, count: number): number[] {
  const idx = rng.shuffle([...Array(n).keys()]);
  return idx.slice(0, Math.min(count, n));
}

export function generateAccounts(rng: Rng, spec: GenerationSpec, parties: Party[]): Account[] {
  const accounts: Account[] = [];
  const windowStart = spec.dateRange.start;
  const windowEnd = spec.dateRange.end;
  const dayBeforeWindow = toISO(addDays(fromISO(windowStart), -1));
  const inScope = spec.products;
  const individuals = parties.filter((p) => p.type === "individual");
  let seq = 1;

  for (const party of parties) {
    const count = pickAccountCount(rng, spec.avgAccountsPerParty);
    const products = chooseProducts(rng, inScope, count);

    for (const product of products) {
      // Decide open date: before the window if the relationship predates it,
      // otherwise inside the window (a genuinely new account).
      const memberSince = party.memberSince;
      let openedInWindow: boolean;
      let openDate: string;
      if (fromISO(memberSince) >= fromISO(windowStart)) {
        openedInWindow = true;
        const latest = toISO(addDays(fromISO(windowEnd), -7));
        openDate = randomDateISO(rng, memberSince, latest > memberSince ? latest : memberSince);
      } else {
        openedInWindow = false;
        openDate = randomDateISO(rng, memberSince, dayBeforeWindow);
      }

      const attrs = buildProductAttrs(rng, product, openDate, openedInWindow);
      const owners: AccountOwner[] = [{ partyId: party.id, role: "primary" }];

      accounts.push({
        id: formatId("ACC", seq, 6),
        accountNumber: accountNumber(rng),
        product,
        productName: attrs.productName,
        status: "active",
        owners,
        openDate,
        currency: "USD",
        openingBalanceMinor: attrs.openingBalanceMinor,
        currentBalanceMinor: attrs.openingBalanceMinor, // updated by transactions
        availableBalanceMinor: attrs.openingBalanceMinor,
        interestRateBps: attrs.interestRateBps,
        termMonths: attrs.termMonths,
        minimumBalanceMinor: attrs.minimumBalanceMinor,
        creditLimitMinor: attrs.creditLimitMinor,
        originalPrincipalMinor: attrs.originalPrincipalMinor,
        maturityDate: attrs.maturityDate,
        branch: rng.pick(BRANCHES),
        tags: openedInWindow ? ["new_funding"] : [],
      });
      seq++;
    }
  }

  applyJointOwnership(rng, spec, accounts, individuals);
  applyAccountEdgeCases(rng, spec, accounts);
  return accounts;
}

function applyJointOwnership(
  rng: Rng,
  spec: GenerationSpec,
  accounts: Account[],
  individuals: Party[],
): void {
  if (individuals.length < 2) return;
  const depositAccts = accounts.filter((a) => isDeposit(a.product));

  const addJoint = (a: Account) => {
    const primary = a.owners[0].partyId;
    let joint = rng.pick(individuals);
    let guard = 0;
    while (joint.id === primary && guard++ < 5) joint = rng.pick(individuals);
    if (joint.id !== primary) {
      a.owners.push({ partyId: joint.id, role: "joint" });
      if (!a.tags.includes("joint")) a.tags.push("joint");
    }
  };

  for (const a of depositAccts) {
    if (rng.bool(spec.jointOwnershipRatio)) addJoint(a);
  }

  // Guarantee presence if explicitly requested.
  if (spec.edgeCases.jointOwnership) {
    const have = accounts.filter((a) => a.tags.includes("joint")).length;
    const need = Math.min(depositAccts.length, 3) - have;
    if (need > 0) {
      const candidates = depositAccts.filter((a) => !a.tags.includes("joint"));
      for (const a of sampleIndices(rng, candidates.length, need).map((i) => candidates[i])) {
        addJoint(a);
      }
    }
  }
}

/** Designate dormant / closed-with-residual / at-limit accounts per the spec flags. */
function applyAccountEdgeCases(rng: Rng, spec: GenerationSpec, accounts: Account[]): void {
  const ec = spec.edgeCases;
  const windowStart = spec.dateRange.start;
  const windowEnd = spec.dateRange.end;

  const target = (eligible: Account[], rate = 0.08, min = 3) =>
    sampleIndices(rng, eligible.length, Math.min(eligible.length, Math.max(min, Math.round(eligible.length * rate)))).map(
      (i) => eligible[i],
    );

  const setStatus = (a: Account, s: AccountStatus, tag: string) => {
    a.status = s;
    if (!a.tags.includes(tag)) a.tags.push(tag);
  };

  if (ec.dormantAccounts) {
    const eligible = accounts.filter(
      (a) => a.status === "active" && isDeposit(a.product) && !a.tags.includes("new_funding"),
    );
    for (const a of target(eligible)) setStatus(a, "dormant", "dormant");
  }

  if (ec.closedWithResidual) {
    const eligible = accounts.filter(
      (a) => a.status === "active" && isDeposit(a.product) && !a.tags.includes("dormant"),
    );
    for (const a of target(eligible)) {
      // Close partway through the window so residual activity can follow.
      const closeDate = randomDateISO(
        rng,
        toISO(addDays(fromISO(windowStart), 10)),
        toISO(addDays(fromISO(windowEnd), -10)),
      );
      a.closeDate = closeDate;
      setStatus(a, "closed", "closed_residual");
    }
  }

  if (ec.atLimitAccounts) {
    const eligible = accounts.filter((a) => a.status === "active" && !a.tags.includes("closed_residual"));
    for (const a of target(eligible)) {
      a.tags.push("at_limit");
      if (a.product === "credit_line" && a.creditLimitMinor) {
        a.openingBalanceMinor = -Math.round(a.creditLimitMinor * rng.float(0.95, 1.0));
        a.currentBalanceMinor = a.openingBalanceMinor;
        a.availableBalanceMinor = a.creditLimitMinor + a.openingBalanceMinor;
      } else if (isDeposit(a.product) && a.minimumBalanceMinor) {
        a.openingBalanceMinor = a.minimumBalanceMinor + rng.int(0, 50) * 100;
        a.currentBalanceMinor = a.openingBalanceMinor;
        a.availableBalanceMinor = a.openingBalanceMinor;
      }
    }
  }
  void windowEnd;
}
