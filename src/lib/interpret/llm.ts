/**
 * LLM interpreter — the ONLY place an LLM is used in this app.
 *
 * Job: translate one consultant's fuzzy, plain-language description into a
 * structured spec patch. It does NOT generate any data — that is the
 * deterministic engine's job. We use forced tool-use (a single
 * `emit_generation_spec` tool) so the SDK hands back the spec already parsed as
 * `block.input`, avoiding brittle JSON-from-text extraction.
 *
 * Anything that goes wrong here (no API key, network error, malformed output)
 * throws, and the API route falls back to the deterministic heuristic parser —
 * so the product never hard-fails on the LLM.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { INSTITUTION_TYPES, PRODUCT_TYPES } from "../domain/types";
import type { DeepPartial } from "./merge";
import type { GenerationSpec } from "../domain/spec";

const DEFAULT_MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a domain expert in U.S. community-bank and credit-union core banking, helping a NON-TECHNICAL implementation consultant.

Your single job: read the consultant's plain-language description of a client's banking configuration and translate it into a structured generation spec by calling the emit_generation_spec tool. You do NOT generate any data — deterministic code does that downstream. You only fill in the spec.

Rules:
- Infer sensible, realistic values for a community bank / credit union of the described size.
- Only turn on an edge case (overdrafts, dormant accounts, large wires, etc.) if the consultant actually mentions or clearly implies it. Do not invent edge cases they didn't ask for.
- Map vague volume words to numbers: "light" ~4 txns/account/month, "moderate" ~8, "heavy/high-volume" ~16.
- Parse counts ("about 250 customers" -> partyCount 250) and relative date ranges ("last 90 days", "past 6 months") into concrete YYYY-MM-DD dates relative to today.
- If something isn't stated, leave it out (downstream defaults handle it) rather than guessing wildly.
- In "assumptions", briefly note the meaningful inferences you made, in plain language a consultant would understand. Keep each note short.`;

const inputSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    institutionType: { type: "string", enum: [...INSTITUTION_TYPES], description: "community_bank or credit_union" },
    institutionName: { type: "string", description: "Only if the consultant named the institution." },
    partyCount: { type: "integer", description: "Number of customers/members." },
    businessRatio: { type: "number", description: "Fraction (0-1) of parties that are businesses." },
    avgAccountsPerParty: { type: "number", description: "Average accounts per customer, typically 1.3-2.5." },
    jointOwnershipRatio: { type: "number", description: "Fraction (0-1) of deposit accounts held jointly." },
    products: {
      type: "array",
      items: { type: "string", enum: [...PRODUCT_TYPES] },
      description: "Products in scope.",
    },
    dateRangeStart: { type: "string", description: "YYYY-MM-DD start of the data window." },
    dateRangeEnd: { type: "string", description: "YYYY-MM-DD end of the data window." },
    avgTransactionsPerAccountPerMonth: { type: "number", description: "Volume knob." },
    transactionMix: {
      type: "object",
      additionalProperties: false,
      properties: {
        ach: { type: "number" }, wire: { type: "number" }, card: { type: "number" },
        atm: { type: "number" }, check: { type: "number" }, transfer: { type: "number" },
      },
      description: "Relative weights per transaction family (only if the consultant emphasized a mix).",
    },
    largeWireThresholdDollars: { type: "number", description: "Dollar threshold above which wires are flagged for review (e.g. 10000)." },
    edgeCases: {
      type: "object",
      additionalProperties: false,
      properties: {
        nsfOverdraft: { type: "boolean" },
        dormantAccounts: { type: "boolean" },
        atLimitAccounts: { type: "boolean" },
        backdatedPostings: { type: "boolean" },
        largeWires: { type: "boolean" },
        newAccountFunding: { type: "boolean" },
        closedWithResidual: { type: "boolean" },
        jointOwnership: { type: "boolean" },
      },
      description: "Turn on ONLY the edge cases the consultant asked for.",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Short plain-language notes on the inferences you made.",
    },
  },
  required: [],
};

const LlmOutputSchema = z.object({
  institutionType: z.enum(INSTITUTION_TYPES).optional(),
  institutionName: z.string().optional(),
  partyCount: z.coerce.number().int().optional(),
  businessRatio: z.coerce.number().optional(),
  avgAccountsPerParty: z.coerce.number().optional(),
  jointOwnershipRatio: z.coerce.number().optional(),
  products: z.array(z.enum(PRODUCT_TYPES)).optional(),
  dateRangeStart: z.string().optional(),
  dateRangeEnd: z.string().optional(),
  avgTransactionsPerAccountPerMonth: z.coerce.number().optional(),
  transactionMix: z
    .object({
      ach: z.coerce.number(), wire: z.coerce.number(), card: z.coerce.number(),
      atm: z.coerce.number(), check: z.coerce.number(), transfer: z.coerce.number(),
    })
    .partial()
    .optional(),
  largeWireThresholdDollars: z.coerce.number().optional(),
  edgeCases: z
    .object({
      nsfOverdraft: z.boolean(), dormantAccounts: z.boolean(), atLimitAccounts: z.boolean(),
      backdatedPostings: z.boolean(), largeWires: z.boolean(), newAccountFunding: z.boolean(),
      closedWithResidual: z.boolean(), jointOwnership: z.boolean(),
    })
    .partial()
    .optional(),
  assumptions: z.array(z.string()).optional(),
});

export function hasLlmKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function llmInterpret(
  text: string,
): Promise<{ patch: DeepPartial<GenerationSpec>; notes: string[]; model: string }> {
  if (!hasLlmKey()) throw new Error("ANTHROPIC_API_KEY not set");

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "emit_generation_spec",
        description: "Record the structured generation spec inferred from the consultant's description.",
        input_schema: inputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "emit_generation_spec" },
    messages: [
      {
        role: "user",
        content: `Today's date is ${today}.\n\nClient description from the consultant:\n"""\n${text}\n"""\n\nCall emit_generation_spec with the structured spec.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("LLM did not return a structured spec");

  const parsed = LlmOutputSchema.safeParse(toolUse.input);
  if (!parsed.success) throw new Error(`LLM spec failed validation: ${parsed.error.message}`);

  const o = parsed.data;
  const patch: DeepPartial<GenerationSpec> = {};
  const notes: string[] = [];

  if (o.institutionType) patch.institutionType = o.institutionType;
  if (o.institutionName) patch.institutionName = o.institutionName;
  if (o.partyCount !== undefined) patch.partyCount = o.partyCount;
  if (o.businessRatio !== undefined) patch.businessRatio = o.businessRatio;
  if (o.avgAccountsPerParty !== undefined) patch.avgAccountsPerParty = o.avgAccountsPerParty;
  if (o.jointOwnershipRatio !== undefined) patch.jointOwnershipRatio = o.jointOwnershipRatio;
  if (o.products && o.products.length) patch.products = o.products;
  if (o.avgTransactionsPerAccountPerMonth !== undefined) {
    patch.avgTransactionsPerAccountPerMonth = o.avgTransactionsPerAccountPerMonth;
  }
  if (o.transactionMix) patch.transactionMix = o.transactionMix;
  if (o.largeWireThresholdDollars !== undefined) {
    patch.largeWireThresholdMinor = Math.round(o.largeWireThresholdDollars * 100);
  }
  if (o.edgeCases) patch.edgeCases = o.edgeCases;
  if (o.dateRangeStart && o.dateRangeEnd) {
    patch.dateRange = { start: o.dateRangeStart, end: o.dateRangeEnd };
  }
  if (o.assumptions) notes.push(...o.assumptions);

  return { patch, notes, model };
}
