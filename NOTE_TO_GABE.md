# Draft note to Gabe

> Raw material + a tight draft to adapt into your own voice. Not meant to ship as-is.

## Tight draft (short version)

Hi Gabe — here's my take-home.

**Live app:** <your-vercel-url>
**Code:** <your-github-url>

It lets a non-technical implementation consultant describe a client's banking setup in plain
English and get back a realistic, internally-consistent synthetic test dataset — parties, accounts,
and transactions with reconciling balances — that they can review, validate, and export as CSV/JSON.
No code, no engineer.

The decision I cared most about: **I use the LLM only to translate the consultant's fuzzy description
into a structured spec, and let deterministic code generate the data.** LLMs hallucinate and don't
reconcile balances; deterministic generation guarantees valid references, reconciling balances,
coherent dates, and any volume. So the app shows the consultant the interpreted spec to confirm
*before* generating — which is exactly where "the wrong data produces misleading test results" gets
caught. Every dataset is validated (balances, foreign keys, dates, requested edge cases) before
they see it.

One deliberate touch: it works with no API key (a deterministic fallback interprets the input), and
Claude turns on the moment a key is set — so it never hard-fails on the model. There's a
`npm run smoke` that runs three inputs (clean, messy, edge-heavy) end-to-end and asserts validation
passes. Happy to walk through the LLM-vs-deterministic boundary live.

— <your name>

## Even shorter (2–3 sentences, if that's the ask)

I built a tool where a non-technical consultant describes a client's banking config in plain English
and gets a realistic, reconciling synthetic test dataset to validate and export — no code. The key
choice: the LLM only translates the fuzzy description into a structured spec the consultant confirms,
while deterministic code generates the data (so balances reconcile, references resolve, and it scales);
it even runs with no API key via a deterministic fallback. Live: <url> · Code: <repo> ·
`npm run smoke` proves it on three inputs.

## Points you can pull from, depending on tone

- The competency on display is **knowing where *not* to use the LLM** — the boundary is physical in
  the code (one file).
- **Transparency before bulk generation** is the design answer to the brief's stated pain.
- **Integrity is guaranteed, not hoped for:** integer-cent math, a validation panel, and a smoke test.
- **Realism:** community-bank/credit-union products, joint owners, NSF/overdrafts, large wires,
  dormant/closed accounts, loan amortization, posting-vs-effective dates, synthetic-but-shaped IDs
  (never real PII).
- **Pragmatism:** generation runs in the browser (instant, no serverless cost); same seed ⇒ identical
  dataset, so it's reproducible.
- If asked "what would you add with another day": grounded LLM summaries, a natural-language
  "adjust the dataset" loop, richer compliance edge cases (ACH returns, disputes), and export shaped
  to a specific core schema.
