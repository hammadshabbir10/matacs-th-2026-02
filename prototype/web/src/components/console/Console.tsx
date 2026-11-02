"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import criteriaV1 from "@/data/criteria.v1.json";
import saved from "@/data/saved-run.json";
import { applyOverrides, rank, verify, validateCriteria, type Criteria, type Override, type Verified } from "@/lib/engine";
import { AuditPanel } from "./AuditPanel";
import { CriteriaPanel } from "./CriteriaPanel";
import { LiveInput } from "./LiveInput";
import { ResultCard } from "./ResultCard";
import { now, type AuditEvent, type LiveDoc, type LiveResult, type Mode, type ReviewState } from "./types";

const V1 = criteriaV1 as unknown as Criteria;
const EMPTY_REVIEW: ReviewState = { overrides: [], cleared: {}, decision: null };

const savedVerified: Record<string, Verified> = Object.fromEntries(
  Object.entries(saved.proposals).map(([pid, p]) => [pid, {
    facts: p.facts as Verified["facts"], problems: p.problems, instructions: Array(p.instructions_found).fill("(withheld)"),
  }]),
);

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function Console() {
  const [mode, setMode] = useState<Mode>("saved");
  const [status, setStatus] = useState<{ live: boolean; providers: { provider: string; model: string }[] } | null>(null);
  const [criteria, setCriteria] = useState<Criteria>(V1);
  const [version, setVersion] = useState("v1");
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW);
  const [docs, setDocs] = useState<LiveDoc[]>([]);
  const [live, setLive] = useState<Record<string, LiveResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionPick, setDecisionPick] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>(() => [
    { at: now(), actor: "system", message: `Loaded the saved run: ${saved.source.model}, prompt ${saved.source.prompt_version}, criteria v1. Quotes were verified at run time and are withheld here.` },
  ]);
  const log = useCallback((actor: AuditEvent["actor"], message: string) => setEvents((e) => [...e, { at: now(), actor, message }]), []);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ live: false, providers: [] }));
  }, []);

  const verified = mode === "saved" ? savedVerified : Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.verified]));
  const withOverrides = useMemo(() => applyOverrides(verified, review.overrides), [verified, review.overrides]);
  const result = useMemo(
    () => (Object.keys(withOverrides).length ? rank(criteria, withOverrides, new Set(Object.keys(review.cleared))) : null),
    [criteria, withOverrides, review.cleared],
  );
  const baseline = useMemo(() => (Object.keys(verified).length ? rank(V1, verified) : null), [verified]);
  const changed = version !== "v1" || review.overrides.length > 0 || Object.keys(review.cleared).length > 0;

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m); setReview(EMPTY_REVIEW); setDecisionPick("");
    log("system", m === "saved" ? "Switched to the saved run (no AI call)." : "Switched to live mode: proposals are read by the AI on the server.");
  };

  const applyCriteria = (next: Criteria, reason: string) => {
    validateCriteria(next);
    const diffs = next.weighted.flatMap((w) => {
      const old = criteria.weighted.find((o) => o.id === w.id)!;
      return [old.weight !== w.weight ? `${w.label} ${old.weight}→${w.weight}%` : "", old.limit !== w.limit ? `${w.label} limit ${old.limit}→${w.limit}` : ""].filter(Boolean);
    });
    const v = `v${Number(version.slice(1)) + 1}`;
    setCriteria({ ...next, version: v.slice(1) }); setVersion(v);
    log("admin", `Published criteria ${v} (${diffs.join(", ")}). Reason: ${reason}. Rescored from the saved facts, no AI call.`);
  };

  const runLive = async () => {
    setRunning(true); setLive({}); setReview(EMPTY_REVIEW);
    const today = new Date().toISOString().slice(0, 10);
    log("system", `Live run started: ${docs.length} proposal(s), criteria ${version}.`);
    const next: Record<string, LiveResult> = {};
    for (const d of docs) {
      setProgress((p) => ({ ...p, [d.id]: "reading…" }));
      try {
        const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, text: d.text, today }) });
        const extraction = await res.json();
        if (!res.ok) throw new Error(extraction.error || `HTTP ${res.status}`);
        const v = verify(V1, extraction, d.text);
        if (extraction.error) v.problems.push(extraction.error);
        next[d.id] = { extraction, verified: v };
        setLive({ ...next });
        setProgress((p) => ({ ...p, [d.id]: extraction.error ? "failed → review" : `done · ${extraction.model}` }));
        log("AI", extraction.error
          ? `${d.id}: ${extraction.error}; sent to the reviewer.`
          : `${d.id}: read by ${extraction.model}${extraction.fallback_used ? " (fallback provider)" : ""}. Code checks: ${v.problems.length ? v.problems.join("; ") : "every quote and number verified"}${v.instructions.length ? "; instruction aimed at automated reviewers found" : ""}.`);
      } catch (e) {
        setProgress((p) => ({ ...p, [d.id]: "error" }));
        log("system", `${d.id}: ${(e as Error).message}`);
      }
    }
    setRunning(false);
  };

  const addOverride = (o: Override) => {
    setReview((r) => ({ ...r, overrides: [...r.overrides.filter((x) => !(x.proposal === o.proposal && x.field === o.field)), o] }));
    const before = withOverrides[o.proposal]?.facts[o.field];
    log("reviewer", `Override on ${o.proposal} · ${o.field}: ${JSON.stringify(before?.value ?? null)} → ${JSON.stringify(o.value)}. Reason: ${o.reason}`);
  };
  const clearFlag = (pid: string, reason: string) => {
    setReview((r) => ({ ...r, cleared: { ...r.cleared, [pid]: reason } }));
    log("reviewer", `Cleared the flag on ${pid}. Reason: ${reason}`);
  };
  const recordDecision = () => {
    const d = { proposal: decisionPick, note: decisionNote.trim(), at: now() };
    setReview((r) => ({ ...r, decision: d }));
    log("reviewer", `Award decision recorded: ${d.proposal}. ${d.note}`);
    setDecisionNote("");
  };

  const ranked = result?.rows.filter((r) => r.status === "ranked") ?? [];
  const position = (rows: { proposal: string; rank: number | null }[] | undefined, pid: string) => rows?.find((r) => r.proposal === pid)?.rank ?? null;
  const providers = status?.providers.map((p) => `${p.model} (${p.provider})`).join(" → ") ?? "";

  return (
    <div className="container-page py-8 lg:py-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Triage console</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{V1.category}</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">{V1.context.project} · budget ceiling ${V1.context.budget_ceiling_cad.toLocaleString()} CAD · complete within {V1.context.max_completion_weeks} weeks</p>
        </div>
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-card" role="tablist" aria-label="Mode">
          {([["saved", "Saved run · no key needed"], ["live", "Live run · AI"]] as const).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === m ? "bg-brand-800 text-white" : "text-stone-600 hover:text-brand-800"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${mode === "saved" ? "border-brand-200 bg-brand-50/70 text-brand-900" : status?.live ? "border-violet-200 bg-violet-50 text-violet-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {mode === "saved"
          ? <>Proposals A–E as read by <strong>{saved.source.model}</strong> on {saved.source.run_date}. Quotes were verified at run time and are withheld here.</>
          : status?.live
            ? <>Live: proposals are read by <strong>{providers}</strong>; the checks and scoring run here.</>
            : <>Live mode is off here (no AI key configured). The saved run still shows the full result.</>}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* criteria, decision and log sit beside the results, so neither column runs on alone */}
        <aside className="flex flex-col gap-4">
          <CriteriaPanel applied={criteria} version={version} changed={version !== "v1"} onApply={applyCriteria}
            onReset={() => { setCriteria(V1); setVersion("v1"); log("admin", "Returned to criteria v1 (as published)."); }} />

          {result && (
            <section className="card px-5 py-4" aria-label="Award decision">
              <p className="text-sm font-semibold text-stone-900">Award decision</p>
              <p className="text-xs text-stone-500">Made by a person. The tool only ranks.</p>
              {review.decision ? (
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">Recorded: award to <strong>{review.decision.proposal}</strong>{review.decision.note ? `: ${review.decision.note}` : ""} <span className="font-mono text-xs text-brand-700">({review.decision.at.slice(0, 16).replace("T", " ")} UTC)</span></p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <select className="input" value={decisionPick} onChange={(e) => setDecisionPick(e.target.value)} aria-label="Proposal to award">
                    <option value="">Choose a ranked bid…</option>
                    {ranked.map((r) => <option key={r.proposal} value={r.proposal}>{r.proposal} · rank #{r.rank}</option>)}
                  </select>
                  <input className="input" placeholder="Note for the record (optional)" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
                  <button type="button" className="btn-primary" disabled={!decisionPick} onClick={recordDecision}>Record decision</button>
                </div>
              )}
            </section>
          )}

          <AuditPanel events={events}
            onDownloadRanking={() => result && download("ranking.json", result.rows)}
            onDownloadAudit={() => download("audit-record.json", {
              criteria_version: version, criteria, prompt_version: saved.source.prompt_version, mode,
              models: mode === "saved" ? saved.source.model : Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.extraction.model])),
              result: result?.rows ?? [], scoring: result?.detail ?? {}, overrides: review.overrides, cleared_flags: review.cleared,
              decision: review.decision, events,
            })} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {mode === "live" && (
            <LiveInput docs={docs} setDocs={setDocs} running={running} progress={progress} onRun={runLive} liveAvailable={!!status?.live} providers={providers} />
          )}

          {result ? (
            <>
              {changed && (
                <p className="text-xs text-stone-500">Positions are compared with criteria v1 and no reviewer changes. ▲ / ▼ show what moved.</p>
              )}
              {result.rows.map((row) => {
                const lr = live[row.proposal];
                return (
                  <ResultCard key={row.proposal} row={row} detail={result.detail[row.proposal]} criteria={criteria}
                    facts={withOverrides[row.proposal].facts} quotesAvailable={mode === "live"}
                    move={changed && row.rank !== null && position(baseline?.rows, row.proposal) !== null ? position(baseline?.rows, row.proposal)! - row.rank : null}
                    overrides={review.overrides.filter((o) => o.proposal === row.proposal)}
                    model={mode === "saved" ? saved.proposals[row.proposal as keyof typeof saved.proposals]?.model : lr?.extraction.model}
                    fallbackUsed={mode === "saved" ? saved.proposals[row.proposal as keyof typeof saved.proposals]?.fallback_used : lr?.extraction.fallback_used}
                    cleared={review.cleared[row.proposal]}
                    onOverride={addOverride} onClear={(reason) => clearFlag(row.proposal, reason)} />
                );
              })}

            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
