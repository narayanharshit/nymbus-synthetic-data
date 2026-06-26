/**
 * Client-archetype presets. Each is a *partial* spec that the consultant can
 * load in one click and then tweak. They are normalized through normalizeSpec()
 * on apply, so every preset is guaranteed to be valid and generatable.
 *
 * The `promptHint` doubles as a realistic example of the plain-language input a
 * consultant might type for that archetype — useful for the demo and the empty
 * state.
 */

import type { GenerationSpec } from "./spec";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface ArchetypePreset {
  id: string;
  emoji: string;
  label: string;
  blurb: string;
  /** Plain-language description matching this archetype (also a great demo input). */
  promptHint: string;
  spec: DeepPartial<GenerationSpec>;
}

export const PRESETS: ArchetypePreset[] = [
  {
    id: "community_retail",
    emoji: "🏦",
    label: "Small community bank — retail-heavy",
    blurb:
      "Mostly consumer checking & savings, debit-card driven, a few auto loans and credit lines.",
    promptHint:
      "Small community bank, mostly retail consumers. About 150 customers with checking, savings, a CD product, some auto loans and a few credit lines. Lots of debit card and ACH activity over the last 3 months. Include some overdrafts and new-account funding.",
    spec: {
      institutionType: "community_bank",
      partyCount: 150,
      businessRatio: 0.1,
      avgAccountsPerParty: 1.7,
      products: ["checking", "savings", "cd", "loan_auto", "credit_line"],
      avgTransactionsPerAccountPerMonth: 10,
      transactionMix: { card: 40, ach: 28, atm: 12, check: 6, transfer: 12, wire: 2 },
      edgeCases: { nsfOverdraft: true, newAccountFunding: true },
    },
  },
  {
    id: "credit_union_lending",
    emoji: "🤝",
    label: "Credit union — strong lending",
    blurb:
      "Member-owned, heavy on auto/personal/mortgage loans, lots of joint accounts.",
    promptHint:
      "Credit union with about 200 members and a strong lending book — auto loans, personal loans, and some mortgages, plus checking and savings. Many accounts are jointly owned. Show payroll direct deposits and loan payments over six months. Include a few accounts at their credit limit.",
    spec: {
      institutionType: "credit_union",
      partyCount: 200,
      businessRatio: 0.05,
      avgAccountsPerParty: 2.2,
      jointOwnershipRatio: 0.35,
      products: [
        "checking",
        "savings",
        "loan_auto",
        "loan_personal",
        "loan_mortgage",
        "credit_line",
      ],
      avgTransactionsPerAccountPerMonth: 8,
      transactionMix: { ach: 34, card: 30, atm: 10, check: 8, transfer: 16, wire: 2 },
      edgeCases: { jointOwnership: true, atLimitAccounts: true, newAccountFunding: true },
    },
  },
  {
    id: "business_banking",
    emoji: "🏢",
    label: "Business & commercial focus",
    blurb:
      "Majority business parties, money-market and operating accounts, wires and large dollars.",
    promptHint:
      "Community bank with a commercial focus — about 80 business customers plus some owners as individuals. Operating checking, money market, lines of credit. Frequent wires, some above $10,000 that need review, and ACH payroll runs. Last quarter.",
    spec: {
      institutionType: "community_bank",
      partyCount: 90,
      businessRatio: 0.65,
      avgAccountsPerParty: 2.0,
      products: ["checking", "money_market", "credit_line", "loan_personal"],
      avgTransactionsPerAccountPerMonth: 14,
      transactionMix: { ach: 36, wire: 16, card: 18, check: 14, transfer: 14, atm: 2 },
      largeWireThresholdMinor: 1_000_000,
      edgeCases: { largeWires: true, newAccountFunding: true, jointOwnership: true },
    },
  },
  {
    id: "bsa_exceptions",
    emoji: "🔎",
    label: "BSA / AML & exceptions testing",
    blurb:
      "Every edge case on — overdrafts, dormancy, large wires, backdating, closed-with-residual.",
    promptHint:
      "I need a stress dataset for exception and compliance testing. Mix of consumer and business. Turn on overdrafts/NSF, dormant accounts, large wires over $10k, backdated/holiday postings, and closed accounts that still have residual activity. Six months of data, moderate volume.",
    spec: {
      institutionType: "community_bank",
      partyCount: 120,
      businessRatio: 0.3,
      avgAccountsPerParty: 1.9,
      products: ["checking", "savings", "money_market", "credit_line", "loan_auto"],
      avgTransactionsPerAccountPerMonth: 9,
      transactionMix: { ach: 28, wire: 12, card: 26, atm: 10, check: 10, transfer: 14 },
      edgeCases: {
        nsfOverdraft: true,
        dormantAccounts: true,
        atLimitAccounts: true,
        backdatedPostings: true,
        largeWires: true,
        newAccountFunding: true,
        closedWithResidual: true,
        jointOwnership: true,
      },
    },
  },
  {
    id: "de_novo",
    emoji: "🌱",
    label: "De novo branch — mostly new accounts",
    blurb:
      "Small, recent, lots of new-account funding and first-transaction activity.",
    promptHint:
      "Brand-new branch that just opened. Around 60 customers, almost all accounts opened in the last 45 days with initial funding deposits. Checking and savings mainly, a couple of starter credit lines. Light transaction history so far.",
    spec: {
      institutionType: "community_bank",
      partyCount: 60,
      businessRatio: 0.15,
      avgAccountsPerParty: 1.4,
      products: ["checking", "savings", "credit_line"],
      avgTransactionsPerAccountPerMonth: 6,
      transactionMix: { card: 34, ach: 30, atm: 14, check: 4, transfer: 16, wire: 2 },
      edgeCases: { newAccountFunding: true },
    },
  },
];

export function getPreset(id: string): ArchetypePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
