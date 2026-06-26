"use client";

import * as React from "react";
import { PRESETS } from "@/lib/domain/presets";
import type { GenerationSpec } from "@/lib/domain/spec";
import type { DeepPartial, InterpretSource } from "@/lib/interpret/merge";
import { generateDataset } from "@/lib/generate/generator";
import { validateDataset, type ValidationResult } from "@/lib/validate/validate";
import { summarizeDataset, type DatasetSummary } from "@/lib/summary";
import type { Dataset } from "@/lib/domain/types";
import { Badge, Button, Card, Spinner, TextArea } from "./ui";
import { ConfirmStep } from "./ConfirmStep";
import { ResultsStep } from "./ResultsStep";

type Step = "input" | "confirm" | "results";

interface InterpretResponse {
  spec: GenerationSpec;
  notes: string[];
  source: InterpretSource;
  llmAvailable: boolean;
  fallback?: boolean;
  model?: string;
}

export function Studio() {
  const [step, setStep] = React.useState<Step>("input");
  const [text, setText] = React.useState("");
  const [baseSpec, setBaseSpec] = React.useState<DeepPartial<GenerationSpec>>({});
  const [interpreting, setInterpreting] = React.useState(false);
  const [interpretError, setInterpretError] = React.useState<string | null>(null);

  const [spec, setSpec] = React.useState<GenerationSpec | null>(null);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [source, setSource] = React.useState<InterpretSource>("heuristic");
  const [model, setModel] = React.useState<string | undefined>();
  const [llmAvailable, setLlmAvailable] = React.useState<boolean | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [summary, setSummary] = React.useState<DatasetSummary | null>(null);

  async function interpret() {
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
      setModel(data.model);
      setLlmAvailable(data.llmAvailable);
      setStep("confirm");
    } catch (e) {
      setInterpretError(
        e instanceof Error ? e.message : "Something went wrong interpreting that.",
      );
    } finally {
      setInterpreting(false);
    }
  }

  function runGeneration(s: GenerationSpec) {
    setGenerating(true);
    // Defer so the spinner paints before the (synchronous) generation runs.
    setTimeout(() => {
      try {
        const ds = generateDataset(s);
        setDataset(ds);
        setValidation(validateDataset(ds));
        setSummary(summarizeDataset(ds));
        setStep("results");
      } finally {
        setGenerating(false);
      }
    }, 30);
  }

  function regenerate() {
    if (!spec) return;
    const next = { ...spec, seed: spec.seed + 1 };
    setSpec(next);
    runGeneration(next);
  }

  function reset() {
    setStep("input");
    setDataset(null);
    setValidation(null);
    setSummary(null);
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setText(preset.promptHint);
    setBaseSpec(preset.spec);
    setInterpretError(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      <Header step={step} llmAvailable={llmAvailable} />

      {step === "input" && (
        <InputStep
          text={text}
          setText={(t) => {
            setText(t);
            // Editing the text by hand drops the preset's seed values.
            if (Object.keys(baseSpec).length) setBaseSpec({});
          }}
          onPreset={applyPreset}
          onInterpret={interpret}
          interpreting={interpreting}
          error={interpretError}
        />
      )}

      {step === "confirm" && spec && (
        <ConfirmStep
          spec={spec}
          notes={notes}
          source={source}
          model={model}
          generating={generating}
          onChange={setSpec}
          onBack={() => setStep("input")}
          onGenerate={runGeneration}
        />
      )}

      {step === "results" && dataset && validation && summary && (
        <ResultsStep
          dataset={dataset}
          validation={validation}
          summary={summary}
          onAdjust={() => setStep("confirm")}
          onRegenerate={regenerate}
          onRestart={reset}
        />
      )}

      <Footer />
    </div>
  );
}

function Header({ step, llmAvailable }: { step: Step; llmAvailable: boolean | null }) {
  const steps: { id: Step; label: string }[] = [
    { id: "input", label: "Describe" },
    { id: "confirm", label: "Confirm" },
    { id: "results", label: "Generate & export" },
  ];
  const activeIndex = steps.findIndex((s) => s.id === step);
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Synthetic Banking Data Studio
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Describe a client&apos;s banking setup in plain language. We turn it into a
            realistic, internally-consistent test dataset — no code, no engineer.
          </p>
        </div>
        {llmAvailable !== null && (
          <Badge tone={llmAvailable ? "indigo" : "slate"}>
            {llmAvailable ? "AI interpreter: on" : "AI interpreter: off (keyword mode)"}
          </Badge>
        )}
      </div>

      <ol className="mt-5 flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <li
              className={
                i <= activeIndex
                  ? "flex items-center gap-2 font-medium text-indigo-700"
                  : "flex items-center gap-2 text-slate-400"
              }
            >
              <span
                className={
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                  (i < activeIndex
                    ? "bg-indigo-600 text-white"
                    : i === activeIndex
                      ? "border-2 border-indigo-600 text-indigo-700"
                      : "border border-slate-300 text-slate-400")
                }
              >
                {i < activeIndex ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </li>
            {i < steps.length - 1 && (
              <li aria-hidden className="h-px w-6 bg-slate-300 sm:w-10" />
            )}
          </React.Fragment>
        ))}
      </ol>
    </header>
  );
}

function InputStep({
  text,
  setText,
  onPreset,
  onInterpret,
  interpreting,
  error,
}: {
  text: string;
  setText: (t: string) => void;
  onPreset: (id: string) => void;
  onInterpret: () => void;
  interpreting: boolean;
  error: string | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-5 lg:col-span-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Describe the client configuration
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Write it the way you&apos;d explain it to a colleague. Mention the institution
          type, products, rough customer count, time period, and any edge cases that
          matter (overdrafts, large wires, dormant accounts…).
        </p>
        <div className="mt-4">
          <TextArea
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "e.g. Community bank, mostly retail. About 200 customers with checking, savings, a few auto loans and credit lines. Last 3 months of activity, lots of debit card and ACH. Include some overdrafts and a handful of new-account funding deposits."
            }
          />
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {text.trim().length === 0
              ? "Tip: start from a preset on the right."
              : `${text.trim().split(/\s+/).length} words`}
          </span>
          <Button onClick={onInterpret} disabled={interpreting}>
            {interpreting ? (
              <>
                <Spinner className="h-4 w-4" /> Interpreting…
              </>
            ) : (
              <>Interpret &rarr;</>
            )}
          </Button>
        </div>
      </Card>

      <div className="lg:col-span-2">
        <h2 className="text-sm font-semibold text-slate-900">Or start from a preset</h2>
        <p className="mt-1 text-sm text-slate-600">
          One click fills in a realistic description you can tweak.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              className="group rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>
                  {p.emoji}
                </span>
                <span className="text-sm font-medium text-slate-900">{p.label}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{p.blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
      <p>
        The LLM is used <strong>only</strong> to translate your description into a structured
        spec. All data is generated by deterministic code — balances reconcile, references
        resolve, and every dataset is validated before you see it. All names, IDs, and tax
        IDs are synthetic and deliberately invalid (never real PII).
      </p>
    </footer>
  );
}
