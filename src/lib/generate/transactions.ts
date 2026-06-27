/**
 * Transaction generation — the part that must reconcile exactly.
 *
 * For every account we walk a chronological stream of transactions, tracking a
 * running balance in integer cents. The account's ending balance is, by
 * construction, openingBalance + Σ(amounts). Posting dates trail effective
 * dates by realistic gaps (next business day, or wider for backdated edge
 * cases). Requested edge cases are guaranteed to appear at least a few times.
 */

import {
  type Account,
  type Party,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from "../domain/types";
import type { GenerationSpec } from "../domain/spec";
import { Rng } from "./rng";
import {
  ACH_CREDIT_SOURCES,
  ACH_DEBIT_BILLERS,
  MERCHANTS,
  WIRE_COUNTERPARTIES,
} from "./pools";
import { maskAccount } from "./identity";
import {
  addDays,
  fromISO,
  isBusinessDay,
  isHoliday,
  isoMonthsLater,
  isWeekend,
  nextBusinessDay,
  randomDateISO,
  toISO,
} from "./dates";

const OD_FEE_MINOR = 3500; // $35 overdraft / NSF fee

interface Ctx {
  rng: Rng;
  spec: GenerationSpec;
  seq: { txn: number };
  guarantee: {
    nsf: Set<string>;
    largeWire: Set<string>;
  };
}

function makeRef(rng: Rng, category: TransactionCategory): string {
  const n = (len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += rng.int(0, 9);
    return s;
  };
  switch (category) {
    case "ach":
      return `ACH${n(9)}`;
    case "wire":
      return `IMAD${n(8)}`;
    case "card":
      return `AUTH${n(6)}`;
    case "atm":
      return `ATM${n(8)}`;
    case "check":
      return `CHK${n(5)}`;
    default:
      return `REF${n(10)}`;
  }
}

/** Resolve a mix category into a concrete signed transaction type. */
function concreteType(
  rng: Rng,
  cat: TransactionCategory,
): { type: TransactionType; dir: 1 | -1 } {
  switch (cat) {
    case "ach":
      return rng.bool(0.42)
        ? { type: "ach_credit", dir: 1 }
        : { type: "ach_debit", dir: -1 };
    case "wire":
      return rng.bool(0.5) ? { type: "wire_in", dir: 1 } : { type: "wire_out", dir: -1 };
    case "card":
      return { type: "card_pos", dir: -1 };
    case "atm":
      return rng.bool(0.75)
        ? { type: "atm_withdrawal", dir: -1 }
        : { type: "atm_deposit", dir: 1 };
    case "check":
      return rng.bool(0.5)
        ? { type: "check_deposit", dir: 1 }
        : { type: "check_paid", dir: -1 };
    case "transfer":
      return rng.bool(0.5)
        ? { type: "transfer_in", dir: 1 }
        : { type: "transfer_out", dir: -1 };
    default:
      return { type: "deposit", dir: 1 };
  }
}

/** Positive magnitude in cents for a concrete type. */
function magnitudeMinor(rng: Rng, type: TransactionType): number {
  switch (type) {
    case "card_pos": {
      const m = rng.pick(MERCHANTS);
      return rng.amountMinor(m.min, m.max);
    }
    case "ach_credit":
      return rng.amountMinor(800, 4500);
    case "ach_debit":
      return rng.amountMinor(30, 700);
    case "atm_withdrawal":
      return rng.int(1, 20) * 20 * 100;
    case "atm_deposit":
      return rng.amountMinor(40, 1500);
    case "check_deposit":
      return rng.amountMinor(50, 3000);
    case "check_paid":
      return rng.amountMinor(25, 1800);
    case "wire_in":
    case "wire_out":
      return rng.amountMinor(1000, 25000);
    case "transfer_in":
    case "transfer_out":
      return rng.amountMinor(50, 3000);
    case "deposit":
      return rng.amountMinor(500, 15000);
    default:
      return rng.amountMinor(20, 500);
  }
}

function categoryOf(type: TransactionType): TransactionCategory {
  if (type.startsWith("ach")) return "ach";
  if (type.startsWith("wire")) return "wire";
  if (type === "card_pos") return "card";
  if (type.startsWith("atm")) return "atm";
  if (type.startsWith("check")) return "check";
  if (type.startsWith("transfer")) return "transfer";
  if (type === "fee") return "fee";
  if (type.startsWith("interest")) return "interest";
  if (type.startsWith("loan")) return "loan";
  return "deposit";
}

function describe(
  rng: Rng,
  type: TransactionType,
): { description: string; merchant?: string; mcc?: string; counterparty?: string; channel: Transaction["channel"] } {
  switch (type) {
    case "card_pos": {
      const m = rng.pick(MERCHANTS);
      return { description: `Card purchase — ${m.name}`, merchant: m.name, mcc: m.mcc, channel: "pos" };
    }
    case "ach_credit": {
      const src = rng.pick(ACH_CREDIT_SOURCES);
      return { description: `ACH credit — ${src}`, counterparty: src, channel: "ach_network" };
    }
    case "ach_debit": {
      const b = rng.pick(ACH_DEBIT_BILLERS);
      return { description: `ACH debit — ${b}`, counterparty: b, channel: "ach_network" };
    }
    case "wire_in": {
      const cp = rng.pick(WIRE_COUNTERPARTIES);
      return { description: `Incoming wire — ${cp}`, counterparty: cp, channel: "fedwire" };
    }
    case "wire_out": {
      const cp = rng.pick(WIRE_COUNTERPARTIES);
      return { description: `Outgoing wire — ${cp}`, counterparty: cp, channel: "fedwire" };
    }
    case "atm_withdrawal":
      return { description: "ATM withdrawal", channel: "atm" };
    case "atm_deposit":
      return { description: "ATM deposit", channel: "atm" };
    case "check_deposit":
      return { description: "Check deposit", channel: "branch" };
    case "check_paid":
      return { description: `Check paid #${rng.int(1001, 9999)}`, channel: "branch" };
    case "transfer_in":
      return { description: "Transfer from linked account", channel: "online" };
    case "transfer_out":
      return { description: "Transfer to linked account", channel: "online" };
    case "deposit":
      return { description: "Opening deposit", channel: "branch" };
    case "fee":
      return { description: "Service fee", channel: "online" };
    case "interest_credit":
      return { description: "Interest paid", channel: "online" };
    case "interest_charge":
      return { description: "Interest charged", channel: "online" };
    case "loan_disbursement":
      return { description: "Loan disbursement", channel: "branch" };
    case "loan_payment":
      return { description: "Loan payment", channel: "online" };
    default:
      return { description: "Transaction", channel: "online" };
  }
}

function postingFor(ctx: Ctx, effectiveISO: string, forceBackdate: boolean): { posting: string; tags: string[] } {
  const eff = fromISO(effectiveISO);
  const tags: string[] = [];
  if (forceBackdate) {
    // Posting trails effective by several days (weekend/holiday batch or correction).
    const gap = ctx.rng.int(3, 9);
    tags.push("backdated");
    if (isHoliday(eff) || isWeekend(eff)) tags.push("holiday_posting");
    return { posting: toISO(addDays(eff, gap)), tags };
  }
  // Normal: post same day if a business day, else next business day.
  if (isBusinessDay(eff)) return { posting: effectiveISO, tags };
  tags.push("holiday_posting");
  return { posting: toISO(nextBusinessDay(eff)), tags };
}

function newTxn(
  ctx: Ctx,
  account: Account,
  partyId: string,
  type: TransactionType,
  signedMinor: number,
  balanceAfterMinor: number,
  effectiveISO: string,
  extraTags: string[] = [],
  forceBackdate = false,
): Transaction {
  const category = categoryOf(type);
  const d = describe(ctx.rng, type);
  const { posting, tags } = postingFor(ctx, effectiveISO, forceBackdate);
  const id = `TXN-${String(ctx.seq.txn++).padStart(8, "0")}`;
  return {
    id,
    accountId: account.id,
    partyId,
    type,
    category,
    amountMinor: signedMinor,
    balanceAfterMinor,
    effectiveDate: effectiveISO,
    postingDate: posting,
    description: d.description,
    merchant: d.merchant,
    mcc: d.mcc,
    counterpartyName: d.counterparty,
    counterpartyAccount: d.counterparty ? maskAccount(String(ctx.rng.int(1000, 9999)).padStart(4, "0")) : undefined,
    channel: d.channel,
    reference: makeRef(ctx.rng, category),
    status: "posted",
    tags: [...tags, ...extraTags],
  };
}

/** Active modeling window for an account, clamped to the spec window. */
function activeWindow(spec: GenerationSpec, account: Account): { start: string; end: string } {
  const start = account.openDate > spec.dateRange.start ? account.openDate : spec.dateRange.start;
  let end = spec.dateRange.end;
  if (account.status === "closed" && account.closeDate && account.closeDate < end) {
    end = account.closeDate;
  }
  return { start, end: end < start ? start : end };
}

function monthsInclusive(startISO: string, endISO: string): number {
  const s = fromISO(startISO);
  const e = fromISO(endISO);
  return Math.max(
    0,
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()),
  );
}

function generateForDeposit(ctx: Ctx, account: Account, partyId: string, out: Transaction[]): void {
  const { rng, spec } = ctx;
  const { start, end } = activeWindow(spec, account);
  let balance = account.openingBalanceMinor;

  const events: { eff: string; type: TransactionType; signed: number; tags: string[]; backdate: boolean }[] = [];

  const isDormant = account.tags.includes("dormant");
  const months = Math.max(1, monthsInclusive(start, end) + 1);

  // 1) New-account funding deposit first.
  if (account.tags.includes("new_funding") || (account.openingBalanceMinor === 0 && account.openDate >= spec.dateRange.start)) {
    const fund = rng.amountMinor(1000, 15000);
    events.push({ eff: account.openDate > start ? account.openDate : start, type: "deposit", signed: fund, tags: ["new_funding"], backdate: false });
  }

  // 2) Core activity (skipped for dormant accounts).
  const mixCats: TransactionCategory[] = ["ach", "wire", "card", "atm", "check", "transfer"];
  const mixWeights = [
    spec.transactionMix.ach,
    spec.transactionMix.wire,
    spec.transactionMix.card,
    spec.transactionMix.atm,
    spec.transactionMix.check,
    spec.transactionMix.transfer,
  ];
  const coreCount = isDormant ? rng.int(0, 1) : Math.round(spec.avgTransactionsPerAccountPerMonth * months);
  for (let i = 0; i < coreCount; i++) {
    const cat = rng.weightedPick(mixCats, mixWeights);
    const { type, dir } = concreteType(rng, cat);
    const mag = magnitudeMinor(rng, type);
    events.push({ eff: randomDateISO(rng, start, end), type, signed: dir * mag, tags: [], backdate: false });
  }

  // 3) Interest credits for rate-bearing deposit products (monthly).
  if (account.interestRateBps && account.interestRateBps > 0 && !isDormant) {
    for (let m = 1; m <= months; m++) {
      const eff = isoMonthsLater(start, m);
      if (eff > end) break;
      events.push({ eff, type: "interest_credit", signed: 0, tags: [], backdate: false }); // amount set during walk
    }
  }

  // 4) Guaranteed large wire. Modeled as an INCOMING wire (a credit) so its full
  //    amount survives — an outgoing wire could be shrunk by the overdraft floor
  //    below, which would defeat the "above threshold" guarantee. A large
  //    incoming wire is also a canonical AML review trigger.
  if (ctx.guarantee.largeWire.has(account.id)) {
    const amt = spec.largeWireThresholdMinor + rng.amountMinor(2000, 60000);
    events.push({ eff: randomDateISO(rng, start, end), type: "wire_in", signed: amt, tags: ["large_wire"], backdate: false });
  }

  // Sort by effective date for a coherent running balance.
  events.sort((a, b) => (a.eff < b.eff ? -1 : a.eff > b.eff ? 1 : 0));

  const forceNsf = ctx.guarantee.nsf.has(account.id);
  let nsfDone = false;
  // Each account has its own "comfortable minimum" so balances don't all clamp
  // to the same value (e.g. an artificial $5.00 everywhere).
  const floor = rng.amountMinor(50, 2500);

  for (const ev of events) {
    let signed = ev.signed;
    const tags = [...ev.tags];

    // Interest amount depends on current balance.
    if (ev.type === "interest_credit") {
      signed = Math.max(0, Math.round((balance * (account.interestRateBps ?? 0)) / 10000 / 12));
      if (signed === 0) continue;
    }

    // Overdraft injection: let one debit punch the balance negative + fee.
    if (forceNsf && !nsfDone && signed < 0 && balance > 0) {
      signed = -(balance + rng.amountMinor(25, 400)); // overshoot available
      tags.push("nsf", "overdraft");
    } else if (signed < 0 && balance + signed < floor && !tags.includes("large_wire")) {
      // Non-overdraft account: shrink the debit but leave a *varied* cushion so
      // balances don't all settle to the same number. Never shrink a flagged
      // large wire — its amount must stay above threshold.
      const target = floor + rng.amountMinor(0, 500);
      const allowed = Math.max(0, balance - target);
      if (allowed < 100) continue; // nothing meaningful left to spend; skip
      signed = -Math.min(Math.abs(signed), allowed);
    }

    balance += signed;
    const txn = newTxn(ctx, account, partyId, ev.type, signed, balance, ev.eff, tags);
    out.push(txn);

    // Overdraft fee follows the overdraft.
    if (tags.includes("overdraft")) {
      balance -= OD_FEE_MINOR;
      out.push(newTxn(ctx, account, partyId, "fee", -OD_FEE_MINOR, balance, ev.eff, ["nsf_fee"]));
      nsfDone = true;
    }
  }

  // Residual activity after closure (closed-with-residual edge case).
  if (account.status === "closed" && account.tags.includes("closed_residual") && account.closeDate) {
    const resCount = rng.int(1, 2);
    for (let i = 0; i < resCount; i++) {
      const eff = randomDateISO(rng, account.closeDate, spec.dateRange.end);
      const signed = -rng.amountMinor(2, 25); // small residual fee/adjustment
      balance += signed;
      out.push(newTxn(ctx, account, partyId, "fee", signed, balance, eff, ["residual_after_close"]));
    }
  }

  account.currentBalanceMinor = balance;
  account.availableBalanceMinor =
    account.product === "credit_line" && account.creditLimitMinor
      ? account.creditLimitMinor + balance
      : balance;
}

function generateForLoan(ctx: Ctx, account: Account, partyId: string, out: Transaction[]): void {
  const { rng, spec } = ctx;
  const { start, end } = activeWindow(spec, account);
  let balance = account.openingBalanceMinor; // negative = owed
  const rateMonthly = (account.interestRateBps ?? 0) / 10000 / 12;

  // Disbursement for loans originated inside the window.
  if (account.tags.includes("new_funding") && account.originalPrincipalMinor) {
    balance -= account.originalPrincipalMinor;
    out.push(newTxn(ctx, account, partyId, "loan_disbursement", -account.originalPrincipalMinor, balance, account.openDate > start ? account.openDate : start, ["new_funding"]));
  }

  if (account.product === "credit_line") {
    // Revolving: occasional draws and payments, monthly interest on the balance.
    const months = Math.max(1, monthsInclusive(start, end) + 1);
    for (let m = 0; m <= months; m++) {
      const eff = m === 0 ? start : isoMonthsLater(start, m);
      if (eff > end) break;
      // Interest on outstanding (if any owed).
      if (balance < 0) {
        const interest = -Math.round(Math.abs(balance) * rateMonthly);
        if (interest !== 0) {
          balance += interest;
          out.push(newTxn(ctx, account, partyId, "interest_charge", interest, balance, eff, []));
        }
      }
      // A draw (advance) or a payment.
      if (rng.bool(0.5) && account.creditLimitMinor) {
        const room = account.creditLimitMinor + balance; // available credit, cents
        if (room > 5000) {
          const maxDrawDollars = Math.min(5000, Math.floor(room / 100));
          const draw = -rng.amountMinor(1, maxDrawDollars);
          balance += draw;
          out.push(newTxn(ctx, account, partyId, "loan_disbursement", draw, balance, eff, ["credit_draw"]));
        }
      } else if (balance < 0) {
        const pay = Math.min(-balance, rng.amountMinor(100, 1500));
        balance += pay;
        out.push(newTxn(ctx, account, partyId, "loan_payment", pay, balance, eff, []));
      }
    }
  } else {
    // Installment loan: monthly interest + payment.
    const months = Math.max(1, monthsInclusive(start, end) + 1);
    const term = account.termMonths ?? 60;
    const principal = account.originalPrincipalMinor ?? Math.abs(account.openingBalanceMinor);
    const basePayment = Math.round(principal / term) + Math.round(principal * rateMonthly);
    for (let m = 1; m <= months; m++) {
      const eff = isoMonthsLater(start, m);
      if (eff > end || balance >= 0) break;
      const interest = -Math.round(Math.abs(balance) * rateMonthly);
      balance += interest;
      out.push(newTxn(ctx, account, partyId, "interest_charge", interest, balance, eff, []));
      const pay = Math.min(-balance, basePayment);
      if (pay <= 0) break;
      balance += pay;
      out.push(newTxn(ctx, account, partyId, "loan_payment", pay, balance, eff, []));
    }
  }

  account.currentBalanceMinor = balance;
  account.availableBalanceMinor =
    account.product === "credit_line" && account.creditLimitMinor
      ? account.creditLimitMinor + balance
      : balance;
}

function pickGuaranteeTargets(rng: Rng, spec: GenerationSpec, accounts: Account[]) {
  const want = (on: boolean, n: number, eligible: Account[]): Set<string> => {
    const s = new Set<string>();
    if (!on || eligible.length === 0) return s;
    const shuffled = rng.shuffle([...eligible]);
    for (const a of shuffled.slice(0, Math.min(n, eligible.length))) s.add(a.id);
    return s;
  };
  const activeDeposits = accounts.filter(
    (a) => a.status !== "closed" && (a.product === "checking" || a.product === "savings" || a.product === "money_market"),
  );
  const checking = accounts.filter((a) => a.product === "checking" && a.status === "active");
  return {
    nsf: want(spec.edgeCases.nsfOverdraft, 4, checking.length ? checking : activeDeposits),
    largeWire: want(spec.edgeCases.largeWires, 4, activeDeposits),
  };
}

/**
 * Guarantee a few backdated postings exist when requested — a global post-pass
 * so presence never depends on which accounts happened to get activity. Shifts a
 * transaction's posting date several days past its effective date (posting may
 * land after the window end, which is correct for a late/corrected posting).
 */
function ensureBackdated(ctx: Ctx, out: Transaction[]): void {
  const MIN = 3;
  let have = out.reduce((n, t) => n + (t.tags.includes("backdated") ? 1 : 0), 0);
  for (const t of out) {
    if (have >= MIN) break;
    if (t.status !== "posted") continue;
    if (t.tags.includes("backdated") || t.tags.includes("residual_after_close")) continue;
    const eff = fromISO(t.effectiveDate);
    t.postingDate = toISO(addDays(eff, ctx.rng.int(3, 9)));
    t.tags.push("backdated");
    if ((isWeekend(eff) || isHoliday(eff)) && !t.tags.includes("holiday_posting")) {
      t.tags.push("holiday_posting");
    }
    have++;
  }
}

export function generateTransactions(
  rng: Rng,
  spec: GenerationSpec,
  parties: Party[],
  accounts: Account[],
): Transaction[] {
  const out: Transaction[] = [];
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const ctx: Ctx = {
    rng,
    spec,
    seq: { txn: 1 },
    guarantee: pickGuaranteeTargets(rng, spec, accounts),
  };

  for (const account of accounts) {
    const primary = account.owners.find((o) => o.role === "primary")?.partyId ?? account.owners[0].partyId;
    if (!partyById.has(primary)) continue;
    if (
      account.product === "loan_auto" ||
      account.product === "loan_mortgage" ||
      account.product === "loan_personal" ||
      account.product === "credit_line"
    ) {
      generateForLoan(ctx, account, primary, out);
    } else {
      generateForDeposit(ctx, account, primary, out);
    }
  }

  if (spec.edgeCases.backdatedPostings) ensureBackdated(ctx, out);

  return out;
}
