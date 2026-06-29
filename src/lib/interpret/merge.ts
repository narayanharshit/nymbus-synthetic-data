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

/** How confident the interpreter is that it understood the input. */
export type Confidence = "high" | "medium" | "low";

/** Whether a field came from the user's prose (stated) or a default/inference (assumed). */
export type FieldStatus = "stated" | "assumed";

/** The request fields shown (and flagged) on the main review surface. */
export type ProvenanceField =
  | "institutionType"
  | "products"
  | "partyCount"
  | "dateRange"
  | "avgTransactionsPerAccountPerMonth"
  | "largeWireThresholdMinor"
  | "edgeCases"
  | "seed";

export interface FieldProvenance {
  status: FieldStatus;
  /** One-line explanation, shown when a field was assumed. */
  reason?: string;
}

export type Provenance = Record<ProvenanceField, FieldProvenance>;

const ASSUMED_REASON: Record<ProvenanceField, string> = {
  institutionType: "Institution type wasn't stated; defaulted to a community bank.",
  products: "No products were named; using a standard retail product set.",
  partyCount: "No customer count was mentioned; using the default scale.",
  dateRange: "No date window was mentioned; defaulted to the last 90 days.",
  avgTransactionsPerAccountPerMonth:
    "No activity level was mentioned; assumed a moderate ~8 per account per month.",
  largeWireThresholdMinor: "No threshold was stated; using the default $10,000 review threshold.",
  edgeCases: "No edge cases were requested, so none are enabled.",
  seed: "Default seed for a reproducible run; change it for a different dataset.",
};

const PROVENANCE_FIELDS = Object.keys(ASSUMED_REASON) as ProvenanceField[];

/**
 * A field is "stated" when it survives in the merged patch *before* defaults are
 * applied — i.e. the prose (or a chosen preset) actually set it. Both interpreters
 * only emit fields they extracted, so patch-presence is the provenance signal.
 */
function fieldIsStated(merged: DeepPartial<GenerationSpec>, f: ProvenanceField): boolean {
  const v = merged[f as keyof GenerationSpec];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (f === "edgeCases") return Object.values(v as Record<string, unknown>).some(Boolean);
  return true;
}

export function computeProvenance(merged: DeepPartial<GenerationSpec>): Provenance {
  const out = {} as Provenance;
  for (const f of PROVENANCE_FIELDS) {
    out[f] = fieldIsStated(merged, f)
      ? { status: "stated" }
      : { status: "assumed", reason: ASSUMED_REASON[f] };
  }
  return out;
}

/** All-assumed provenance, for the pre-interpret / restored-draft state. */
export function defaultProvenance(): Provenance {
  const out = {} as Provenance;
  for (const f of PROVENANCE_FIELDS) out[f] = { status: "assumed", reason: ASSUMED_REASON[f] };
  return out;
}

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
  /** Calibrated confidence that the input was understood. */
  confidence: Confidence;
  /** Per-field stated/assumed flags for the main review surface. */
  provenance: Provenance;
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
  confidence: Confidence = "high",
): InterpretResult {
  const merged = deepMergeSpec(base, patch);
  const { spec, notes } = normalizeSpec(merged);
  const all = [...extraNotes, ...notes].map(tidyNote).filter(Boolean);
  return { spec, notes: all, source, confidence, provenance: computeProvenance(merged) };
}

/** One clean sentence per note: no ".;" joins, exactly one trailing period. */
function tidyNote(s: string): string {
  const t = s.trim().replace(/\.\s*;\s*/g, "; ").replace(/[.;\s]+$/, "");
  return t ? t + "." : "";
}
