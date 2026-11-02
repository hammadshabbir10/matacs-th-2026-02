"use client";

import { useState } from "react";
import type { Criteria, Detail, Fact, Override, Row, Status, Value } from "@/lib/engine";
import { CRITERION_COLOURS } from "./types";

interface Props {
  row: Row;
  detail: Detail;
  criteria: Criteria;
  facts: Record<string, Fact>;
  quotesAvailable: boolean;
  move: number | null; // positions moved vs criteria v1 (positive = up)
  overrides: Override[];
  model?: string;
  fallbackUsed?: boolean;
  cleared?: string;
  onOverride: (o: Override) => void;
  onClear: (reason: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  licence_held_by_bidder: "Licence held by the bidder",
  wsib_clearance: "WSIB clearance",
  liability_insurance_5m: "$5M liability insurance",
  qualifying_installs: "Installs ≥100 kW, last 5 years",
  price_cad: "Total price (CAD)",
  completion_weeks: "Completion (weeks)",
  panel_warranty_years: "Panel warranty (years)",
  workmanship_warranty_years: "Workmanship warranty (years)",
  named_project_lead: "Named project lead",
  crew_described: "Crew described",
  safety_plan: "Safety plan",
  monitoring_plan: "Performance monitoring",
};

const STATUS_CHIP = { ranked: "chip-ranked", flagged: "chip-flagged", ineligible: "chip-ineligible" } as const;

export function ResultCard(p: Props) {
  const [open, setOpen] = useState(p.row.rank === 1);
  const [clearing, setClearing] = useState(false);
  const [clearReason, setClearReason] = useState("");
  const { row, detail, criteria } = p;
  const fieldLabel = Object.fromEntries(criteria.fields.map((f) => [f.id, FIELD_LABELS[f.id] ?? f.id.replace(/_/g, " ")]));
  const border = row.status === "ranked" ? "border-l-brand-600" : row.status === "flagged" ? "border-l-amber-500" : "border-l-rose-500";

  return (
    <article className={`card overflow-hidden border-l-4 ${border} animate-fade-up`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-stone-50/70">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 font-mono text-lg font-semibold text-white">{row.proposal}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={STATUS_CHIP[row.status]}>{row.status === "ranked" ? `Rank #${row.rank}` : row.status === "flagged" ? "Flagged · held for review" : "Ineligible"}</span>
            {row.score !== null && <span className="font-mono text-sm font-semibold text-stone-800">{row.score}<span className="text-stone-400">/100</span></span>}
            {row.status === "flagged" && detail.score !== undefined && <span className="font-mono text-xs text-stone-500">provisional {detail.score}</span>}
            {p.move !== null && p.move !== 0 && (
              <span className={`chip ${p.move > 0 ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-600"}`}>{p.move > 0 ? `▲ ${p.move}` : `▼ ${-p.move}`} vs v1</span>
            )}
            {p.cleared && <span className="chip bg-stone-100 text-stone-600">flag cleared by reviewer</span>}
            {p.overrides.length > 0 && <span className="chip bg-violet-50 text-violet-700">{p.overrides.length} override{p.overrides.length > 1 ? "s" : ""}</span>}
          </div>
          {row.status !== "ineligible" && detail.score !== undefined && (
            <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
              {criteria.weighted.map((w) => (
                <span key={w.id} style={{ width: `${detail.points[w.id] ?? 0}%`, background: CRITERION_COLOURS[w.id], opacity: row.status === "flagged" ? 0.45 : 1 }} />
              ))}
            </div>
          )}
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{row.reason}</p>
        </div>
        <span className={`mt-1 text-stone-400 transition ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone-500">
            <span>Mandatory checks: <strong className={detail.gate === "pass" ? "text-brand-700" : detail.gate === "fail" ? "text-rose-600" : "text-amber-700"}>{detail.gate}</strong></span>
            {p.model && <span>Read by <span className="font-mono">{p.model}</span>{p.fallbackUsed ? " (fallback provider)" : ""}</span>}
          </div>

          {detail.flags.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Needs a person</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">{detail.flags.map((f) => <li key={f}>{f}</li>)}</ul>
              {!clearing ? (
                <button type="button" className="btn-ghost mt-2 px-3 py-1 text-xs" onClick={() => setClearing(true)}>Clear the flag after review</button>
              ) : (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input className="input text-xs" placeholder="What did you check? (required, logged)" value={clearReason} onChange={(e) => setClearReason(e.target.value)} />
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!clearReason.trim()} onClick={() => { p.onClear(clearReason.trim()); setClearing(false); setClearReason(""); }}>Clear</button>
                </div>
              )}
            </div>
          )}
          {p.cleared && <p className="mt-3 text-xs text-stone-600">Flag cleared by the reviewer: &ldquo;{p.cleared}&rdquo;</p>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-stone-400">
                <tr><th className="py-2 pr-3">Fact</th><th className="py-2 pr-3">Value</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Evidence</th><th className="py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70">
                {criteria.fields.map((f) => (
                  <FactRow key={f.id} id={f.id} label={fieldLabel[f.id]} type={f.type} fact={p.facts[f.id]}
                    quotesAvailable={p.quotesAvailable} overridden={p.overrides.some((o) => o.field === f.id)}
                    onOverride={(value, status, reason) => p.onOverride({ proposal: row.proposal, field: f.id, value, status, reason })} />
                ))}
              </tbody>
            </table>
          </div>

          {detail.score !== undefined && (
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {criteria.weighted.map((w) => (
                <div key={w.id} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-stone-500">{w.label}</p>
                  <p className="font-mono text-sm font-semibold text-stone-800">{(detail.points[w.id] ?? 0).toFixed(2)}<span className="text-stone-400">/{w.weight}</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function FactRow({ label, type, fact, quotesAvailable, overridden, onOverride }: {
  id: string; label: string; type: string; fact?: Fact; quotesAvailable: boolean; overridden: boolean;
  onOverride: (value: Value, status: Status, reason: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  if (!fact) return null;
  const shown = fact.value === null ? "—" : typeof fact.value === "boolean" ? (fact.value ? "yes" : "no") : typeof fact.value === "number" ? fact.value.toLocaleString("en-US") : String(fact.value);
  const statusCls = fact.status === "stated" ? "text-brand-700" : fact.status === "unclear" ? "text-amber-700" : "text-stone-400";

  const save = () => {
    const v: Value = value === "" ? null : type === "boolean" ? value === "yes" : Number(value);
    if (type !== "boolean" && v !== null && Number.isNaN(v)) return;
    onOverride(v, v === null ? "not_stated" : "stated", reason.trim());
    setEditing(false); setValue(""); setReason("");
  };

  return (
    <tr className="align-top">
      <td className="py-2 pr-3 font-medium text-stone-700">{label}</td>
      <td className="py-2 pr-3 font-mono text-stone-900">{shown}{overridden && <span className="ml-1 text-violet-600">*</span>}</td>
      <td className={`py-2 pr-3 font-semibold ${statusCls}`}>{fact.status.replace("_", " ")}</td>
      <td className="max-w-[320px] py-2 pr-3 text-stone-600">
        {quotesAvailable && fact.quote ? <q className="font-mono text-[11px] leading-relaxed text-stone-700">{fact.quote}</q>
          : fact.value !== null && fact.status !== "not_stated" ? <span className="text-stone-400">quote verified at run time · withheld</span> : null}
        {fact.note && <p className="mt-0.5 text-[11px] text-amber-800">{fact.note}</p>}
        {editing && (
          <div className="mt-2 flex flex-col gap-1.5">
            {type === "boolean" ? (
              <select className="input py-1 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">not stated</option><option value="yes">yes</option><option value="no">no</option>
              </select>
            ) : (
              <input className="input py-1 text-xs" placeholder="new value (blank = not stated)" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
            <input className="input py-1 text-xs" placeholder="Reason (required, logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-1.5">
              <button type="button" className="btn-primary px-2.5 py-1 text-[11px]" disabled={!reason.trim()} onClick={save}>Save override</button>
              <button type="button" className="btn-ghost px-2.5 py-1 text-[11px]" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </td>
      <td className="py-2 text-right">
        {!editing && <button type="button" className="text-[11px] font-semibold text-brand-700 hover:text-brand-900" onClick={() => setEditing(true)}>Override</button>}
      </td>
    </tr>
  );
}
