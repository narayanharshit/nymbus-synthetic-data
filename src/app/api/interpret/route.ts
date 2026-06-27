/**
 * POST /api/interpret
 *
 * Body: { text?: string, baseSpec?: DeepPartial<GenerationSpec> }
 * Returns: { spec, notes, source, llmAvailable, model?, fallback? }
 *
 * This is the ONLY server-side LLM touchpoint. It calls Claude when
 * ANTHROPIC_API_KEY is configured and falls back to the deterministic heuristic
 * parser otherwise (or if the LLM call fails). The API key is read from the
 * server environment and never sent to the client. Bulk data generation does
 * NOT happen here — it runs deterministically in the browser.
 */

import { NextResponse } from "next/server";
import { heuristicInterpret } from "@/lib/interpret/heuristic";
import { hasLlmKey, llmInterpret } from "@/lib/interpret/llm";
import { finalizeInterpretation, type DeepPartial } from "@/lib/interpret/merge";
import type { GenerationSpec } from "@/lib/domain/spec";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = (body ?? {}) as { text?: unknown; baseSpec?: unknown };
  const text = typeof b.text === "string" ? b.text : "";
  const baseSpec: DeepPartial<GenerationSpec> =
    b.baseSpec && typeof b.baseSpec === "object" ? (b.baseSpec as DeepPartial<GenerationSpec>) : {};

  // Guided-only path: no free text, just normalize whatever fields were set.
  if (!text.trim()) {
    const result = finalizeInterpretation(baseSpec, {}, [], "heuristic", "high");
    return NextResponse.json({ ...result, llmAvailable: hasLlmKey() });
  }

  if (hasLlmKey()) {
    try {
      const { patch, notes, model, confidence } = await llmInterpret(text);
      const result = finalizeInterpretation(baseSpec, patch, notes, "llm", confidence);
      return NextResponse.json({ ...result, llmAvailable: true, model });
    } catch (e) {
      const { patch, notes, confidence } = heuristicInterpret(text);
      const result = finalizeInterpretation(
        baseSpec,
        patch,
        ["The AI interpreter was unavailable, so the built-in keyword parser was used instead.", ...notes],
        "heuristic",
        confidence,
      );
      return NextResponse.json({
        ...result,
        llmAvailable: true,
        fallback: true,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { patch, notes, confidence } = heuristicInterpret(text);
  const result = finalizeInterpretation(baseSpec, patch, notes, "heuristic", confidence);
  return NextResponse.json({ ...result, llmAvailable: false });
}
