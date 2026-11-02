# AI proposal triage: process design

| | |
|---|---|
| **Name** | Hammad Shabbir |
| **Reference** | MATACS-TH-2026-02 |
| **Time actually spent** | About 2 hours for the required design (diagram, write-up, prompt, ranking), plus about 2 hours on the optional prototype and web app. All on 2 November 2026. |

**The idea: AI reads, rules decide, a person approves.** The AI turns each proposal into facts, each
backed by an exact quote. Plain code checks the facts, applies the admin's criteria and ranks. A
reviewer resolves anything flagged, and a person makes the award.

## Files

| File | What it contains |
|---|---|
| [`diagram/process-flow.png`](diagram/process-flow.png) | The flow from upload to ranked list: the AI step, rule-based steps, human checkpoints, review queue and audit log |
| [`WRITEUP.md`](WRITEUP.md) | Answers to the five questions, and how the sample set comes out |
| [`PROMPTS.md`](PROMPTS.md) | The extraction prompt and output schema, exactly as sent |
| [`ranking.json`](ranking.json) | The ranking of proposals A–E |
| [`prototype/`](prototype/) | Optional: a Python script that runs the prompt, checks the output and scores it, with 13 tests ([how to run](prototype/README.md)) |
| [`prototype/web/`](prototype/web/) | Optional: a web console for the same pipeline, with a saved run (no key needed) and a live run ([details](prototype/web/README.md)) |
| [`.env.example`](.env.example) | The settings for live AI calls. No keys are committed. |

## Result on the sample set

| | Status | Score | In short |
|---|---|---|---|
| A | Ranked #1 | 98.5 | Most experience, fastest, full team plan |
| E | Ranked #2 | 84.8 | Best warranty and monitoring, less experience |
| D | Ranked #3 | 70.3 | Lowest eligible price; completion time not stated |
| C | Flagged | — | Contains an instruction aimed at automated reviewers |
| B | Ineligible | — | Licence held by a subcontractor, not the bidder |

`ranking.json` comes from a **live run**. Gemini 3.6 Flash extracted the facts from the five
proposals, the code verified every quote and number against the text, and the rules scored them.
The model's 60 extracted facts matched what I expected for every proposal. The web app's scoring
engine is a port of the Python one, and a parity check confirms it reproduces `ranking.json` exactly.

## How I used AI

I used Claude Code as a working partner. It turned the brief and rubric into a plan, found the edge
cases in the sample set, drafted the prompt, the write-up and the diagram, and wrote the prototype,
the web app and the tests. I made the design decisions: AI only for extraction, C held for review
rather than ranked, D ranked with 0 timeline points, scores relative to the best bid. I checked
every figure in the ranking.

**Where I corrected the AI:**
- **The model.** It set the extraction model to `gemini-2.5-flash`, then to `gemini-3.5-flash`. My
  Google AI Studio dashboard showed **Gemini 3.6 Flash** was available, so I had it switched to the
  newer model.
- **Reliability.** On the free tier, the first live run failed with `503 high demand` errors, and
  the script simply crashed. I asked for a second provider instead. The pipeline now retries, then
  falls back to Groq, and only then hands the proposal to a person. Testing that fallback showed why
  the checks matter: the weaker model read B's licence as "not stated" instead of "held by a
  subcontractor", and the design flagged B for a person instead of passing it.

## Run the web app (optional)

Deploy `prototype/web` on Vercel (Root Directory: `prototype/web`). Add `GEMINI_API_KEY` and,
optionally, `GROQ_API_KEY` as environment variables for the live run. Without keys, the saved run
still shows the full result. Details: [`prototype/web/README.md`](prototype/web/README.md).
