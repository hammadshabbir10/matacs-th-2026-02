# Web console

A Next.js front end for the same pipeline as the Python prototype.
Live: [proposal-triage.vercel.app](https://proposal-triage.vercel.app).

- **Saved run (no key needed).** Proposals A–E as read live by Gemini 3.6 Flash. Every quote was
  verified at run time; the quotes and the proposal text are withheld here because the brief must
  not be redistributed. Scoring runs in the browser from the saved facts.
- **Live run.** Paste or upload proposals (`.txt` or `.pdf`, read in the browser). The server sends
  each one to Gemini, falls back to Groq if Gemini is down, and returns facts with quotes. The
  browser verifies the quotes and scores with the same rules.

Both modes let you:
- edit the criteria as a new version, with a reason, and watch the list rescore;
- override any fact, with a reason;
- clear a flag after review;
- record the award decision;
- download `ranking.json` and an audit record.

| File | What it does |
|---|---|
| [`src/lib/engine.ts`](src/lib/engine.ts) | Checks, gates, scoring and ranking: a line-for-line port of the Python prototype |
| [`src/lib/prompt.ts`](src/lib/prompt.ts) | The extraction prompt and schema (identical to `PROMPTS.md`) |
| [`src/lib/llm.ts`](src/lib/llm.ts) | Server only: the Gemini / Groq calls, retries and fallback. Keys never reach the browser. |
| [`src/app/api/extract/route.ts`](src/app/api/extract/route.ts) | Extracts one proposal per request, with size limits and a request limit to protect the free quota |
| [`src/data/saved-run.json`](src/data/saved-run.json) | The saved live run: values and statuses only, no proposal text |
| [`scripts/parity.ts`](scripts/parity.ts) | Proves the browser engine matches the Python prototype: same prompt, same ranking |

## Run locally

```bash
cd prototype/web
npm install
npm run parity        # engine and prompt match the Python prototype
npm run dev           # http://localhost:3000
```

For the live run, create `prototype/web/.env.local` (git ignores it) with `GEMINI_API_KEY=...` and,
optionally, `GROQ_API_KEY=...`.

## Deploy on Vercel

1. Import the repository, and set **Root Directory** to `prototype/web` (Framework: Next.js).
2. Under **Settings → Environment Variables**, add `GEMINI_API_KEY` and optionally `GROQ_API_KEY`.
   Optional: `TRIAGE_GEMINI_MODEL` (default `gemini-3.6-flash`) and `TRIAGE_GROQ_MODEL`
   (default `openai/gpt-oss-120b`).
3. Deploy. Without keys, live mode shows as off and the saved run still works.
