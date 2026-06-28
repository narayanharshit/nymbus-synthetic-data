"use client";

import * as React from "react";
import { Info, Sparkles } from "lucide-react";
import { PRESETS } from "@/lib/domain/presets";
import { normalizeSpec, type GenerationSpec } from "@/lib/domain/spec";
import type { Confidence, DeepPartial, InterpretSource } from "@/lib/interpret/merge";
import { generateDataset } from "@/lib/generate/generator";
import { validateDataset, type ValidationResult } from "@/lib/validate/validate";
import { summarizeDataset, type DatasetSummary } from "@/lib/summary";
import type { Dataset } from "@/lib/domain/types";
import { SpecRail } from "./SpecRail";
import { DataPreview } from "./DataPreview";

interface InterpretResponse {
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource;
  confidence: Confidence;
  llmAvailable: boolean;
  fallback?: boolean;
  model?: string;
}

const INITIAL_SPEC = normalizeSpec({}).spec;

export function Studio() {
  const [spec, setSpec] = React.useState<GenerationSpec>(INITIAL_SPEC);
  const [text, setText] = React.useState("");
  const [baseSpec, setBaseSpec] = React.useState<DeepPartial<GenerationSpec>>({});

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
  const [dirty, setDirty] = React.useState(true);

  // Detect whether the Claude path is configured, without side effects.
  React.useEffect(() => {
    fetch("/api/interpret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    })
      .then((r) => r.json())
      .then((d) => setLlmAvailable(Boolean(d.llmAvailable)))
      .catch(() => setLlmAvailable(false));
  }, []);

  function editSpec(next: GenerationSpec) {
    setSpec(next);
    setDirty(true);
  }

  async function interpret() {
    if (!text.trim() && Object.keys(baseSpec).length === 0) {
      setInterpretError("Describe the client above, or load a preset, to interpret.");
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
      setDirty(true);
    } catch (e) {
      setInterpretError(e instanceof Error ? e.message : "Something went wrong interpreting that.");
    } finally {
      setInterpreting(false);
    }
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const { spec: normalized, notes: adjustments } = normalizeSpec({ ...preset.spec, seed: spec.seed });
    setSpec(normalized);
    setText(preset.promptHint);
    setBaseSpec(preset.spec);
    setNotes([`Loaded preset — ${preset.label}.`, ...adjustments]);
    setConfidence("high");
    setSource(null);
    setInterpretError(null);
    setDirty(true);
  }

  function generate() {
    setGenerating(true);
    setTimeout(() => {
      try {
        const ds = generateDataset(spec);
        setDataset(ds);
        setValidation(validateDataset(ds));
        setSummary(summarizeDataset(ds));
        setDirty(false);
      } finally {
        setGenerating(false);
      }
    }, 30);
  }

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
        {llmAvailable !== null && (
          <span
            className="flex items-center gap-1.5 rounded border border-navy-line px-2 py-0.5 text-[10.5px]"
            style={{ color: llmAvailable ? "#BBD0E8" : "#7E8BA0", background: "#14314f" }}
          >
            <Sparkles className="h-3 w-3" />
            {llmAvailable ? "AI interpreter: on" : "AI interpreter: off (keyword mode)"}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <SpecRail
          spec={spec}
          onChange={editSpec}
          text={text}
          setText={setText}
          onInterpret={interpret}
          interpreting={interpreting}
          interpretError={interpretError}
          notes={notes}
          confidence={confidence}
          source={source}
          model={model}
          onPreset={applyPreset}
          onGenerate={generate}
          generating={generating}
          stale={dataset !== null && dirty}
        />
        <DataPreview
          spec={spec}
          notes={notes}
          source={source}
          model={model}
          confidence={confidence}
          dataset={dataset}
          validation={validation}
          summary={summary}
          generating={generating}
        />
      </div>

      {/* footer below */}
      <footer className="flex-none border-t border-line bg-paper px-4 py-1.5 text-[11px] leading-snug text-ink-faint">
        The LLM is used only to translate your description into a structured spec. All data is
        generated by deterministic code — balances reconcile, references resolve, and every dataset is
        validated before you see it. All names, IDs, and tax IDs are synthetic and deliberately invalid
        (never real PII).
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
              review the structured request, and export the data — in minutes, no ticket.
            </p>
          </div>
        </>
      )}
    </span>
  );
}
