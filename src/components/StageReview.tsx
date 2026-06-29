"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { GenerationSpec } from "@/lib/domain/spec";
import type { Confidence, InterpretSource, Provenance, ProvenanceField } from "@/lib/interpret/merge";
import { Button, Spinner, cn } from "./ui";
import { RequestCard } from "./RequestCard";
import { AdvancedPanel } from "./AdvancedPanel";

export function StageReview({
  spec,
  onChange,
  provenance,
  onMarkStated,
  notes,
  source,
  model,
  confidence,
  onGenerate,
  generating,
  onEditDescription,
  getShareUrl,
}: {
  spec: GenerationSpec;
  onChange: (s: GenerationSpec) => void;
  provenance: Provenance;
  onMarkStated: (field: ProvenanceField) => void;
  notes: string[];
  source: InterpretSource | null;
  model?: string;
  confidence: Confidence;
  onGenerate: () => void;
  generating: boolean;
  onEditDescription: () => void;
  getShareUrl: () => string;
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-8">
          <RequestCard
            spec={spec}
            onChange={onChange}
            provenance={provenance}
            onMarkStated={onMarkStated}
            notes={notes}
            source={source}
            model={model}
            confidence={confidence}
            getShareUrl={getShareUrl}
          />

          <div className="mt-3 rounded-lg border border-line bg-surface">
            <button
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-ink"
            >
              {advancedOpen ? (
                <ChevronDown className="h-4 w-4 text-ink-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              )}
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" />
              Advanced — fine-tune
              <span className="ml-1 text-[12px] font-normal text-ink-faint">
                transaction mix, business &amp; joint ratios
              </span>
            </button>
            {advancedOpen && (
              <div className="border-t border-line px-4 py-4">
                <AdvancedPanel spec={spec} onChange={onChange} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none border-t border-line bg-paper">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-5 py-3">
          <Button variant="secondary" onClick={onEditDescription}>
            Edit description
          </Button>
          <Button onClick={onGenerate} disabled={generating} className={cn("min-w-[160px]")}>
            {generating ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            Generate dataset
          </Button>
        </div>
      </div>
    </div>
  );
}
