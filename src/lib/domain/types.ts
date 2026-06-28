/**
 * Core domain model for the synthetic banking dataset.
 *
 * These are the *output* shapes the deterministic engine produces. The user
 * never types these directly — they come out of generation and are what we
 * validate, preview, and export. All monetary fields are integer minor units
 * (cents); see ./money.ts for the rationale.
 */

import type { GenerationSpec } from "./spec";

export const INSTITUTION_TYPES = ["community_bank", "credit_union"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

/** A deposit-account holder is a "customer"; a CU calls them a "member". */
export type PartyType = "individual" | "business";

export interface Address {
  line1: string;
  city: string;
  state: string; // 2-letter USPS code
  zip: string;
}

export interface Party {
  id: string; // e.g. PTY-000001
  type: PartyType;

  // Individuals
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // ISO date (YYYY-MM-DD)

  // Businesses
  businessName?: string;

  // Common
  /** Synthetic, deliberately-invalid-but-shaped tax id. Never a real SSN/EIN. */
  taxId: string;
  taxIdType: "ssn" | "ein";
  email: string;
  phone: string;
  address: Address;
  /** Relationship start date (ISO). */
  memberSince: string;
}

export const PRODUCT_TYPES = [
  "checking",
  "savings",
  "money_market",
  "cd",
  "loan_auto",
  "loan_mortgage",
  "loan_personal",
  "credit_line",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** Product families with a debit (deposit) balance convention. */
export const DEPOSIT_PRODUCTS: ProductType[] = [
  "checking",
  "savings",
  "money_market",
  "cd",
];

/** Product families that represent money owed by the customer. */
export const LOAN_PRODUCTS: ProductType[] = [
  "loan_auto",
  "loan_mortgage",
  "loan_personal",
  "credit_line",
];

export type AccountStatus = "active" | "dormant" | "closed" | "frozen";

export interface AccountOwner {
  partyId: string;
  role: "primary" | "joint";
}

export interface Account {
  id: string; // e.g. ACC-000001
  /** Full synthetic account number. UI masks all but the last 4. */
  accountNumber: string;
  product: ProductType;
  productName: string; // marketing-style name, e.g. "Premier Checking"
  status: AccountStatus;
  owners: AccountOwner[]; // exactly one primary, optional joint owner(s)
  openDate: string; // ISO
  closeDate?: string; // ISO, when status === "closed"
  currency: "USD";

  /**
   * Balance at openDate, before any modeled transactions (usually 0 for
   * deposits; the negative principal for loans is applied as the first txn).
   * Integer cents.
   */
  openingBalanceMinor: number;
  /**
   * Universal invariant: currentBalanceMinor === openingBalanceMinor + Σ txn.amountMinor.
   * For loans this is negative (money owed); UI displays the absolute "owed" figure.
   * Integer cents.
   */
  currentBalanceMinor: number;
  availableBalanceMinor: number; // current minus holds; here == current unless dormant/frozen

  // Product attributes (present where they make sense for the product)
  interestRateBps?: number; // basis points: 425 === 4.25%
  termMonths?: number; // CDs and loans
  minimumBalanceMinor?: number; // deposit minimums
  creditLimitMinor?: number; // credit_line
  originalPrincipalMinor?: number; // loans
  maturityDate?: string; // CDs and loans (ISO)
  branch?: string;

  /** Edge-case markers applied to this account, e.g. "dormant", "at_limit". */
  tags: string[];
}

export type TransactionCategory =
  | "ach"
  | "wire"
  | "card"
  | "atm"
  | "check"
  | "transfer"
  | "fee"
  | "interest"
  | "loan"
  | "deposit";

export type TransactionType =
  // ACH
  | "ach_credit"
  | "ach_debit"
  // Wire
  | "wire_in"
  | "wire_out"
  // Card / POS
  | "card_pos"
  // ATM
  | "atm_withdrawal"
  | "atm_deposit"
  // Check
  | "check_deposit"
  | "check_paid"
  // Internal transfer
  | "transfer_in"
  | "transfer_out"
  // Fees & interest
  | "fee"
  | "interest_credit" // interest paid into a deposit account
  | "interest_charge" // interest accrued on a loan (increases amount owed)
  // Loans
  | "loan_disbursement"
  | "loan_payment"
  // Generic / new-account funding
  | "deposit"
  | "withdrawal";

export type TransactionStatus = "posted" | "pending" | "returned";

export interface Transaction {
  id: string; // e.g. TXN-00000001
  accountId: string; // FK -> Account.id
  partyId: string; // FK -> Party.id (the owning/initiating party)
  type: TransactionType;
  category: TransactionCategory;

  /**
   * Signed amount relative to the account balance, integer cents.
   * Positive = credit/increase; negative = debit/decrease.
   * Loans: disbursement & interest_charge are negative (more owed);
   * loan_payment is positive (less owed).
   */
  amountMinor: number;
  /** Running balance immediately after this transaction posts. Integer cents. */
  balanceAfterMinor: number;

  effectiveDate: string; // value date (ISO)
  postingDate: string; // ledger date (ISO); >= effectiveDate except backdated edge cases

  description: string;
  merchant?: string;
  mcc?: string; // merchant category code (card txns)
  counterpartyName?: string;
  counterpartyAccount?: string; // masked
  channel?: "online" | "branch" | "atm" | "pos" | "mobile" | "ach_network" | "fedwire";
  reference: string; // trace/reference id
  status: TransactionStatus;

  /** Edge-case markers, e.g. "nsf", "overdraft", "large_wire", "backdated". */
  tags: string[];
}

export interface Institution {
  type: InstitutionType;
  name: string;
  /** Synthetic but ABA-checksum-valid 9-digit routing number. Not a real bank. */
  routingNumber: string;
}

export interface DatasetMeta {
  /** Short reference id for this run (e.g. RUN-4Z9KQ1). Reproduce with seed + spec. */
  runId: string;
  generatedAt: string; // ISO timestamp
  seed: number;
  counts: {
    parties: number;
    accounts: number;
    transactions: number;
  };
  spec: GenerationSpec;
}

export interface Dataset {
  meta: DatasetMeta;
  institution: Institution;
  parties: Party[];
  accounts: Account[];
  transactions: Transaction[];
}
