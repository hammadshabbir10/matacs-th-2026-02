"""Extraction (the only AI step) and the code checks that run on its output.

- `extract_live` calls Claude once per proposal with structured outputs.
- `scan_for_instructions` is a plain-code second check for text aimed at automated reviewers.
- `verify` checks every quote really appears in the document and every number appears in its
  quote; anything that fails is downgraded to "unclear" so a person looks at it.
"""

from __future__ import annotations

import json
import re

from .prompt import PROMPT_VERSION, SYSTEM_PROMPT, build_output_schema, build_user_message

MODEL = "claude-opus-5-5"

# Phrases that address an automated reviewer rather than the client. Deliberately broad: a
# false positive costs one human glance, a miss lets a bid steer its own score.
INSTRUCTION_PATTERNS = [
    r"\b(automated|automatic|ai|machine)\s+(review|reviewer|reviewers|system|systems|scoring|evaluation|evaluator)",
    r"\brank (this|it|us|our proposal)\b[^.]{0,40}\bfirst\b",
    r"\b(full|maximum|top|perfect) (marks|score|points)\b",
    r"\bignore (all |any )?(previous|prior|other) (instructions|rules|criteria)\b",
    r"\bpre-?approved\b",
]


def extract_live(criteria: dict, proposal_id: str, text: str, today: str) -> dict:
    """One Claude call per proposal. Requires ANTHROPIC_API_KEY (see .env.example)."""
    import anthropic  # imported here so offline replay needs no SDK or key

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_message(criteria, proposal_id, text, today)}],
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": build_output_schema(criteria)},
        },
    )
    if response.stop_reason != "end_turn":
        # A refusal or a truncated answer is never guessed around: the proposal goes to a person.
        return {"error": f"extraction stopped: {response.stop_reason}", "model": response.model}
    payload = json.loads(next(b.text for b in response.content if b.type == "text"))
    payload["model"] = response.model
    payload["prompt_version"] = PROMPT_VERSION
    return payload


def _normalise(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def quote_found(quote: str | None, text: str) -> bool:
    return bool(quote) and _normalise(quote) in _normalise(text)


def number_in_quote(value: float, quote: str) -> bool:
    numbers = [float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*(?:\.\d+)?", quote)]
    words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
             "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14}
    numbers += [n for w, n in words.items() if re.search(rf"\b{w}\b", quote.lower())]
    return any(abs(n - value) < 1e-9 for n in numbers)


def scan_for_instructions(text: str) -> list[str]:
    hits = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        if any(re.search(p, sentence, re.IGNORECASE) for p in INSTRUCTION_PATTERNS):
            hits.append(sentence.strip())
    return hits


def verify(criteria: dict, extraction: dict, text: str) -> dict:
    """Return verified facts plus a list of problems. Never raises on bad model output."""
    problems: list[str] = []
    facts: dict[str, dict] = {}
    types = {f["id"]: f["type"] for f in criteria["fields"]}
    raw = extraction.get("facts") or {}

    for field_id, value_type in types.items():
        fact = dict(raw.get(field_id) or {"value": None, "status": "not_stated", "quote": None, "note": None})
        if fact.get("status") not in ("stated", "not_stated", "unclear"):
            fact["status"] = "unclear"
            problems.append(f"{field_id}: invalid status")
        if fact["status"] != "not_stated" and fact.get("value") is not None:
            if not quote_found(fact.get("quote"), text):
                problems.append(f"{field_id}: quote not found in the document")
                fact["status"] = "unclear"
            elif value_type in ("integer", "number") and not number_in_quote(float(fact["value"]), fact["quote"]):
                problems.append(f"{field_id}: number {fact['value']} does not appear in its quote")
                fact["status"] = "unclear"
        facts[field_id] = fact

    model_hits = [i["quote"] for i in extraction.get("embedded_instructions", []) if quote_found(i.get("quote"), text)]
    code_hits = scan_for_instructions(text)
    return {
        "facts": facts,
        "problems": problems,
        "embedded_instructions": sorted(set(model_hits + code_hits)),
    }
