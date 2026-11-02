"""Extraction (the only AI step) and the code checks that run on its output.

- `extract_live` calls the model once per proposal with a fixed JSON schema. Two providers are
  supported (Claude and Gemini); the checks and the scoring are the same for both.
- `scan_for_instructions` is a plain-code second check for text aimed at automated reviewers.
- `verify` checks every quote really appears in the document and every number appears in its
  quote; anything that fails is downgraded to "unclear" so a person looks at it.
"""

from __future__ import annotations

import json
import os
import re

from .prompt import PROMPT_VERSION, SYSTEM_PROMPT, build_output_schema, build_user_message

CLAUDE_MODEL = "claude-opus-5-5"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Phrases that address an automated reviewer rather than the client. Deliberately broad: a
# false positive costs one human glance, a miss lets a bid steer its own score.
INSTRUCTION_PATTERNS = [
    r"\b(automated|automatic|ai|machine)\s+(review|reviewer|reviewers|system|systems|scoring|evaluation|evaluator)",
    r"\brank (this|it|us|our proposal)\b[^.]{0,40}\bfirst\b",
    r"\b(full|maximum|top|perfect) (marks|score|points)\b",
    r"\bignore (all |any )?(previous|prior|other) (instructions|rules|criteria)\b",
    r"\bpre-?approved\b",
]


def extract_live(criteria: dict, proposal_id: str, text: str, today: str, provider: str = "claude") -> dict:
    """One model call per proposal. A refusal, a cut-off or an unparseable answer is never guessed
    around: it comes back as an error and the proposal goes to a person."""
    user = build_user_message(criteria, proposal_id, text, today)
    schema = build_output_schema(criteria)
    payload = _gemini(user, schema) if provider == "gemini" else _claude(user, schema)
    payload["prompt_version"] = PROMPT_VERSION
    return payload


def _claude(user: str, schema: dict) -> dict:
    """Needs ANTHROPIC_API_KEY. Imported lazily so offline replay needs no SDK or key."""
    import anthropic

    response = anthropic.Anthropic().messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
    )
    if response.stop_reason != "end_turn":
        return {"error": f"extraction stopped: {response.stop_reason}", "model": response.model}
    payload = json.loads(next(b.text for b in response.content if b.type == "text"))
    payload["model"] = response.model
    return payload


def _gemini(user: str, schema: dict) -> dict:
    """Needs GEMINI_API_KEY (free key from Google AI Studio)."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_json_schema=schema,
            temperature=0,  # Gemini accepts these; they reduce run-to-run variation
            seed=7,
        ),
    )
    finish = response.candidates[0].finish_reason.name if response.candidates else "NO_CANDIDATE"
    if finish != "STOP" or not response.text:
        return {"error": f"extraction stopped: {finish}", "model": GEMINI_MODEL}
    try:
        payload = json.loads(response.text)
    except json.JSONDecodeError:
        return {"error": "extraction returned invalid JSON", "model": GEMINI_MODEL}
    payload["model"] = getattr(response, "model_version", None) or GEMINI_MODEL
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
