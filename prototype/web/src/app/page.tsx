import Link from "next/link";
import ranking from "@/data/ranking.json";

const STEPS = [
  { n: "01", kind: "human", title: "Admin sets the criteria", body: "Mandatory pass/fail checks and weights that add to 100, versioned per category. Never hard-coded." },
  { n: "02", kind: "ai", title: "AI extracts the facts", body: "One call per proposal. Every fact comes with an exact quote, or “not stated”. The AI never scores." },
  { n: "03", kind: "rules", title: "Rules check and score", body: "Quotes and numbers are checked against the document. Mandatory checks run first, then the weighted maths." },
  { n: "04", kind: "human", title: "A person approves", body: "The reviewer resolves every flag, can override with a reason, and makes the award. Everything is logged." },
] as const;

const KIND = {
  ai: { label: "AI step", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  rules: { label: "Rules", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  human: { label: "Human", cls: "bg-brand-50 text-brand-800 ring-brand-200" },
};

const SAFEGUARDS = [
  { title: "Wrong extraction", body: "No value without a quote. Code confirms the quote is in the document and the number is in the quote." },
  { title: "Made-up facts", body: "An unverified quote counts as “not stated”, worth 0 points. The AI never writes scores or reasons." },
  { title: "Manipulation", body: "Proposal text is data, not instructions. Text aimed at automated reviewers is reported, double-checked by code, and held for a person." },
  { title: "Bias", body: "Mandatory checks run before price, so a cheap but ineligible bid can’t anchor the ranking. Names don’t enter scoring." },
  { title: "Missing information", body: "Scored 0 with a warning, never guessed. The reviewer can ask the bidder to clarify." },
  { title: "Provider outage", body: "Retries, then a second AI provider, then a person. One failure never stops the batch." },
];

type Row = { proposal: string; rank: number | null; status: string; score: number | null; reason: string };
const rows = ranking as Row[];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-brand-950 text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="container-page relative grid items-center gap-12 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="animate-fade-up">
            <span className="chip bg-white/10 text-brand-100 ring-1 ring-white/15">MATACS-TH-2026-02 · AI proposal triage</span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              AI reads the proposals.<br />
              <span className="text-brand-300">Rules decide the score.</span><br />
              A person makes the award.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100/90">
              Contractor proposals in, a ranked list with a reason for every position out. The AI only
              extracts facts with exact quotes; plain code checks them, applies the admin&apos;s criteria and ranks.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/console" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-900 transition hover:bg-brand-50">
                Open the triage console <span aria-hidden>→</span>
              </Link>
              <a href="#how" className="inline-flex items-center rounded-lg px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/10">
                How it works
              </a>
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="rounded-2xl bg-white/[0.06] p-2 shadow-lift ring-1 ring-white/10">
              <div className="rounded-xl bg-white p-5 text-stone-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Commercial Solar Installation · criteria v1</p>
                  <span className="chip bg-stone-100 text-stone-600">5 proposals</span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {rows.map((r) => (
                    <li key={r.proposal} className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-stone-900 font-mono text-sm font-semibold text-white">{r.proposal}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={r.status === "ranked" ? "chip-ranked" : r.status === "flagged" ? "chip-flagged" : "chip-ineligible"}>
                            {r.status === "ranked" ? `#${r.rank}` : r.status}
                          </span>
                          {r.score !== null && <span className="font-mono text-xs text-stone-500">{r.score}/100</span>}
                        </div>
                        {r.score !== null && (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                            <div className="h-full rounded-full bg-brand-600" style={{ width: `${r.score}%` }} />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-stone-500">Live result from Gemini 3.6 Flash extraction, scored by the rules.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 py-20">
        <div className="container-page">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            AI where it adds value. Rules where they&apos;re more reliable.
          </h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-stone-400">{s.n}</span>
                  <span className={`chip ring-1 ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                </div>
                <h3 className="mt-4 font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-50/60 p-6 text-sm leading-relaxed text-brand-900">
            <strong>The line between AI and rules:</strong> the AI answers &ldquo;what does this document say?&rdquo;; code answers
            &ldquo;what does that mean for the score?&rdquo;. So the same facts always give the same ranking, and every point can
            be traced to a quote.
          </div>
        </div>
      </section>

      <section id="result" className="scroll-mt-20 border-y border-stone-200 bg-white py-20">
        <div className="container-page">
          <p className="eyebrow">On the five sample proposals</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Three ranked, one flagged, one ineligible.</h2>
          <div className="mt-10 overflow-hidden rounded-2xl border border-stone-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
                <tr><th className="px-5 py-3">Proposal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Score</th><th className="hidden px-5 py-3 md:table-cell">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.proposal} className="align-top">
                    <td className="px-5 py-4 font-mono font-semibold text-stone-900">{r.proposal}</td>
                    <td className="px-5 py-4"><span className={r.status === "ranked" ? "chip-ranked" : r.status === "flagged" ? "chip-flagged" : "chip-ineligible"}>{r.status === "ranked" ? `Ranked #${r.rank}` : r.status}</span></td>
                    <td className="px-5 py-4 font-mono text-stone-700">{r.score ?? "—"}</td>
                    <td className="hidden px-5 py-4 text-stone-600 md:table-cell">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-stone-500">
            C is held, not ranked: it contains an instruction addressed to automated reviewers. B is the cheapest, but its licence
            belongs to a subcontractor to be named later, so it fails a mandatory check before price is ever considered.
          </p>
        </div>
      </section>

      <section id="safeguards" className="scroll-mt-20 py-20">
        <div className="container-page">
          <p className="eyebrow">Risks and safeguards</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Built so a mistake is caught, not hidden.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAFEGUARDS.map((s) => (
              <div key={s.title} className="card p-6 transition hover:-translate-y-0.5">
                <h3 className="font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
