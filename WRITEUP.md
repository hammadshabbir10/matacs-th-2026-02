# Write-up: AI proposal triage (MATACS-TH-2026-02)

**The design in one line: AI reads, rules decide, a person approves.** The AI turns each proposal
into facts, each backed by an exact quote. Plain code checks those facts, applies the admin's
criteria and ranks. A reviewer resolves anything flagged, and a person makes the award.
Flow: [`diagram/process-flow.png`](diagram/process-flow.png).

## How the sample set comes out

| | Result | Why |
|---|---|---|
| A | **#1**, 98.5 | Most experience, fastest, complete team plan, near-lowest price |
| E | **#2**, 84.8 | Best warranty and monitoring; less experience |
| D | **#3**, 70.3 | Lowest eligible price, but no completion time stated (0 timeline points) |
| C | **Flagged** | Contains an instruction aimed at automated reviewers; held for a person (provisional 77.5) |
| B | **Ineligible** | Licence held by a subcontractor to be named later, not by the bidder |

Assumptions: "last 5 years" counts by year (2021 to today), so C's period starting in 2020 is
marked unclear. Missing information scores 0 and is never guessed. Scores are relative to the best
bid that passed the mandatory checks (lowest price ÷ this price, and so on).

## 1. AI vs. rules

AI does **one** step: reading each proposal and extracting a value per criterion, with a quote.
That is where AI adds value. Proposals say the same thing in many ways, and "electrical work by a
licensed subcontractor to be confirmed" versus "we hold a licence" is easy for a language model and
fragile for keyword rules.

Everything that changes an outcome is plain code: text extraction, checking each quote and number
against the document, the scan for planted instructions, the mandatory checks, the scoring maths,
the tie-break, the ranking and the reason lines. These must be exact, repeatable, cheap and
auditable: they enforce the admin's written policy literally, not by interpretation.

**The dividing line: AI answers "What does this document say?" and code answers "What does that
mean for the score?"** Even the reasons are built from the scores, so a reason can never contradict its score.

## 2. Consistency and explainability

- **Scoring is pure code.** Same facts and same criteria version always give the same ranking. The
  prototype's tests check this.
- **Extraction is done once and saved**, keyed by file fingerprint, prompt version and model, with
  a fixed JSON format. Ranking the same proposals twice reuses the saved facts, so the result is
  identical. (Saving the answer, not tuning randomness, is what guarantees
  repeatability.) A new model or prompt is a new version, and
  its differences are shown before anything changes.
- **Every point is traceable.** For each bid the reviewer sees points per criterion, the figure
  behind each, and the quote it came from. The ranking line says it in one sentence, for example
  "#2 of 3: strongest on warranty (37 years); loses points on experience (8 installs)".

## 3. Human in the loop

Checkpoints:
1. **The admin publishes the criteria.** The tool rejects weights that don't add to 100 or
   criteria that reference undefined fields.
2. **The reviewer must resolve every flag** before the list is final: a quote not found, an unclear
   mandatory item, a planted instruction, or an AI failure. Flagged bids still show a provisional
   score.
3. **The reviewer can override any fact or check** with a written reason. The tool rescores from
   the saved facts instead of asking the AI again.
4. **A person makes the award.** The tool only ranks.

To avoid rubber-stamping, mandatory results are confirmed one by one, not with a single "approve
all".

Logged for audit (append-only): file fingerprints, criteria version, prompt version and model, the
AI's raw answer, check results, points per criterion with quotes, every override (who, when, old
value, new value, why) and the final decision with its owner.

## 4. Changing criteria

Criteria are versioned. An edit creates a new version and never alters one already used. Existing
results keep the version they were scored with and are marked "criteria changed".

- **Weights or limits change:** rescore instantly from the saved facts, at no AI cost, and show
  each bid's old and new position side by side.
- **A new or reworded criterion:** extract only that field again for the affected proposals.
- **Edits after scoring require a reason** and are logged, so weights can't be quietly tuned
  toward a bidder.

Every ranking states which criteria version produced it.

## 5. Risks and safeguards

| Risk | Safeguard |
|---|---|
| Wrong extraction | Every value needs a quote. Code confirms the quote is in the document and the number is in the quote; impossible values (negative or zero price, text for a number) are flagged. Failures go to the reviewer, who sees the quotes. |
| Made-up facts | No verified quote means "not stated" (0 points). The AI never writes scores or reasons. |
| Manipulation (as in C) | Proposal text is treated as data; the AI must report, not obey, instructions in it; a separate keyword scan double-checks; the bid is held for a person. Hidden text (white font, metadata) is extracted and flagged. |
| Bias | The AI doesn't score. Bidder name, size and location don't enter scoring. Mandatory checks run before price, so a cheap but ineligible bid (B) can't anchor the ranking. |
| Missing or vague information | Scored 0 with a warning, never filled in (D's timeline). The reviewer can ask the bidder to clarify. |
| Unequal comparisons | Price scope is recorded (only A says its price includes permits and connection) and shown to the reviewer. |
| Poor scans | Low OCR confidence sends the proposal to review. |
| Cost | One AI call per proposal, saved and reused; rescoring is free; very long files trigger an alert. |
| Provider outage or model swap | Retries, then a second provider, then a person. In testing, the fallback model read B's licence as "not stated" instead of "held by a subcontractor", so B was flagged for a person rather than passed. |
| Over-reliance on the tool | The tool ranks, a person awards; flags are resolved individually. |
| Confidential bids | An API account that doesn't train on inputs; files and logs access-controlled. |
