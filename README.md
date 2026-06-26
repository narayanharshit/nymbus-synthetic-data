# Synthetic Banking Data Studio

A web tool that lets a **non-technical implementation consultant** turn what they know about a
client's banking configuration — in plain language — into a **realistic, internally-consistent
synthetic test dataset**, with no code and no engineer.

Built for the Nymbus Applied AI take-home. It runs for real against real input; nothing is mocked.

```
plain-language description ─▶ structured spec ─▶ confirm & edit ─▶ deterministic generation ─▶ validate ─▶ export
        (LLM or heuristic)        (you review)                      (no LLM)                   (proof)    (CSV + JSON)
```

---

## The one design decision that matters

**The LLM is used for exactly two things, and bulk data generation is not one of them.**

| Job | Who does it | Why |
| --- | --- | --- |
| Translate fuzzy NL → a structured generation spec | **LLM** (Claude) | Genuinely fuzzy, low-volume, language-shaped. What LLMs are good at. |
| Plain-English summaries / assumptions | **LLM / deterministic** | Nice-to-have prose; facts still come from counting the data. |
| Generate parties, accounts, transactions at volume | **Deterministic code** | Must reconcile, scale, and be reproducible. |
| Reconcile balances, resolve foreign keys, keep dates coherent | **Deterministic code** | LLMs hallucinate and don't do arithmetic reliably. |

LLMs hallucinate, don't reconcile balances, don't guarantee valid references, and don't scale
cheaply. Deterministic generation guarantees reconciling balances, valid references, coherent
dates, and arbitrary volume. **Knowing where *not* to put the LLM is the whole point** — so the
split is explicit in the code: everything the LLM touches lives in [`src/lib/interpret/`](src/lib/interpret),
and it produces only a small JSON spec. Everything else is plain TypeScript.

A deliberate consequence: there's a **deterministic heuristic interpreter** ([`heuristic.ts`](src/lib/interpret/heuristic.ts))
that runs when no API key is present. So the app generates, validates, and exports **end-to-end with
zero credentials** — the LLM upgrades the interpretation; it isn't a hard dependency.

---

## Quick start (< 5 minutes, no API key required)

Requires **Node 20+**.

```bash
npm install
npm run dev
# open http://localhost:3000
```

That's it. With **no API key**, the natural-language box is parsed by the built-in heuristic
interpreter and everything works. Click a preset, hit **Interpret**, review the spec, **Generate**,
and export.

### Optional: turn on the Claude interpreter

Create `.env.local` (git-ignored) — see [`.env.example`](.env.example):

```bash
ANTHROPIC_API_KEY=sk-ant-...        # your key; never committed, never sent to the browser
# ANTHROPIC_MODEL=claude-opus-4-8   # optional override (default: claude-opus-4-8)
```

Restart `npm run dev`. The header badge flips to **"AI interpreter: on"** and fuzzy descriptions
are translated by Claude (with the heuristic still there as an automatic fallback if the call fails).
The key is read only in the server route ([`/api/interpret`](src/app/api/interpret/route.ts)) and
is never exposed to the client.

---

## Try these three inputs

1. **Clean:** *"Community bank, retail focused. About 120 customers with checking and savings, plus
   some auto loans and a few credit lines. Last 90 days, lots of debit card and ACH, include some
   new-account funding deposits."*
2. **Messy / ambiguous:** *"credit union, couple hundred members, the usual stuff — savings,
   checking, some loans and cards, lots of joint accounts, past 6 months, fairly busy. oh and throw
   in a few overdrafts"*
3. **Edge-case-heavy:** *"Community bank, 150 customers. Checking, savings, money market, credit
   lines and auto loans. Compliance/BSA test set: overdrafts/NSF, dormant accounts, large wires over
   $10,000, backdated/holiday postings, new-account funding, and closed accounts with residual
   activity. Last 6 months."*

The **Confirm** screen always shows how your words were read (and what was assumed) before any bulk
data is produced — directly addressing the brief's pain point that *the wrong data produces
misleading test results*.

---

## Smoke test — proof it works

```bash
npm run smoke
```

Runs all three inputs above through the **exact same library the app uses** (no API key — the
heuristic path), generating full datasets and asserting validation passes. It also independently
re-derives an account balance from its transactions to prove reconciliation. Exits non-zero on any
failure. (Sample output is in [`DECISION_LOG.md`](DECISION_LOG.md).)

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

---

## What gets generated (domain realism)

- **Parties** — individuals and businesses; joint owners; synthetic names, addresses, DOBs, and
  **deliberately-invalid-but-shaped** tax IDs (SSNs use area `666`, EINs use prefix `00` — never real PII).
- **Accounts** — checking, savings, money market, CDs, auto/mortgage/personal loans, and credit
  lines, each with sensible attributes (rate in bps, term, minimum balance, credit limit, open date,
  status, maturity). The institution gets a synthetic but **ABA-checksum-valid** routing number.
- **Transactions** — ACH, wire, card/POS (with MCC), ATM, check, transfer, fee, interest accrual,
  loan disbursement/payment. Proper **posting vs. effective dates**, running balances, plausible
  amounts and merchants, references to real account + party IDs.
- **Edge cases (only when requested)** — NSF/overdraft + fee, dormant accounts, accounts at a product
  limit, backdated/holiday postings, large wires above a review threshold, new-account funding,
  closed-with-residual activity, joint ownership. Each requested case is **verified present** by the validator.

**Money is integer cents everywhere.** Floating-point dollars silently break reconciliation; integers
make `ending balance === opening + Σ(transactions)` hold exactly. CSV exports render dollars for
humans; JSON keeps exact cents.

---

## Validation (shown in the UI, asserted in the smoke test)

Every dataset must pass, before you ever see it:

1. **Reconciliation** — each account's ending balance equals opening + the sum of its transactions,
   and every running balance matches.
2. **Referential integrity** — every transaction→account, transaction→party, and account→owner
   reference resolves; every account has a primary owner.
3. **Date coherence** — posting ≥ effective; all activity is within the account's lifecycle and the
   requested window.
4. **Edge-case presence** — every edge case you asked for is actually in the data. An edge case
   that's *structurally impossible* for the chosen configuration (e.g. joint ownership with no
   deposit accounts, or overdrafts with zero transaction volume) is flagged as a **note with the
   reason** — not a failure.

---

## Architecture

```
src/
  app/
    page.tsx                  # renders the studio
    api/interpret/route.ts    # the ONLY server-side LLM touchpoint (key stays server-side)
  components/                 # Studio (input) · ConfirmStep (editable spec) · ResultsStep (validation, tables, export)
  lib/
    domain/                   # types, money (integer cents), spec (zod), presets   <- shared contract
    generate/                 # seeded RNG, pools, identity, parties, accounts, transactions, generator  <- DETERMINISTIC
    validate/                 # reconciliation / FK / dates / edge-case checks
    interpret/                # heuristic.ts + llm.ts (Claude) + merge/finalize     <- the LLM boundary
    summary.ts                # plain-English summary (deterministic facts)
    export/                   # CSV (per table) + JSON exporters
scripts/smoke.ts              # 3-input end-to-end smoke test
```

Generation runs **in the browser** (deterministic, seeded → instant, free, no serverless compute).
The only server call is the small NL→spec interpretation. Same seed + same spec ⇒ the same dataset
(only the `generatedAt` timestamp varies), which is why "regenerate" is stable and bugs are
reproducible.

---

## Assumptions (no real Nymbus schema was available)

These are surfaced in the app where relevant and are easy to change in [`src/lib/domain`](src/lib/domain):

- A generic-but-credible community-bank / credit-union data model (the field set above), not any
  specific Nymbus/core schema.
- Tax IDs, routing/account numbers, names, and addresses are synthetic and chosen to be obviously
  fake yet correctly *shaped* (valid SSN/EIN/ABA *format*, guaranteed-invalid *values*).
- `openingBalance` is the balance **brought forward at the start of the modeled window**; accounts
  opened mid-window start at 0 and are funded by their first transaction. Either way reconciliation is exact.
- Loans/credit lines carry a **negative** ledger balance (money owed); the UI shows the absolute
  "owed" figure. One universal reconciliation rule covers every product.
- Volume is capped (≈60k transactions) to keep in-browser generation responsive; the spec layer
  trims and tells you when it does.

---

## Deploy to Vercel

I don't touch your accounts — here are the exact steps. The repo is deploy-ready (no config needed).

**Option A — dashboard (recommended)**

1. Push this repo to GitHub (see below).
2. Go to **vercel.com → Add New… → Project → Import** your repo.
3. Framework preset auto-detects **Next.js**; leave build/output settings as default. Click **Deploy**.
4. *(Optional, to enable Claude)* In **Project → Settings → Environment Variables**, add
   `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) for **Production** and **Preview**, then
   **redeploy**. Without it, the deployed app still works via the heuristic interpreter.

**Option B — CLI**

```bash
npm i -g vercel
vercel              # link + first deploy (answer the prompts)
vercel env add ANTHROPIC_API_KEY     # optional; paste your key when prompted
vercel --prod       # production deploy
```

**Push to GitHub first:**

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Keys live only in environment variables — `.gitignore` excludes all `.env*` files, so nothing
secret is ever committed.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server at http://localhost:3000 |
| `npm run smoke` | 3-input end-to-end smoke test (no API key needed) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `npm start` | Serve the production build |

See [`DECISION_LOG.md`](DECISION_LOG.md) for what was built, what was deliberately left out, and what
a +1-day version adds.
