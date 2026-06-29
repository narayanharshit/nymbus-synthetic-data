"use client";

import * as React from "react";
import { Info, RotateCcw, Sparkles } from "lucide-react";
import { PRESETS } from "@/lib/domain/presets";
import { normalizeSpec, type GenerationSpec } from "@/lib/domain/spec";
import type { Confidence, DeepPartial, InterpretSource } from "@/lib/interpret/merge";
import { buildShareUrl, readSharedFromLocation, type SharedRequest } from "@/lib/share";
import { generateDataset } from "@/lib/generate/generator";
import { validateDataset, type ValidationResult } from "@/lib/validate/validate";
import { summarizeDataset, type DatasetSummary } from "@/lib/summary";
import type { Dataset } from "@/lib/domain/types";
import { StageDescribe } from "./StageDescribe";
import { StageReview } from "./StageReview";
import { DataPreview } from "./DataPreview";

type Stage = "describe" | "review" | "dataset";
const STORAGE_KEY = "nymbus-draft-v1";
const INITIAL_SPEC = normalizeSpec({}).spec;

/**
 * Restore an in-progress draft saved on a previous visit. Kept as a module-level
 * helper (rather than inline in the effect) because localStorage is unavailable
 * during prerender, so it can't be a lazy useState initializer.
 */
function restoreDraft(setText: (t: string) => void, setSpec: (s: GenerationSpec) => void) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.text === "string") setText(d.text);
    if (d.spec) setSpec(normalizeSpec(d.spec).spec);
  } catch {
    /* ignore malformed draft */
  }
}

interface Setters {
  setText: (t: string) => void;
  setSpec: (s: GenerationSpec) => void;
  setNotes: (n: string[]) => void;
  setSource: (s: InterpretSource | null) => void;
  setConfidence: (c: Confidence) => void;
  setModel: (m: string | undefined) => void;
}

/** Load a request shared via URL onto the Review stage, then strip the (long) blob. */
function applyShared(s: SharedRequest, set: Setters) {
  set.setText(s.text);
  set.setSpec(s.spec);
  set.setNotes(s.notes);
  set.setSource(s.source);
  set.setConfidence(s.confidence);
  set.setModel(s.model);
  history.replaceState(null, "", location.pathname + "#review");
}

interface InterpretResponse {
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource;
  confidence: Confidence;
  llmAvailable: boolean;
  fallback?: boolean;
  model?: string;
}

export function Studio() {
  const [stage, setStage] = React.useState<Stage>("describe");
  const [text, setText] = React.useState("");
  const [baseSpec, setBaseSpec] = React.useState<DeepPartial<GenerationSpec>>({});
  const [spec, setSpec] = React.useState<GenerationSpec>(INITIAL_SPEC);

  const [interpreting, setInterpreting] = React.useState(false);
  const [interpretError, setInterpretError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [confidence, setConfidence] = React.useState<Confidence>("high");
  const [source, setSource] = React.useState<InterpretSource | null>(null);
  const [model, setModel] = React.useState<string | undefined>();
  const [llmAvailable, setLlmAvailable] = React.useState<boolean | null>(null);

  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [summary, setSummary] = React.useState<DatasetSummary | null>(null);
  const [generating, setGenerating] = React.useState(false);

  // On mount: restore any in-progress draft, sync the stage to the URL hash for
  // in-session back/forward, and probe whether Claude is configured. A fresh load
  // holds no generated dataset or interpretation in memory, so we strip any deep-
  // linked hash and start at the top; the render guards below fall back if a stage
  // is ever active without its data (e.g. pressing Back after Start over).
  React.useEffect(() => {
    const shared = readSharedFromLocation();
    if (shared) {
      applyShared(shared, { setText, setSpec, setNotes, setSource, setConfidence, setModel });
    } else {
      restoreDraft(setText, setSpec);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    }
    const sync = () => {
      const h = location.hash.replace("#", "");
      setStage(h === "dataset" ? "dataset" : h === "review" ? "review" : "describe");
    };
    sync();
    window.addEventListener("hashchange", sync);
    fetch("/api/interpret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    })
      .then((r) => r.json())
      .then((d) => setLlmAvailable(Boolean(d.llmAvailable)))
      .catch(() => setLlmAvailable(false));
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, spec }));
    } catch {
      /* ignore */
    }
  }, [text, spec]);

  function go(s: Stage) {
    setStage(s);
    const target = "#" + s;
    if (location.hash !== target) location.hash = s;
  }

  async function interpret() {
    if (!text.trim() && Object.keys(baseSpec).length === 0) {
      setInterpretError("Describe a client, or pick a preset, to interpret.");
      return;
    }
    setInterpreting(true);
    setInterpretError(null);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, baseSpec }),
      });
      if (!res.ok) throw new Error(`Interpreter returned ${res.status}`);
      const data: InterpretResponse = await res.json();
      setSpec(data.spec);
      setNotes(data.notes ?? []);
      setSource(data.fallback ? "heuristic" : data.source);
      setConfidence(data.confidence ?? "high");
      setModel(data.model);
      setLlmAvailable(data.llmAvailable);
      go("review");
    } catch (e) {
      setInterpretError(e instanceof Error ? e.message : "Something went wrong interpreting that.");
    } finally {
      setInterpreting(false);
    }
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setText(preset.promptHint);
    setBaseSpec(preset.spec);
    setInterpretError(null);
  }

  function generate() {
    setGenerating(true);
    setTimeout(() => {
      try {
        const ds = generateDataset(spec);
        setDataset(ds);
        setValidation(validateDataset(ds));
        setSummary(summarizeDataset(ds));
        go("dataset");
      } finally {
        setGenerating(false);
      }
    }, 30);
  }

  function startOver() {
    if (dataset && !window.confirm("Discard the generated dataset and start over?")) return;
    setText("");
    setBaseSpec({});
    setSpec(INITIAL_SPEC);
    setNotes([]);
    setSource(null);
    setConfidence("high");
    setDataset(null);
    setValidation(null);
    setSummary(null);
    go("describe");
  }

  const getShareUrl = React.useCallback(
    () => buildShareUrl({ text, spec, notes, source, confidence, model }),
    [text, spec, notes, source, confidence, model],
  );

  // Guard against a stage being active without the data it needs (e.g. pressing
  // Back after Start over returns to #dataset with the dataset already cleared).
  const ready = Boolean(dataset && validation && summary);
  const effectiveStage: Stage = stage === "dataset" && !ready ? "describe" : stage;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex flex-none items-center justify-between bg-navy px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-3.5 w-3.5 rounded-sm bg-accent" />
          <span className="text-[12.5px] font-semibold tracking-tight text-white">
            Synthetic Banking Data Studio
          </span>
          <AboutButton />
        </div>
        <div className="flex items-center gap-3">
          {effectiveStage !== "describe" && (
            <button
              onClick={startOver}
              className="flex items-center gap-1.5 text-[11.5px] text-white/55 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </button>
          )}
          {llmAvailable !== null && (
            <span
              className="flex items-center gap-1.5 rounded border border-navy-line px-2 py-0.5 text-[10.5px]"
              style={{ color: llmAvailable ? "#BBD0E8" : "#7E8BA0", background: "#14314f" }}
            >
              <Sparkles className="h-3 w-3" />
              {llmAvailable ? "AI interpreter: on" : "AI interpreter: off (keyword mode)"}
            </span>
          )}
        </div>
      </header>

      <main key={effectiveStage} className="stage-enter flex min-h-0 flex-1 flex-col">
        {effectiveStage === "describe" && (
          <StageDescribe
            text={text}
            setText={setText}
            onInterpret={interpret}
            interpreting={interpreting}
            error={interpretError}
            onPreset={applyPreset}
          />
        )}
        {effectiveStage === "review" && (
          <StageReview
            spec={spec}
            onChange={setSpec}
            notes={notes}
            source={source}
            model={model}
            confidence={confidence}
            onGenerate={generate}
            generating={generating}
            onEditDescription={() => go("describe")}
            getShareUrl={getShareUrl}
          />
        )}
        {effectiveStage === "dataset" && dataset && validation && summary && (
          <DataPreview
            spec={spec}
            dataset={dataset}
            validation={validation}
            summary={summary}
            onEditRequest={() => go("review")}
          />
        )}
      </main>

      <footer className="flex-none border-t border-line bg-paper px-4 py-1.5 text-[11px] leading-snug text-ink-faint">
        The LLM only translates your description into a structured spec. All data is generated by
        deterministic code — balances reconcile, references resolve, and every dataset is validated
        before you see it. All names, IDs, and tax IDs are synthetic and deliberately invalid (never
        real PII).
      </footer>
    </div>
  );
}

function AboutButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="About this tool"
        className="flex text-white/45 hover:text-white/80"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-30 w-80 rounded-md border border-line bg-surface p-3 text-[12px] shadow-md">
            <p className="text-ink-muted">
              <span className="font-medium text-ink">Before:</span> a consultant explains the
              client&apos;s configuration to an engineer, waits, and hopes the right data comes back.
            </p>
            <p className="mt-2 text-ink-muted">
              <span className="font-medium text-ink">Now:</span> they describe it in plain language,
              review the request, and export the data — in minutes, no ticket.
            </p>
          </div>
        </>
      )}
    </span>
  );
}
