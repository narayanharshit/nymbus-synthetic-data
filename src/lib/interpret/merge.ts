/**
 * Shared plumbing for the interpret layer.
 *
 * Both the heuristic parser and the LLM produce a *partial* spec patch plus some
 * human-readable notes. finalizeInterpretation() deep-merges the patch over a
 * base, runs it through normalizeSpec() (defaults + clamping + coherence), and
 * returns the result the CONFIRM screen renders.
 */

import { normalizeSpec, type GenerationSpec } from "../domain/spec";

export type InterpretSource = "llm" | "heuristic";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface InterpretResult {
  spec: GenerationSpec;
  /** Plain-language notes: assumptions made, fields defaulted, adjustments. */
  notes: string[];
  source: InterpretSource;
}

/** Deep-merge a partial patch over a partial base (objects merge, arrays/scalars replace). */
export function deepMergeSpec(
  base: DeepPartial<GenerationSpec>,
  patch: DeepPartial<GenerationSpec>,
): DeepPartial<GenerationSpec> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    const existing = out[k];
    if (
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      out[k] = { ...(existing as object), ...(v as object) };
    } else {
      out[k] = v;
    }
  }
  return out as DeepPartial<GenerationSpec>;
}

export function finalizeInterpretation(
  base: DeepPartial<GenerationSpec>,
  patch: DeepPartial<GenerationSpec>,
  extraNotes: string[],
  source: InterpretSource,
): InterpretResult {
  const merged = deepMergeSpec(base, patch);
  const { spec, notes } = normalizeSpec(merged);
  return { spec, notes: [...extraNotes, ...notes], source };
}
