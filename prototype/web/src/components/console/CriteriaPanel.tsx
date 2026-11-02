"use client";

import { useEffect, useState } from "react";
import type { Criteria } from "@/lib/engine";
import { CRITERION_COLOURS } from "./types";

interface Props {
  applied: Criteria;
  version: string;
  onApply: (next: Criteria, reason: string) => void;
  onReset: () => void;
  changed: boolean;
}

/** Admin's criteria: view, and edit as a NEW version (an edit after scoring needs a reason). */
export function CriteriaPanel({ applied, version, onApply, onReset, changed }: Props) {
  const [draft, setDraft] = useState<Criteria>(applied);
  const [reason, setReason] = useState("");
  useEffect(() => setDraft(applied), [applied]);

  const total = draft.weighted.reduce((s, w) => s + w.weight, 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const setWeight = (id: string, weight: number) =>
    setDraft({ ...draft, weighted: draft.weighted.map((w) => (w.id === id ? { ...w, weight } : w)) });
  const setLimit = (id: string, limit: number) =>
    setDraft({ ...draft, weighted: draft.weighted.map((w) => (w.id === id ? { ...w, limit } : w)) });

  return (
    <section className="card overflow-hidden" aria-label="Criteria">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-stone-900">Criteria</p>
          <p className="text-xs text-stone-500">{applied.category}</p>
        </div>
        <span className={`chip ring-1 ${changed ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-stone-100 text-stone-600 ring-stone-200"}`}>{version}</span>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Mandatory (pass / fail)</p>
          <ul className="mt-2 space-y-1.5">
            {applied.mandatory.map((m) => (
              <li key={m.id} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />{m.label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Weighted</p>
            <span className={`font-mono text-xs ${total === 100 ? "text-brand-700" : "font-semibold text-rose-600"}`}>{total}/100</span>
          </div>
          <ul className="mt-2 space-y-2.5">
            {draft.weighted.map((w) => (
              <li key={w.id}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CRITERION_COLOURS[w.id] }} />
                  <label htmlFor={`w-${w.id}`} className="flex-1 text-sm text-stone-700">{w.label}</label>
                  <input id={`w-${w.id}`} type="number" min={0} max={100} value={w.weight}
                    onChange={(e) => setWeight(w.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="input w-16 py-1 text-right font-mono" />
                  <span className="text-xs text-stone-400">%</span>
                </div>
                {w.limit !== undefined && (
                  <div className="ml-4.5 mt-1 flex items-center gap-2 pl-[18px] text-xs text-stone-500">
                    <span>limit</span>
                    <input type="number" min={1} value={w.limit} aria-label={`${w.label} limit`}
                      onChange={(e) => setLimit(w.id, Math.max(1, Number(e.target.value) || 1))}
                      className="input w-28 py-0.5 text-right font-mono text-xs" />
                    <span>{w.unit}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {dirty && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Editing creates a new criteria version</p>
            <p className="mt-0.5 text-xs text-amber-800">Results keep the version they were scored with. An edit after scoring needs a reason, and it&apos;s logged.</p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (required)" className="input mt-2 text-xs" />
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={total !== 100 || !reason.trim()}
                onClick={() => { onApply(draft, reason.trim()); setReason(""); }}>
                Apply as new version
              </button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setDraft(applied)}>Discard</button>
            </div>
            {total !== 100 && <p className="mt-1.5 text-xs font-medium text-rose-600">Weights must add up to 100.</p>}
          </div>
        )}
        {changed && !dirty && (
          <button type="button" onClick={onReset} className="text-xs font-semibold text-brand-700 hover:text-brand-900">
            ↺ Back to v1 (as published)
          </button>
        )}
      </div>
    </section>
  );
}
