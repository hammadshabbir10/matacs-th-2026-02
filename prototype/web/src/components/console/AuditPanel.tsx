"use client";

import type { AuditEvent } from "./types";

const ACTOR = {
  system: "bg-sky-50 text-sky-700",
  AI: "bg-violet-50 text-violet-700",
  admin: "bg-stone-100 text-stone-700",
  reviewer: "bg-brand-50 text-brand-800",
};

export function AuditPanel({ events, onDownloadRanking, onDownloadAudit }: {
  events: AuditEvent[]; onDownloadRanking: () => void; onDownloadAudit: () => void;
}) {
  return (
    <section className="card overflow-hidden" aria-label="Audit log">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-stone-900">Audit log</p>
          <p className="text-xs text-stone-500">Append-only record of how this result was produced</p>
        </div>
      </div>
      <ol className="max-h-80 space-y-2.5 overflow-y-auto px-5 py-4">
        {[...events].reverse().map((e, i) => (
          <li key={i} className="flex gap-2.5 text-xs">
            <span className="w-14 shrink-0 font-mono text-stone-400">{e.at.slice(11, 19)}</span>
            <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ACTOR[e.actor]}`}>{e.actor}</span>
            <span className="text-stone-700">{e.message}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onDownloadRanking}>Download ranking.json</button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onDownloadAudit}>Download audit record</button>
      </div>
    </section>
  );
}
