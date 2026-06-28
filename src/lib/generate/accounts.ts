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
} from "../domain/types";
import type { GenerationSpec } from "../domain/spec";
import { Rng } from "./rng";
import { BRANCHES } from "./pools";
import { accountNumber, formatId } from "./identity";
import { addDays, daysBetween, fromISO, isoMonthsLater, randomDateISO, toISO } from "./dates";

/**
 * Product variants. Rate, term, and minimum balance are properties of the named
 * product — every "Hometown Checking" carries the same rate. Only per-account
 * facts (balance, principal, credit limit) vary between accounts of the same product.
 */
interface ProductVariant {
  name: string;
  rateBps: number;
  minBalanceMinor?: number;
  termMonths?: number; // fixed term (CDs, mortgages)
  termOptions?: number[]; // contract term varies per account (installment loans)
}

const PRODUCT_VARIANTS: Record<ProductType, ProductVariant[]> = {
  checking: [
    { name: "Everyday Checking", rateBps: 0, minBalanceMinor: 0 },
    { name: "Free Checking", rateBps: 0, minBalanceMinor: 0 },
    { name: "Hometown Checking", rateBps: 5, minBalanceMinor: 0 },
    { name: "Premier Checking", rateBps: 15, minBalanceMinor: 250000 },
  ],
  savings: [
    { name: "Statement Savings", rateBps: 75, minBalanceMinor: 0 },
    { name: "High-Yield Savings", rateBps: 140, minBalanceMinor: 250000 },
    { name: "Holiday Club Savings", rateBps: 50, minBalanceMinor: 0 },
  ],
  money_market: [
    { name: "Money Market", rateBps: 200, minBalanceMinor: 150000 },
    { name: "Premier Money Market", rateBps: 280, minBalanceMinor: 250000 },
  ],
  cd: [
    { name: "12-Month Certificate of Deposit", rateBps: 330, termMonths: 12 },
    { name: "24-Month Certificate of Deposit", rateBps: 380, termMonths: 24 },
    { name: "36-Month Certificate of Deposit", rateBps: 415, termMonths: 36 },
    { name: "60-Month Certificate of Deposit", rateBps: 460, termMonths: 60 },
  ],
  loan_auto: [{ name: "Auto Loan", rateBps: 649, termOptions: [48, 60, 72] }],
  loan_mortgage: [
    { name: "30-Year Fixed Mortgage", rateBps: 662, termMonths: 360 },
    { name: "15-Year Fixed Mortgage", rateBps: 599, termMonths: 180 },
  ],
  loan_personal: [{ name: "Personal Loan", rateBps: 1199, termOptions: [24, 36, 60] }],
  credit_line: [
    { name: "Personal Line of Credit", rateBps: 1499 },
    { name: "Business Line of Credit", rateBps: 1299 },
  ],
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
  const v = rng.pick(PRODUCT_VARIANTS[product]);
  const term = v.termMonths ?? (v.termOptions ? rng.pick(v.termOptions) : undefined);
  // Rate, term, and minimum balance come from the product definition (consistent
  // across all accounts of this product); only balances/principal vary per account.
  const base: ProductAttrs = {
    productName: v.name,
    interestRateBps: v.rateBps,
    termMonths: term,
    minimumBalanceMinor: v.minBalanceMinor,
    openingBalanceMinor: 0,
  };

  switch (product) {
    case "checking":
      return { ...base, openingBalanceMinor: openedInWindow ? 0 : Math.round(rng.gaussian(2500, 2500, 50, 18000)) * 100 };
    case "savings":
      return { ...base, openingBalanceMinor: openedInWindow ? 0 : Math.round(rng.gaussian(6000, 6000, 100, 45000)) * 100 };
    case "money_market":
      return { ...base, openingBalanceMinor: openedInWindow ? 0 : Math.round(rng.gaussian(22000, 18000, 1500, 120000)) * 100 };
    case "cd": {
      const principal = rng.int(5, 75) * 1000;
      return {
        ...base,
        minimumBalanceMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term ?? 12),
        openingBalanceMinor: openedInWindow ? 0 : principal * 100,
      };
    }
    case "loan_auto": {
      const principal = rng.int(12, 45) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.3, 0.95));
      return {
        ...base,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term ?? 60),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "loan_mortgage": {
      const principal = rng.int(120, 450) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.5, 0.98));
      return {
        ...base,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term ?? 360),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "loan_personal": {
      const principal = rng.int(3, 25) * 1000;
      const remaining = openedInWindow ? principal : Math.round(principal * rng.float(0.2, 0.9));
      return {
        ...base,
        originalPrincipalMinor: principal * 100,
        maturityDate: isoMonthsLater(openDateISO, term ?? 36),
        openingBalanceMinor: openedInWindow ? 0 : -remaining * 100,
      };
    }
    case "credit_line": {
      const limit = rng.int(5, 50) * 1000;
      const util = openedInWindow ? 0 : rng.float(0, 0.6);
      return {
        ...base,
        creditLimitMinor: limit * 100,
        openingBalanceMinor: -Math.round(limit * util) * 100,
      };
    }
  }
}

function pickAccountCount(rng: Rng, avg: number): number {
  // Expected value equals `avg` exactly, so the up-front estimate
  // (partyCount × avg) matches the actual account count — one source of truth.
  const base = Math.floor(avg);
  const n = base + (rng.next() < avg - base ? 1 : 0);
  return Math.min(5, Math.max(1, n));
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

/** Transaction-style deposits (can host wires/overdrafts/funding). CDs excluded. */
function isTxnDeposit(p: ProductType): boolean {
  return p === "checking" || p === "savings" || p === "money_market";
}

/**
 * Designate edge-case accounts per the spec flags. Order matters: new-account
 * funding is forced first so later designations can exclude those accounts, and
 * every designation keeps dates coherent (close dates never precede open dates).
 */
function applyAccountEdgeCases(rng: Rng, spec: GenerationSpec, accounts: Account[]): void {
  const ec = spec.edgeCases;
  const windowStart = spec.dateRange.start;
  const windowEnd = spec.dateRange.end;
  const windowDays = daysBetween(windowStart, windowEnd);

  const setStatus = (a: Account, s: AccountStatus, tag: string) => {
    a.status = s;
    if (!a.tags.includes(tag)) a.tags.push(tag);
  };

  // Desired count for a designation (~8%, min 3) and a sampler.
  const desired = (len: number) => Math.max(3, Math.round(len * 0.08));
  const pickN = (eligible: Account[], n: number) =>
    sampleIndices(rng, eligible.length, Math.min(Math.max(0, n), eligible.length)).map((i) => eligible[i]);

  // new_funding / dormant / closed are mutually-exclusive account states. When
  // accounts are scarce, reserve one per *other* requested state so each gets a
  // chance to appear rather than the first designation consuming them all.
  const closedFeasible = ec.closedWithResidual && windowDays >= 14;

  // 1) New-account funding: guarantee some accounts open *inside* the window,
  //    starting at 0 and funded by their first transaction. Convert existing
  //    (pre-window) transaction-deposit accounts so their memberSince still
  //    precedes the new open date.
  if (ec.newAccountFunding) {
    const reserve = (ec.dormantAccounts ? 1 : 0) + (closedFeasible ? 1 : 0);
    const latestOpen = toISO(addDays(fromISO(windowEnd), -3));
    const eligible = accounts.filter(
      (a) => a.status === "active" && isTxnDeposit(a.product) && !a.tags.includes("new_funding"),
    );
    const want = Math.min(desired(eligible.length), Math.max(1, eligible.length - reserve));
    for (const a of pickN(eligible, want)) {
      a.openDate = randomDateISO(rng, windowStart, latestOpen > windowStart ? latestOpen : windowStart);
      a.openingBalanceMinor = 0;
      a.currentBalanceMinor = 0;
      a.availableBalanceMinor = 0;
      a.tags.push("new_funding");
    }
  }

  // 2) Dormant deposit accounts (not brand-new).
  if (ec.dormantAccounts) {
    const reserve = closedFeasible ? 1 : 0;
    const eligible = accounts.filter(
      (a) => a.status === "active" && isDeposit(a.product) && !a.tags.includes("new_funding"),
    );
    const want = Math.min(desired(eligible.length), Math.max(1, eligible.length - reserve));
    for (const a of pickN(eligible, want)) setStatus(a, "dormant", "dormant");
  }

  // 3) Closed-with-residual. Only feasible if the window is long enough to host
  //    a mid-window close; eligible accounts are pre-window so closeDate > openDate.
  if (closedFeasible) {
    const lo = toISO(addDays(fromISO(windowStart), 7));
    const hi = toISO(addDays(fromISO(windowEnd), -3));
    const eligible = accounts.filter(
      (a) =>
        a.status === "active" &&
        isDeposit(a.product) &&
        !a.tags.includes("dormant") &&
        !a.tags.includes("new_funding"),
    );
    for (const a of pickN(eligible, desired(eligible.length))) {
      a.closeDate = randomDateISO(rng, lo, hi);
      setStatus(a, "closed", "closed_residual");
    }
  }

  // 4) At product limit (loans/credit lines maxed, deposits at minimum). This is
  //    a tag, not an exclusive status, so it may reuse a dormant account; it only
  //    avoids brand-new (funding) and closed accounts.
  if (ec.atLimitAccounts) {
    const eligible = accounts.filter(
      (a) =>
        a.status !== "closed" &&
        !a.tags.includes("new_funding") &&
        !a.tags.includes("at_limit"),
    );
    for (const a of pickN(eligible, desired(eligible.length))) {
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
}
