# Prototype

A small script that runs the extraction prompt on proposals, checks the output with code, scores it
with the admin's criteria and writes `ranking.json` plus an audit record.

| File | What it does |
|---|---|
| [`criteria/commercial-solar-installation.v1.json`](criteria/commercial-solar-installation.v1.json) | The admin's criteria for this category: fields to extract, mandatory gates, weighted criteria. Versioned. |
| [`triage/prompt.py`](triage/prompt.py) | Builds the prompt and JSON schema from the criteria (the AI step's input). |
| [`triage/extract.py`](triage/extract.py) | The one Claude call per proposal, plus the code checks on its output: quotes must appear in the document, numbers must appear in their quote, and a scan for text aimed at automated reviewers. |
| [`triage/score.py`](triage/score.py) | Gates, weighted scoring, ranking, tie-break and the reason lines. Pure code. |
| [`triage/run.py`](triage/run.py) | Command line: runs everything and writes the ranking and the audit log. |
| [`tests/test_triage.py`](tests/test_triage.py) | 23 tests on invented proposals, including impossible values such as a negative price (no API key needed). |

## Run

```bash
cd prototype
pip install -r requirements.txt
python -m pytest -q                                   # tests, offline

# The brief's sample proposals are not in this repo. Save each one as A.txt ... E.txt in a folder.
python -m triage.run --print-prompt                   # the exact prompt and schema
python -m triage.run --samples ../samples --live      # needs ANTHROPIC_API_KEY (see ../.env.example)
python -m triage.run --samples ../samples --live --provider gemini   # free GEMINI_API_KEY instead
python -m triage.run --samples ../samples --replay ../extractions   # score saved extraction files
```

`--live` calls the model (Claude by default, or Gemini with `--provider gemini`) once per proposal; keys are read from `../.env`, which git ignores. It saves nothing to disk except the audit record. `--replay`
scores extraction files saved earlier, which is also how a result is reproduced exactly later.
