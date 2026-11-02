import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Proposal Triage · AI reads, rules decide, a person approves",
  description:
    "An AI-assisted triage tool for contractor proposals: the AI extracts facts with exact quotes, plain rules score and rank them, and a reviewer approves. MATACS-TH-2026-02.",
};

const REPO = "https://github.com/hammadshabbir10/matacs-th-2026-02";

const HIGHLIGHTS = [
  { label: "AI step", value: "Extracts facts with exact quotes", icon: "M4 6h16M4 12h10M4 18h7" },
  { label: "Rules", value: "Check, score and rank", icon: "M9 12l2 2 4-4M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" },
  { label: "Human", value: "Reviews and makes the award", icon: "M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0" },
];

const COLUMNS = [
  { title: "Product", links: [
    { href: "/console", label: "Triage console" },
    { href: "/#how", label: "How it works" },
    { href: "/#result", label: "Sample result" },
    { href: "/#safeguards", label: "Safeguards" },
  ] },
  { title: "Assessment", links: [
    { href: REPO, label: "Source on GitHub" },
    { href: `${REPO}/blob/main/WRITEUP.md`, label: "Write-up" },
    { href: `${REPO}/blob/main/PROMPTS.md`, label: "Prompt" },
    { href: `${REPO}/blob/main/ranking.json`, label: "ranking.json" },
  ] },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur">
          <div className="container-page flex h-16 items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Proposal Triage home">
              <Mark />
              <span className="text-[15px] font-semibold tracking-tight text-stone-900">
                Proposal <span className="text-brand-700">Triage</span>
              </span>
            </Link>
            <div className="flex items-center gap-6">
              <nav className="hidden items-center gap-6 text-sm text-stone-600 sm:flex" aria-label="Main">
                <Link href="/#how" className="hover:text-brand-800">How it works</Link>
                <Link href="/#result" className="hover:text-brand-800">Results</Link>
              </nav>
              <Link href="/console" className="btn-primary">Open console</Link>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="relative overflow-hidden bg-brand-950 text-white">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />

          <div className="container-page relative">
            {/* call to action */}
            <div className="flex flex-col gap-8 border-b border-white/10 py-14 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Proposals, triaged</p>
                <h2 className="mt-3 text-4xl font-light leading-tight tracking-tight sm:text-5xl">
                  Rank with <span className="font-semibold text-brand-300">evidence.</span>
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/console" className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-900 transition hover:bg-brand-50">
                  Open the console <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </Link>
                <Link href="/#how" className="inline-flex items-center rounded-lg px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/10 hover:ring-white/60">
                  How it works
                </Link>
              </div>
            </div>

            {/* highlight cards */}
            <div className="grid gap-4 py-10 sm:grid-cols-3">
              {HIGHLIGHTS.map((h) => (
                <div key={h.label} className="group flex items-center gap-4 rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.08] hover:ring-brand-400/40">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 transition-transform duration-300 group-hover:scale-110">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={h.icon} /></svg>
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">{h.label}</p>
                    <p className="mt-0.5 font-semibold">{h.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* brand + links */}
            <div className="grid gap-10 py-8 md:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-2.5">
                  <Mark light />
                  <span className="text-[15px] font-semibold tracking-tight">Proposal <span className="text-brand-300">Triage</span></span>
                </div>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-200">
                  AI reads the proposals. Rules decide the score. A person reviews and makes the award, and every step is logged.
                </p>
              </div>
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">{col.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <a href={l.href} className="group inline-flex items-center gap-1.5 text-sm text-brand-100 transition-colors hover:text-white">
                          <span className="h-px w-0 bg-brand-300 transition-all duration-300 group-hover:w-3" />
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* oversized outline wordmark */}
            <p aria-hidden className="pointer-events-none select-none text-center text-[19vw] font-bold leading-[0.8] tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(94,234,212,0.2)] lg:text-[200px]">
              Triage
            </p>
          </div>

          <div className="relative border-t border-white/10 bg-black/20">
            <div className="container-page flex flex-col gap-3 py-5 text-xs text-brand-200 sm:flex-row sm:items-center sm:justify-between">
              <p>© {new Date().getFullYear()} Proposal Triage · MATACS-TH-2026-02 assessment by Hammad Shabbir · Fictional data only</p>
              <a href="#" aria-label="Back to top" className="grid h-9 w-9 place-items-center self-start rounded-full ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white hover:text-brand-900 sm:self-auto">↑</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Mark({ light = false }: { light?: boolean }) {
  return (
    <span className={`grid h-8 w-8 place-items-center rounded-lg ${light ? "bg-white" : "bg-brand-800"}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" className={light ? "text-brand-900" : "text-white"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 6h14M8 12h8M11 18h2" />
      </svg>
    </span>
  );
}
