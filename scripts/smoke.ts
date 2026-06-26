/**
 * Smoke test — runs three realistic consultant inputs end-to-end through the
 * exact same library the app uses, with NO API key (the deterministic heuristic
 * interpreter path). Proves: fuzzy input -> spec -> deterministic dataset ->
 * validation passes -> export works.
 *
 *   npm run smoke
 *
 * Exits non-zero if any dataset fails validation.
 */

import { heuristicInterpret } from "../src/lib/interpret/heuristic";
import { finalizeInterpretation } from "../src/lib/interpret/merge";
import { generateDataset } from "../src/lib/generate/generator";
import { validateDataset } from "../src/lib/validate/validate";
import { summarizeDataset } from "../src/lib/summary";
import { allExportFiles } from "../src/lib/export/exporters";
import type { GenerationSpec, EdgeCases } from "../src/lib/domain/spec";

const CASES: { name: string; text: string }[] = [
  {
    name: "CLEAN — well-specified",
    text:
      "Community bank, retail focused. About 120 customers with checking and savings accounts, plus some auto loans and a few credit lines. Show the last 90 days of activity with lots of debit card and ACH transactions, and include some new-account funding deposits.",
  },
  {
    name: "MESSY — vague & informal",
    text:
      "credit union, couple hundred members, the usual stuff — savings, checking, some loans and cards, lots of joint accounts. past 6 months, fairly busy. oh and throw in a few overdrafts",
  },
  {
    name: "EDGE-HEAVY — compliance test set",
    text:
      "Community bank, 150 customers. Checking, savings, money market, credit lines and auto loans. I need a compliance/BSA test set: include overdrafts/NSF, dormant accounts, large wires over $10,000, backdated and holiday postings, new-account funding, and closed accounts with residual activity. Last 6 months, moderate volume.",
  },
];

function enabledEdges(ec: EdgeCases): string[] {
  return (Object.keys(ec) as (keyof EdgeCases)[]).filter((k) => ec[k]);
}

function specLine(s: GenerationSpec): string {
  return [
    `institution=${s.institutionType}`,
    `customers=${s.partyCount}`,
    `business=${Math.round(s.businessRatio * 100)}%`,
    `products=[${s.products.join(", ")}]`,
    `window=${s.dateRange.start}->${s.dateRange.end}`,
    `txn/acct/mo=${s.avgTransactionsPerAccountPerMonth}`,
    `edges=[${enabledEdges(s.edgeCases).join(", ") || "none"}]`,
  ].join("\n      ");
}

let allPassed = true;

for (const c of CASES) {
  console.log("\n" + "=".repeat(78));
  console.log(`CASE: ${c.name}`);
  console.log("=".repeat(78));
  console.log(`INPUT: "${c.text}"`);

  const { patch, notes } = heuristicInterpret(c.text);
  const { spec, notes: allNotes } = finalizeInterpretation({}, patch, notes, "heuristic");

  console.log("\n  INTERPRETED SPEC:");
  console.log("      " + specLine(spec));
  console.log("\n  INTERPRETER NOTES:");
  for (const n of allNotes) console.log("      • " + n);

  const ds = generateDataset({ ...spec, seed: 42 });
  const v = validateDataset(ds);
  const summary = summarizeDataset(ds);

  console.log("\n  GENERATED:");
  console.log(`      ${summary.headline.replace(/\n/g, " ")}`);
  console.log(
    `      counts: ${ds.meta.counts.parties} parties, ${ds.meta.counts.accounts} accounts, ${ds.meta.counts.transactions} transactions`,
  );

  const presentEdges = Object.entries(summary.stats.edgeCounts).filter(([, n]) => n > 0);
  if (presentEdges.length) {
    console.log("      edge cases present: " + presentEdges.map(([k, n]) => `${n} ${k}`).join(", "));
  }

  console.log("\n  VALIDATION:");
  console.log(`      overall: ${v.ok ? "✓ PASS" : "✕ FAIL"}`);
  for (const check of v.checks) {
    const mark = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✕";
    console.log(`      ${mark} ${check.label} — ${check.detail}`);
  }

  // Spot-check: re-derive one account balance from its transactions independently.
  const sample = ds.accounts.find((a) => ds.transactions.some((t) => t.accountId === a.id));
  if (sample) {
    const sum = ds.transactions
      .filter((t) => t.accountId === sample.id)
      .reduce((acc, t) => acc + t.amountMinor, 0);
    const recomputed = sample.openingBalanceMinor + sum;
    const ok = recomputed === sample.currentBalanceMinor;
    console.log(
      `\n  INDEPENDENT RECONCILIATION CHECK (account ${sample.id}): ` +
        `opening ${sample.openingBalanceMinor} + Σtxns ${sum} = ${recomputed} ` +
        `vs stored ${sample.currentBalanceMinor} -> ${ok ? "MATCH ✓" : "MISMATCH ✕"}`,
  );
    if (!ok) allPassed = false;
  }

  const files = allExportFiles(ds);
  console.log("\n  EXPORTS:");
  for (const f of files) console.log(`      ${f.name} (${f.content.length.toLocaleString()} bytes)`);

  if (!v.ok) allPassed = false;
}

console.log("\n" + "=".repeat(78));
console.log(allPassed ? "RESULT: ✓ ALL CASES PASSED" : "RESULT: ✕ SOME CASES FAILED");
console.log("=".repeat(78) + "\n");
process.exit(allPassed ? 0 : 1);
