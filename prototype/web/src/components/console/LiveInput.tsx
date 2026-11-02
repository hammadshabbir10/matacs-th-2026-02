"use client";

import { useState } from "react";
import type { LiveDoc } from "./types";

interface Props {
  docs: LiveDoc[];
  setDocs: (d: LiveDoc[]) => void;
  running: boolean;
  progress: Record<string, string>;
  onRun: () => void;
  liveAvailable: boolean;
  providers: string;
}

const nextId = (docs: LiveDoc[]) => {
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!docs.some((d) => d.id === c)) return c;
  return String(docs.length + 1);
};

async function readFile(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text as string;
  }
  return file.text();
}

/** Live mode input: one entry per proposal, pasted or uploaded (.txt or .pdf, read in the browser). */
export function LiveInput({ docs, setDocs, running, progress, onRun, liveAvailable, providers }: Props) {
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    let next = [...docs];
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        const text = (await readFile(f)).trim();
        if (!text) { setError(`${f.name}: no text found (a scanned PDF needs OCR first).`); continue; }
        next = [...next, { id: nextId(next), name: f.name, text }];
      } catch {
        setError(`${f.name}: couldn't read this file.`);
      }
    }
    setDocs(next);
  };

  return (
    <section className="card overflow-hidden" aria-label="Proposals to read">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-stone-900">Proposals</p>
          <p className="text-xs text-stone-500">Paste text or upload .txt / .pdf. Up to 8, read one at a time.</p>
        </div>
        <div className="flex gap-2">
          <label className="btn-ghost cursor-pointer px-3 py-1.5 text-xs">
            Upload files
            <input type="file" accept=".txt,.pdf,text/plain,application/pdf" multiple className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={docs.length >= 8}
            onClick={() => setDocs([...docs, { id: nextId(docs), name: "pasted text", text: "" }])}>+ Paste a proposal</button>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        {docs.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
            Add the proposals you want ranked. To reproduce the assessment result, paste proposals A–E from the brief.
          </p>
        )}
        {docs.map((d, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input aria-label="Proposal id" value={d.id} maxLength={12}
                onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, id: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") } : x)))}
                className="input w-16 py-1 text-center font-mono font-semibold" />
              <span className="truncate text-xs text-stone-500">{d.name} · {d.text.length.toLocaleString()} characters</span>
              {progress[d.id] && <span className="ml-auto text-xs font-medium text-brand-700">{progress[d.id]}</span>}
              <button type="button" aria-label={`Remove ${d.id}`} className="ml-auto text-stone-400 hover:text-rose-600"
                onClick={() => setDocs(docs.filter((_, j) => j !== i))}>✕</button>
            </div>
            <textarea value={d.text} rows={4} placeholder="Paste the proposal text here…"
              onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              className="input mt-2 font-mono text-xs leading-relaxed" />
          </div>
        ))}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" className="btn-primary" disabled={!liveAvailable || running || docs.length === 0 || docs.some((d) => d.text.trim().length < 40 || !d.id)}
            onClick={onRun}>
            {running ? <><span className="h-2 w-2 animate-pulse2 rounded-full bg-white" /> Reading proposals…</> : "Run AI extraction and rank"}
          </button>
          <span className="text-xs text-stone-500">{liveAvailable ? `AI: ${providers}` : "Live mode is off: no AI key is configured on this server. Use the saved run."}</span>
        </div>
      </div>
    </section>
  );
}
