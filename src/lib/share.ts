/**
 * Shareable requests. The whole interpreted request (prose, structured spec,
 * assumptions, and how it was read) is encoded into a URL so a consultant can
 * send a colleague the exact request to review — no account or backend needed.
 * The dataset itself is never shared; the recipient regenerates it deterministically.
 */

import { normalizeSpec, type GenerationSpec } from "@/lib/domain/spec";
import type { Confidence, InterpretSource, Provenance } from "@/lib/interpret/merge";

export interface SharedRequest {
  text: string;
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource | null;
  confidence: Confidence;
  model?: string;
  provenance?: Provenance;
}

const PARAM = "r";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShared(r: SharedRequest): string {
  return toBase64Url(JSON.stringify(r));
}

/** Decode and re-normalize a shared request; returns null if the blob is invalid. */
export function decodeShared(raw: string): SharedRequest | null {
  try {
    const obj = JSON.parse(fromBase64Url(raw));
    if (!obj || typeof obj !== "object" || !obj.spec) return null;
    return {
      text: typeof obj.text === "string" ? obj.text : "",
      spec: normalizeSpec(obj.spec).spec,
      notes: Array.isArray(obj.notes) ? obj.notes.filter((x: unknown): x is string => typeof x === "string") : [],
      source: obj.source === "llm" || obj.source === "heuristic" ? obj.source : null,
      confidence: obj.confidence === "low" || obj.confidence === "medium" ? obj.confidence : "high",
      model: typeof obj.model === "string" ? obj.model : undefined,
      provenance: obj.provenance && typeof obj.provenance === "object" ? (obj.provenance as Provenance) : undefined,
    };
  } catch {
    return null;
  }
}

/** A link that reopens the current request on the Review stage. */
export function buildShareUrl(r: SharedRequest): string {
  const url = new URL(window.location.href);
  url.search = `${PARAM}=${encodeShared(r)}`;
  url.hash = "review";
  return url.toString();
}

export function readSharedFromLocation(): SharedRequest | null {
  const raw = new URLSearchParams(window.location.search).get(PARAM);
  return raw ? decodeShared(raw) : null;
}
