"""Run the triage on a folder of proposal texts.

  python -m triage.run --samples ../samples --live           # extract with Claude, then score
  python -m triage.run --samples ../samples --live --provider gemini   # free Gemini key
  python -m triage.run --samples ../samples --replay ../ext  # score saved extraction files
  python -m triage.run --print-prompt                        # show the exact prompt and schema

The sample proposals are not in this repository (the brief must not be redistributed): put
one text file per proposal, named A.txt ... E.txt, in a folder of your own.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

from .extract import CLAUDE_MODEL, GEMINI_MODEL, extract_live, verify
from .prompt import PROMPT_VERSION, SYSTEM_PROMPT, build_output_schema, build_user_message
from .score import rank, validate_criteria

HERE = Path(__file__).resolve().parent.parent
DEFAULT_CRITERIA = HERE / "criteria" / "commercial-solar-installation.v1.json"


def load_dotenv(path: Path) -> None:
    """Read KEY=value lines from the repo's .env (never committed) without overriding the shell."""
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key and not key.startswith("#") and value:
                os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--criteria", type=Path, default=DEFAULT_CRITERIA)
    ap.add_argument("--samples", type=Path, help="folder with A.txt ... E.txt")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--live", action="store_true", help="call Claude for extraction (needs ANTHROPIC_API_KEY)")
    mode.add_argument("--replay", type=Path, help="folder of saved extraction JSON files (A.json ...)")
    ap.add_argument("--provider", choices=["claude", "gemini"], default="claude")
    ap.add_argument("--save-extractions", type=Path, help="with --live: save each extraction (keep outside git)")
    ap.add_argument("--out", type=Path, default=Path("ranking.json"))
    ap.add_argument("--audit", type=Path, default=Path("audit"))
    ap.add_argument("--today", default=dt.date.today().isoformat())
    ap.add_argument("--print-prompt", action="store_true")
    args = ap.parse_args()

    load_dotenv(HERE.parent / ".env")
    criteria = json.loads(args.criteria.read_text(encoding="utf-8"))
    validate_criteria(criteria)

    if args.print_prompt:
        print("=== SYSTEM ===\n" + SYSTEM_PROMPT)
        print("\n=== USER (template) ===\n" + build_user_message(criteria, "{letter}", "{extracted PDF text}", args.today))
        print("\n=== OUTPUT SCHEMA ===\n" + json.dumps(build_output_schema(criteria), indent=2))
        return
    if not args.samples or not (args.live or args.replay):
        ap.error("--samples and one of --live / --replay are required")

    texts = {p.stem: p.read_text(encoding="utf-8") for p in sorted(args.samples.glob("*.txt"))}
    verified, audit_inputs = {}, {}
    for pid, text in texts.items():
        if args.live:
            extraction = extract_live(criteria, pid, text, args.today, args.provider)
            if args.save_extractions:
                args.save_extractions.mkdir(parents=True, exist_ok=True)
                (args.save_extractions / f"{pid}.json").write_text(json.dumps(extraction, indent=2), encoding="utf-8")
        else:
            extraction = json.loads((args.replay / f"{pid}.json").read_text(encoding="utf-8"))
        if "error" in extraction:
            extraction = {"facts": {}, "embedded_instructions": [], **extraction}
        verified[pid] = verify(criteria, extraction, text)
        if "error" in extraction:
            verified[pid]["problems"].append(extraction["error"])
        audit_inputs[pid] = {
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "extraction": extraction,
            "verification": {"problems": verified[pid]["problems"],
                             "embedded_instructions": verified[pid]["embedded_instructions"]},
        }

    rows, detail = rank(criteria, verified)
    args.out.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")

    run_id = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    args.audit.mkdir(parents=True, exist_ok=True)
    (args.audit / f"run-{run_id}.json").write_text(json.dumps({
        "run_id": run_id,
        "criteria": {"category": criteria["category"], "version": criteria["version"]},
        "prompt_version": PROMPT_VERSION,
        "extraction_mode": f"live:{args.provider}" if args.live else f"replay:{args.replay}",
        "model": (GEMINI_MODEL if args.provider == "gemini" else CLAUDE_MODEL) if args.live else None,
        "proposals": audit_inputs,
        "scoring": detail,
        "result": rows,
        "overrides": [],
        "final_decision": None,
    }, indent=2), encoding="utf-8")

    for r in rows:
        print(f"{r['proposal']}  {r['status']:<10} rank={str(r['rank']):<4} score={str(r['score']):<5} {r['reason']}")


if __name__ == "__main__":
    main()
