"use client";

import * as React from "react";
import { Building2, Handshake, Landmark, ShieldCheck, Sprout, Wand2 } from "lucide-react";
import { PRESETS } from "@/lib/domain/presets";
import { Button, Spinner, TextArea } from "./ui";

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  community_retail: Landmark,
  credit_union_lending: Handshake,
  business_banking: Building2,
  bsa_exceptions: ShieldCheck,
  de_novo: Sprout,
};

export function StageDescribe({
  text,
  setText,
  onInterpret,
  onTrySample,
  interpreting,
  error,
  onPreset,
}: {
  text: string;
  setText: (t: string) => void;
  onInterpret: () => void;
  onTrySample: () => void;
  interpreting: boolean;
  error: string | null;
  onPreset: (id: string) => void;
}) {
  const empty = text.trim().length === 0;
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-5 py-10 sm:py-16">
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">Describe a client&apos;s setup</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
        Describe a client&apos;s banking configuration in plain language — get a realistic, validated
        test dataset. No engineer, no ticket.
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
        Before: explain the configuration to an engineer and wait for a dataset. Now: describe it in
        plain language, review the request, and export realistic test data in minutes.
      </p>

      <div className="mt-5">
        <label htmlFor="describe" className="sr-only">
          Describe the client configuration
        </label>
        <TextArea
          id="describe"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the client configuration… e.g. Community bank, mostly retail. About 200 customers with checking, savings, a few auto loans and credit lines. Last 3 months of activity, lots of debit card and ACH. Include some overdrafts and a handful of new-account funding deposits."
          className="text-[13.5px] leading-relaxed"
        />
      </div>

      {error && (
        <div role="status" className="mt-3 rounded-md border border-fail/30 bg-fail-bg px-3 py-2 text-[12.5px] text-fail">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-ink-faint">
          {empty ? "Describe a client, or pick a preset below." : `${text.trim().split(/\s+/).length} words`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onTrySample()} disabled={interpreting}>
            Try a sample →
          </Button>
          <Button onClick={() => onInterpret()} disabled={interpreting || empty} title={empty ? "Describe a client first" : undefined}>
            {interpreting ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            Interpret
          </Button>
        </div>
      </div>

      <div className="mt-9">
        <div className="micro mb-2.5">Or start from a preset</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PRESETS.map((p) => {
            const Icon = PRESET_ICONS[p.id] ?? Landmark;
            return (
              <button
                key={p.id}
                onClick={() => onPreset(p.id)}
                className="rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong hover:bg-sunken/50"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-ink-muted" />
                  <span className="text-[13px] font-medium text-ink">{p.label}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-ink-muted">{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
