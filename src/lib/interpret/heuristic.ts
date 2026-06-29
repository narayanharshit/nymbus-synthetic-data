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
import type { Confidence, DeepPartial } from "./merge";
import type { GenerationSpec } from "../domain/spec";

interface Patch {
  patch: DeepPartial<GenerationSpec>;
  notes: string[];
  confidence: Confidence;
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
  const notes: string[] = [];
  const edgeCases: DeepPartial<GenerationSpec["edgeCases"]> = {};
  let signals = 0; // how many distinct things we actually recognized

  // Institution type
  if (/credit union|\bcu\b|members?\b/.test(t)) {
    patch.institutionType = "credit_union";
    signals++;
  } else if (/community bank|\bbank\b/.test(t)) {
    patch.institutionType = "community_bank";
    signals++;
  }

  // Party count: "about 250 customers", "200 members", "150 clients"
  const countMatch = t.match(/([\d][\d,]*)\s*(customers|members|clients|households|parties|accounts holders|people)/);
  if (countMatch) {
    const n = parseInt(countMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) {
      patch.partyCount = n;
      signals++;
    }
  }

  // Business orientation (and an institution-aware default when unstated).
  // Intensifiers like "mostly" only imply a business majority when they sit next
  // to "business/commercial" — "mostly retail" must not read as business-heavy,
  // and "a few business accounts" should read as a minority.
  const businessMentioned = /business|commercial|operating account|companies|\bllc\b/.test(t);
  const businessMajority =
    /\b(mostly|primarily|mainly|chiefly|majority|heavy on)\b[^.]{0,40}\b(business|commercial)\b/.test(t) ||
    /\b(business|commercial)\b[^.]{0,25}\b(focused|focus|heavy|majority|primary|driven)\b/.test(t) ||
    /focus(ed)? on (business|commercial)/.test(t);
  const businessMinor =
    /\b(a few|some|handful|couple|few|small number of)\b[^.]{0,30}\b(business|commercial|operating)\b/.test(t);
  if (businessMajority) {
    patch.businessRatio = 0.6;
    signals++;
  } else if (businessMinor) {
    patch.businessRatio = 0.2;
    signals++;
  } else if (businessMentioned) {
    patch.businessRatio = 0.3;
    signals++;
  } else if (patch.institutionType) {
    // Credit unions are member/consumer-heavy; community banks carry a few more businesses.
    patch.businessRatio = patch.institutionType === "credit_union" ? 0.04 : 0.12;
  }

  // Products
  const products: ProductType[] = [];
  for (const [re, p] of PRODUCT_KEYWORDS) if (re.test(t)) products.push(p);

  // Loan types are often listed with a shared noun ("auto and personal loans"),
  // which the strict "<type> loan" patterns above miss. When the text is clearly
  // about lending, infer the types from nearby keywords.
  if (/\bloans?\b|\blending\b|\bfinanc(e|ing)\b|\bborrow/.test(t)) {
    if (/\bauto\b|\bcar\b|\bvehicle\b/.test(t)) products.push("loan_auto");
    if (/\bpersonal\b|\bsignature\b/.test(t)) products.push("loan_personal");
    if (/\bmortgage|home\s*loan/.test(t)) products.push("loan_mortgage");
  }
  // A bare "loans" with no type named: assume the two most common consumer loans.
  if (/\bloans?\b/.test(t) && !products.some((p) => p.startsWith("loan"))) {
    products.push("loan_auto", "loan_personal");
  }
  // Every retail institution offers somewhere to deposit; if only lending was
  // named, add the standard deposit pair so the dataset isn't loan-only.
  const deposits: ProductType[] = ["checking", "savings", "money_market", "cd"];
  if (products.length && !products.some((p) => deposits.includes(p))) {
    products.unshift("checking", "savings");
    notes.push("Added checking and savings as standard deposit products since only lending was mentioned.");
  }
  if (products.length) {
    patch.products = Array.from(new Set(products));
    signals++;
  }

  // Date range from relative phrases
  const range = parseDateRange(t);
  if (range) {
    patch.dateRange = range.range;
    if (range.note) notes.push(range.note);
    signals++;
  } else {
    notes.push("No date range mentioned — defaulted to the last 90 days.");
  }

  // Volume tier
  if (/high[- ]?volume|heavy|busy|lots of (transactions|activity)/.test(t)) {
    patch.avgTransactionsPerAccountPerMonth = 16;
    signals++;
  } else if (/low[- ]?volume|light|quiet|little activity|few transactions/.test(t)) {
    patch.avgTransactionsPerAccountPerMonth = 4;
    signals++;
  }
  const perAcct = t.match(/([\d]+)\s*(transactions|txns?)\s*(per|\/)\s*(account|month)/);
  if (perAcct) {
    patch.avgTransactionsPerAccountPerMonth = parseInt(perAcct[1], 10);
    signals++;
  }

  // Joint ownership is a single magnitude control (the ratio), not a toggle.
  if (/\bjoint\b|co-?owner|co-?borrower|shared account/.test(t)) {
    patch.jointOwnershipRatio = /many|lots|mostly/.test(t) ? 0.35 : 0.2;
    signals++;
  }

  // Edge cases
  let edgeFound = false;
  if (/overdraft|\bnsf\b|insufficient|bounced|returned item/.test(t)) { edgeCases.nsfOverdraft = true; edgeFound = true; }
  if (/dormant|inactive|stale account/.test(t)) { edgeCases.dormantAccounts = true; edgeFound = true; }
  if (/at (the )?limit|maxed|over[- ]?limit|product limit|near maturity/.test(t)) { edgeCases.atLimitAccounts = true; edgeFound = true; }
  if (/backdated|holiday posting|weekend posting|posting delay/.test(t)) { edgeCases.backdatedPostings = true; edgeFound = true; }
  if (/new[- ]?account|new funding|newly opened|just opened|de ?novo|onboarding/.test(t)) { edgeCases.newAccountFunding = true; edgeFound = true; }
  if (/closed account|closed.*residual|residual activity/.test(t)) { edgeCases.closedWithResidual = true; edgeFound = true; }

  // Large wires + threshold
  const wireAmt = t.match(/(wires?|transfers?)[^.]*?(over|above|exceed(?:ing)?|greater than|>)\s*\$?\s*([\d,]+)\s*(k|thousand|million|m)?/);
  if (/large wire|wires? over|high[- ]?dollar wire|wire(s)? (above|over)/.test(t) || wireAmt) {
    edgeCases.largeWires = true;
    edgeFound = true;
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
  if (edgeFound) signals++;

  if (Object.keys(edgeCases).length) patch.edgeCases = edgeCases;

  if (!countMatch) notes.push("No customer count found — using the default scale (edit on the next screen).");
  if (!products.length) notes.push("No specific products named — using a standard retail product set.");

  // Calibrated confidence: did we actually understand the input?
  const confidence: Confidence = signals === 0 ? "low" : signals <= 2 ? "medium" : "high";
  if (confidence === "low") {
    notes.unshift(
      "⚠️ I couldn't confidently understand that description — I matched no recognizable banking details, " +
        "so everything below is a default. Please review carefully, or rephrase and try again.",
    );
  } else {
    notes.unshift("Interpreted with built-in keyword rules (no LLM key configured).");
  }

  return { patch, notes, confidence };
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
