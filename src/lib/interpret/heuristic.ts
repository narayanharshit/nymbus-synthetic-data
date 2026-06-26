/**
 * Deterministic, no-LLM interpreter.
 *
 * This is a real fallback, not a stub: it keyword- and number-parses the
 * consultant's plain-language description into a partial spec. It runs when no
 * ANTHROPIC_API_KEY is configured or the LLM call fails — which means the app
 * generates, validates, and exports end-to-end with zero credentials. The LLM
 * path (llm.ts) produces richer interpretations; this guarantees the floor.
 */

import type { ProductType } from "../domain/types";
import { toISODate } from "../domain/spec";
import type { DeepPartial } from "./merge";
import type { GenerationSpec } from "../domain/spec";

interface Patch {
  patch: DeepPartial<GenerationSpec>;
  notes: string[];
}

const PRODUCT_KEYWORDS: [RegExp, ProductType][] = [
  [/\bchecking\b/, "checking"],
  [/\bsavings?\b/, "savings"],
  [/\bmoney\s*market|mma\b/, "money_market"],
  [/\bcd\b|certificate(s)? of deposit|\bcds\b/, "cd"],
  [/\bauto\s*loan|car\s*loan|vehicle\s*loan/, "loan_auto"],
  [/\bmortgage|home\s*loan/, "loan_mortgage"],
  [/\bpersonal\s*loan|signature\s*loan/, "loan_personal"],
  [/\bline\s*of\s*credit|credit\s*line|heloc|\bloc\b|credit\s*card/, "credit_line"],
];

export function heuristicInterpret(text: string): Patch {
  const t = (text || "").toLowerCase();
  const patch: DeepPartial<GenerationSpec> = {};
  const notes: string[] = ["Interpreted with built-in keyword rules (no LLM key configured)."];
  const edgeCases: DeepPartial<GenerationSpec["edgeCases"]> = {};

  // Institution type
  if (/credit union|\bcu\b|members?\b/.test(t)) {
    patch.institutionType = "credit_union";
  } else if (/community bank|\bbank\b/.test(t)) {
    patch.institutionType = "community_bank";
  }

  // Party count: "about 250 customers", "200 members", "150 clients"
  const countMatch = t.match(/([\d][\d,]*)\s*(customers|members|clients|households|parties|accounts holders|people)/);
  if (countMatch) {
    const n = parseInt(countMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) patch.partyCount = n;
  }

  // Business orientation
  if (/business|commercial|operating account|companies|llc/.test(t)) {
    if (/mostly|primarily|majority|focus(ed)? on (business|commercial)/.test(t)) {
      patch.businessRatio = 0.6;
    } else {
      patch.businessRatio = 0.3;
    }
  }

  // Products
  const products: ProductType[] = [];
  for (const [re, p] of PRODUCT_KEYWORDS) if (re.test(t)) products.push(p);
  if (/\bloans?\b/.test(t) && !products.some((p) => p.startsWith("loan"))) {
    products.push("loan_auto", "loan_personal");
  }
  if (products.length) {
    patch.products = Array.from(new Set(products));
  }

  // Date range from relative phrases
  const range = parseDateRange(t);
  if (range) {
    patch.dateRange = range.range;
    if (range.note) notes.push(range.note);
  } else {
    notes.push("No date range mentioned — defaulted to the last 90 days.");
  }

  // Volume tier
  if (/high[- ]?volume|heavy|busy|lots of (transactions|activity)/.test(t)) {
    patch.avgTransactionsPerAccountPerMonth = 16;
  } else if (/low[- ]?volume|light|quiet|little activity|few transactions/.test(t)) {
    patch.avgTransactionsPerAccountPerMonth = 4;
  }
  const perAcct = t.match(/([\d]+)\s*(transactions|txns?)\s*(per|\/)\s*(account|month)/);
  if (perAcct) patch.avgTransactionsPerAccountPerMonth = parseInt(perAcct[1], 10);

  // Joint ownership
  if (/\bjoint\b|co-?owner|co-?borrower|shared account/.test(t)) {
    edgeCases.jointOwnership = true;
    patch.jointOwnershipRatio = /many|lots|mostly/.test(t) ? 0.35 : 0.2;
  }

  // Edge cases
  if (/overdraft|nsf|insufficient|bounced|returned item/.test(t)) edgeCases.nsfOverdraft = true;
  if (/dormant|inactive|stale account/.test(t)) edgeCases.dormantAccounts = true;
  if (/at (the )?limit|maxed|over[- ]?limit|product limit|near maturity/.test(t)) edgeCases.atLimitAccounts = true;
  if (/backdated|holiday posting|weekend posting|posting delay/.test(t)) edgeCases.backdatedPostings = true;
  if (/new[- ]?account|new funding|newly opened|just opened|de ?novo|onboarding/.test(t)) edgeCases.newAccountFunding = true;
  if (/closed account|closed.*residual|residual activity/.test(t)) edgeCases.closedWithResidual = true;

  // Large wires + threshold
  const wireAmt = t.match(/(wires?|transfers?)[^.]*?(over|above|exceed(?:ing)?|greater than|>)\s*\$?\s*([\d,]+)\s*(k|thousand|million|m)?/);
  if (/large wire|wires? over|high[- ]?dollar wire|wire(s)? (above|over)/.test(t) || wireAmt) {
    edgeCases.largeWires = true;
    if (wireAmt) {
      let dollars = parseInt(wireAmt[3].replace(/,/g, ""), 10);
      const unit = wireAmt[4];
      if (unit === "k" || unit === "thousand") dollars *= 1_000;
      if (unit === "m" || unit === "million") dollars *= 1_000_000;
      if (!Number.isNaN(dollars) && dollars > 0) {
        patch.largeWireThresholdMinor = dollars * 100;
        notes.push(`Large-wire review threshold set to $${dollars.toLocaleString()}.`);
      }
    }
  }

  if (Object.keys(edgeCases).length) patch.edgeCases = edgeCases;

  if (!countMatch) notes.push("No customer count found — using the default scale (edit on the next screen).");
  if (!products.length) notes.push("No specific products named — using a standard retail product set.");

  return { patch, notes };
}

function parseDateRange(t: string): { range: { start: string; end: string }; note?: string } | null {
  const end = new Date();
  const start = new Date();

  const m = t.match(/(last|past|previous)?\s*(\d+)\s*(day|week|month|year)s?/);
  if (m) {
    const n = parseInt(m[2], 10);
    const unit = m[3];
    const days = unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
    start.setDate(start.getDate() - days);
    return { range: { start: toISODate(start), end: toISODate(end) }, note: `Date range read as the last ${n} ${unit}${n > 1 ? "s" : ""}.` };
  }
  if (/last quarter|past quarter|this quarter|q[1-4]\b/.test(t)) {
    start.setDate(start.getDate() - 90);
    return { range: { start: toISODate(start), end: toISODate(end) }, note: "Date range read as a 90-day quarter." };
  }
  if (/last year|past year|this year|ytd/.test(t)) {
    start.setDate(start.getDate() - 365);
    return { range: { start: toISODate(start), end: toISODate(end) }, note: "Date range read as the last year." };
  }
  if (/last month|past month/.test(t)) {
    start.setDate(start.getDate() - 30);
    return { range: { start: toISODate(start), end: toISODate(end) }, note: "Date range read as the last month." };
  }
  return null;
}
