/**
 * The GenerationSpec is the structured contract at the center of the app.
 *
 *   fuzzy input ──(LLM or heuristic)──▶ GenerationSpec ──(deterministic engine)──▶ Dataset
 *
 * It is intentionally small, explicit, and fully defaulted: any partial object
 * (a sloppy LLM response, a one-line heuristic guess) normalizes into a valid,
 * generatable spec. This is also exactly what the consultant reviews and edits
 * on the CONFIRM screen before any bulk data is produced.
 */

import { z } from "zod";
import { INSTITUTION_TYPES, PRODUCT_TYPES } from "./types";

/** Transaction families the consultant can dial up or down in the mix. */
export const TRANSACTION_CATEGORIES = [
  "ach",
  "wire",
  "card",
  "atm",
  "check",
  "transfer",
] as const;
export type TransactionMixCategory = (typeof TRANSACTION_CATEGORIES)[number];

/** Guardrails that keep generation fast and the browser responsive. */
export const LIMITS = {
  maxParties: 2000,
  maxTransactions: 60000,
  maxMonths: 36,
} as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** A 90-day window ending today — used when the input gives no date range. */
export function defaultDateRange(today = new Date()): { start: string; end: string } {
  const end = today;
  const start = new Date(today);
  start.setDate(start.getDate() - 90);
  return { start: toISODate(start), end: toISODate(end) };
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const EdgeCasesSchema = z
  .object({
    /** NSF / overdraft events: debits that push a checking account negative + a fee. */
    nsfOverdraft: z.boolean().default(false),
    /** Accounts with no customer-initiated activity for a long stretch. */
    dormantAccounts: z.boolean().default(false),
    /** Accounts sitting at a product limit (min balance, credit limit, CD maturity). */
    atLimitAccounts: z.boolean().default(false),
    /** Transactions whose posting date trails the effective date (weekend/holiday). */
    backdatedPostings: z.boolean().default(false),
    /** Wires above the review threshold (e.g. > $10,000). */
    largeWires: z.boolean().default(false),
    /** Brand-new accounts whose first activity is a funding deposit. */
    newAccountFunding: z.boolean().default(false),
    /** Closed accounts that still carry a residual transaction or two. */
    closedWithResidual: z.boolean().default(false),
    /** At least some deposit accounts held jointly by two parties. */
    jointOwnership: z.boolean().default(false),
  })
  .prefault({});

export type EdgeCases = z.infer<typeof EdgeCasesSchema>;

export const GenerationSpecSchema = z.object({
  institutionType: z.enum(INSTITUTION_TYPES).default("community_bank"),
  /** Optional name; the engine invents a plausible one if omitted. */
  institutionName: z.string().trim().min(1).max(80).optional(),

  /** Number of customers / members (primary scale knob). */
  partyCount: z.number().int().min(1).max(LIMITS.maxParties).default(50),
  /** Fraction of parties that are businesses (0–1). */
  businessRatio: z.number().min(0).max(1).default(0.15),
  /** Average deposit/loan accounts per party. */
  avgAccountsPerParty: z.number().min(1).max(6).default(1.6),
  /** Fraction of deposit accounts that also have a joint owner (0–1). */
  jointOwnershipRatio: z.number().min(0).max(1).default(0.18),

  /** Products in scope. The engine only ever opens accounts of these types. */
  products: z
    .array(z.enum(PRODUCT_TYPES))
    .min(1)
    .default(["checking", "savings", "cd", "loan_auto", "credit_line"]),

  dateRange: z
    .object({ start: isoDate, end: isoDate })
    .default(() => defaultDateRange()),

  /** Volume knob: average customer-initiated transactions per account per month. */
  avgTransactionsPerAccountPerMonth: z.number().min(0).max(120).default(8),

  /** Relative weights for transaction families (need not sum to anything). */
  transactionMix: z
    .object({
      ach: z.number().min(0).default(30),
      wire: z.number().min(0).default(4),
      card: z.number().min(0).default(34),
      atm: z.number().min(0).default(10),
      check: z.number().min(0).default(8),
      transfer: z.number().min(0).default(14),
    })
    .prefault({}),

  /** Dollar threshold (in cents) above which a wire is flagged for review. */
  largeWireThresholdMinor: z.number().int().min(0).default(1_000_000),

  edgeCases: EdgeCasesSchema,

  /** Seed for the PRNG. Same seed + same spec ⇒ byte-identical dataset. */
  seed: z.number().int().default(1),
});

export type GenerationSpec = z.infer<typeof GenerationSpecSchema>;

/** A fully-defaulted baseline spec. */
export const DEFAULT_SPEC: GenerationSpec = GenerationSpecSchema.parse({});

/**
 * Normalize any partial/untrusted object into a valid GenerationSpec, applying
 * defaults and clamping. Returns the spec plus any human-readable notes about
 * adjustments that were made (shown to the consultant on the CONFIRM screen).
 */
export function normalizeSpec(input: unknown): {
  spec: GenerationSpec;
  notes: string[];
} {
  const notes: string[] = [];
  const parsed = GenerationSpecSchema.safeParse(input ?? {});
  let spec: GenerationSpec;

  if (parsed.success) {
    spec = parsed.data;
  } else {
    // Be forgiving: merge field-by-field over defaults so one bad field
    // never sinks the whole interpretation.
    notes.push(
      "Some fields could not be read from the interpreter and were set to safe defaults.",
    );
    spec = mergeOverDefaults(input);
  }

  // Coherent date range
  if (new Date(spec.dateRange.start) > new Date(spec.dateRange.end)) {
    notes.push("Start date was after end date; the two were swapped.");
    spec.dateRange = {
      start: spec.dateRange.end,
      end: spec.dateRange.start,
    };
  }
  const months = monthsBetween(spec.dateRange.start, spec.dateRange.end);
  if (months > LIMITS.maxMonths) {
    notes.push(
      `Date range capped at ${LIMITS.maxMonths} months to keep generation responsive.`,
    );
    const start = new Date(spec.dateRange.end);
    start.setMonth(start.getMonth() - LIMITS.maxMonths);
    spec.dateRange.start = toISODate(start);
  }

  // Volume ceiling (keeps in-browser generation responsive).
  const est = estimateTransactionCount(spec);
  if (est > LIMITS.maxTransactions) {
    const factor = LIMITS.maxTransactions / est;
    spec.avgTransactionsPerAccountPerMonth = Math.max(
      1,
      Math.floor(spec.avgTransactionsPerAccountPerMonth * factor),
    );
    notes.push(
      `Estimated ~${est.toLocaleString()} transactions is above the ${LIMITS.maxTransactions.toLocaleString()} ceiling, ` +
        `so transactions per account were scaled down to ${spec.avgTransactionsPerAccountPerMonth}/month. ` +
        `The final dataset stays at or below the ceiling.`,
    );
  }

  // Joint ownership is driven solely by its ratio (a single UI control), so the
  // internal edge flag is derived from it and a toggle/slider can never disagree.
  spec.edgeCases.jointOwnership = spec.jointOwnershipRatio > 0;

  return { spec, notes };
}

function mergeOverDefaults(input: unknown): GenerationSpec {
  const base: Record<string, unknown> = { ...DEFAULT_SPEC };
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const candidate = { ...base, [k]: v };
      const r = GenerationSpecSchema.safeParse(candidate);
      if (r.success) base[k] = v;
    }
  }
  return GenerationSpecSchema.parse(base);
}

export function monthsBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days / 30.44);
}

const LOAN_PRODUCT_SET = new Set<string>(["loan_auto", "loan_mortgage", "loan_personal", "credit_line"]);
const ESTIMATE_WEIGHTS: Record<string, number> = {
  checking: 32, savings: 24, money_market: 8, cd: 8,
  credit_line: 10, loan_auto: 7, loan_personal: 5, loan_mortgage: 3,
};

/**
 * Up-front estimate of how many transactions a spec will produce. Deposit and
 * loan accounts behave very differently — a deposit account gets ~avgTxns/month
 * of activity plus monthly interest/funding, while a loan/credit line gets ~2
 * per month (interest + payment). We split the account pool by product weight
 * (with a primary-deposit bias, since each party's first account is a deposit
 * when available) and estimate each part. Labeled "≈" in the UI — not exact.
 */
export function estimateTransactionCount(spec: GenerationSpec): number {
  const totalAccounts = spec.partyCount * spec.avgAccountsPerParty;
  const months = monthsBetween(spec.dateRange.start, spec.dateRange.end) + 1;

  const hasDeposit = spec.products.some((p) => !LOAN_PRODUCT_SET.has(p));
  let wLoan = 0;
  let wAll = 0;
  for (const p of spec.products) {
    const w = ESTIMATE_WEIGHTS[p] ?? 5;
    wAll += w;
    if (LOAN_PRODUCT_SET.has(p)) wLoan += w;
  }
  let loanFrac = wAll ? wLoan / wAll : 0;
  if (hasDeposit) loanFrac *= 0.7; // first account per party is a deposit

  const depositAccts = totalAccounts * (1 - loanFrac);
  const loanAccts = totalAccounts * loanFrac;
  const depositTxns = depositAccts * months * (spec.avgTransactionsPerAccountPerMonth + 1.2);
  const loanTxns = loanAccts * months * 2;
  return Math.round(depositTxns + loanTxns);
}
