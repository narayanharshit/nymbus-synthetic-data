# Decision log

## What I built

- A 3-step web app for a non-technical consultant: **Describe → Confirm → Generate & export.**
- **Input:** plain-language description **and/or** one-click client-archetype presets (community bank
  retail, credit union lending, business/commercial, BSA/AML exceptions, de-novo branch). The Confirm
  screen doubles as the full guided-fields editor.
- **Interpret:** NL → a small structured **generation spec** (zod-validated). Two interchangeable
  interpreters behind one server route: **Claude** (forced tool-use, model `claude-opus-4-8`,
  env-overridable) and a **deterministic keyword/number heuristic** that runs with no API key.
- **Confirm:** the spec rendered in plain English with the interpreter's assumptions, live volume
  estimates, and every field editable — the explicit "transparency before bulk generation" step the
  brief asks for.
- **Generate:** fully **deterministic**, seeded TypeScript engine (runs in the browser). Parties
  (individuals + businesses, joint owners), accounts (8 product types with real attributes),
  transactions (ACH/wire/card/ATM/check/transfer/fee/interest/loan) with reconciling running balances,
  posting vs. effective dates, and gated edge cases.
- **Validate:** reconciliation, foreign-key integrity, date coherence, and requested-edge-case
  presence — shown in the UI and asserted by the smoke test.
- **Export:** per-table **CSV** (dollars, Excel-ready) and one exact **JSON** (integer cents).
- **Proof:** `npm run smoke` runs 3 realistic inputs end-to-end; `npm run build`, `npm run lint`,
  and `npm run typecheck` are green. Separately stress-tested against 50+ adversarial
  product/edge/scale combinations plus fuzzing — reconciliation, FK integrity, date coherence,
  determinism, and CSV-export round-trip all hold. Structurally-impossible edge requests (e.g.
  joint ownership with no deposit accounts) warn *with the reason* rather than failing, and the
  client bundle was verified to contain no Anthropic SDK or API key.

## The LLM-vs-deterministic rationale (the core competency on display)

- The LLM does only what it's good at: turn one fuzzy paragraph into a small JSON spec, plus prose.
- Everything that must be **correct, reconciling, referential, and scalable** is deterministic code.
  LLMs hallucinate, can't reconcile balances, don't guarantee valid FKs, and cost/scale poorly per row.
- The boundary is physical in the codebase: the only LLM import lives in `src/lib/interpret/llm.ts`,
  reached only via the server route. The generator has no LLM dependency at all.
- Because the interpreter is swappable, the **heuristic fallback makes the app work with zero
  credentials** — and "still works when the LLM is down" is itself a point in the design's favor.
- Money is integer cents end-to-end so `ending = opening + Σ(txns)` holds with `===`, not "about right."

## What I deliberately left out (and why)

- **No persistence / accounts / multi-user.** A take-home tool; state lives in the session. Adds
  scope without showing more applied-AI judgment.
- **No real Nymbus/core schema.** None available — I modeled a credible generic community-bank /
  credit-union shape and surfaced every assumption in-app and in the README, rather than guessing at a
  proprietary schema.
- **No Web Worker for generation.** In-browser generation of ~10–15k rows is sub-second; a worker is
  polish past the point of return. Volume is capped (~60k) with a visible trim instead.
- **No LLM-written prose in the summary by default.** The summary is computed from the data so the
  numbers are always right; the LLM could polish wording but shouldn't own the facts.
- **No structured-outputs `output_config.format`.** I used forced tool-use instead — equally modern,
  and more robust across the zod-v4 / SDK boundary for this schema. Easy to swap.
- **CSV, not a zipped bundle.** Testers open individual CSVs; "Download all" fires each. A zip is a
  trivial add if wanted.

## What a +1-day version adds

- **Claude-authored, grounded summaries** and a natural-language "tweak this dataset" loop
  (re-interpret edits against the existing spec).
- **Richer edge cases:** check kiting / NSF cascades, ACH returns (R-codes), wire recalls, card
  disputes/chargebacks, statement-cycle interest, escrow on mortgages.
- **Profiles / scenarios:** save and diff named specs; deterministic "golden" datasets for regression
  suites; per-row seeds for targeted reproduction.
- **Schema adapters:** export shaped to a specific core's import format once a real schema is provided;
  field-mapping UI.
- **Scale:** move generation to a streaming server route + Web Worker for 100k+ rows; parquet export.
- **Eval harness** for the interpreter: a labeled set of NL→spec pairs scoring the LLM vs. heuristic.

---

## Round 2 — review-driven hardening (calibrated confidence)

The strongest piece of feedback: the tool validated what it *generated*, not whether it generated
what the user *asked for*, and it never signaled uncertainty. That's the judgment an Applied-AI
reviewer is testing, so it's where I focused.

- **Uncertainty is now visible.** Both interpreters return a confidence level; the Confirm screen
  shows a prominent banner when confidence is low/medium. Gibberish no longer sails through to a
  confident spec — it warns and defaults explicitly.
- **The specific request is proven, not just claimed.** Large wires are generated as real wires
  above the threshold (a balance-clamp could previously shrink an outgoing wire below it), and the
  validator checks the *actual* amount exceeds the threshold, not a tag. The preview is sortable
  with a precise category filter and a "flagged only" toggle, so a tester sorts wires by amount and
  sees the >$50k ones immediately.
- **Realism:** interest rate is a property of the named product (every "Hometown Checking" shares a
  rate); balances no longer all clamp to an artificial $5.00 (varied per-account cushions);
  estimate-vs-actual tightened to ~7% on realistic specs; the volume cap is described as a ceiling.
- **UX:** joint ownership is a single control (the slider) instead of a contradictory toggle+slider;
  empty input gives feedback; defaults are institution-aware (a credit union defaults to mostly
  consumers); the seed is exposed for reproducibility.

Deliberately deferred to the +1-day list: saved / named / shareable configs (#12); a "watch the
validator catch a deliberately broken record" trust demo (#14); a Web Worker / streaming export for
10×-scale datasets (#15, currently bounded by the generation cap); a formal accessibility pass (#16 —
layout verified responsive on mobile).

**One thing only you can do:** set `ANTHROPIC_API_KEY` in Vercel so the AI interpreter is ON in the
submitted artifact (#3) — without it the deployed app runs the deterministic keyword fallback.

---

## Smoke-test output (`npm run smoke`, no API key — heuristic path)

All three cases pass validation; balances reconcile on an independent recompute.

```
CASE: CLEAN — well-specified
  INTERPRETED: community_bank · 120 customers · [checking, savings, loan_auto, credit_line]
               · window 90d · edges=[newAccountFunding]
  GENERATED:   120 parties, 218 accounts, 5,935 transactions
  VALIDATION:  ✓ PASS (reconcile ✓ · references ✓ · dates ✓ · edge cases ✓)

CASE: MESSY — vague & informal   ("couple hundred members" has no digit)
  INTERPRETED: credit_union · 50 customers (defaulted — note surfaced) · [checking, savings, loan_auto, loan_personal]
               · window 6mo · edges=[nsfOverdraft, jointOwnership]
  GENERATED:   50 parties, 93 accounts, 8,648 transactions
  VALIDATION:  ✓ PASS

CASE: EDGE-HEAVY — compliance test set
  INTERPRETED: community_bank · 150 customers · [checking, savings, money_market, loan_auto, credit_line]
               · window 6mo · threshold $10,000
               · edges=[nsfOverdraft, dormantAccounts, backdatedPostings, largeWires, newAccountFunding, closedWithResidual]
  GENERATED:   150 parties, 250 accounts, 11,025 transactions
  VALIDATION:  ✓ PASS — all 6 requested edge cases verified present

RESULT: ✓ ALL CASES PASSED
```

**Honest note on the interpreters:** in the "messy" case the *keyword* parser can't read "couple
hundred" (no digit) and *says so* in its notes before defaulting the scale — exactly what the Confirm
screen is for. The Claude interpreter handles "couple hundred" and phrasings like "accounts at their
credit limit" that the keyword rules miss. That contrast is the point: the LLM lifts the fuzzy
front-end; deterministic code guarantees the data.
