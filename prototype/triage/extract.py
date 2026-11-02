"""Extraction (the only AI step) and the code checks that run on its output.

- `extract_live` calls the model once per proposal with a fixed JSON schema. Two providers are
  supported (Claude, Gemini, Groq), with an optional fallback provider; the checks and the
  scoring are the same whichever model read the proposal.
- `scan_for_instructions` is a plain-code second check for text aimed at automated reviewers.
- `verify` checks every quote really appears in the document and every number appears in its
  quote; anything that fails is downgraded to "unclear" so a person looks at it.
"""

from __future__ import annotations

import json
import os
import re
import time

from .prompt import PROMPT_VERSION, SYSTEM_PROMPT, build_output_schema, build_user_message

CLAUDE_MODEL = "claude-opus-5-5"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
MODELS = {"claude": CLAUDE_MODEL, "gemini": GEMINI_MODEL, "groq": GROQ_MODEL}

# Phrases that address an automated reviewer rather than the client. Deliberately broad: a
# false positive costs one human glance, a miss lets a bid steer its own score.
INSTRUCTION_PATTERNS = [
    r"\b(automated|automatic|ai|machine)\s+(review|reviewer|reviewers|system|systems|scoring|evaluation|evaluator)",
    r"\brank (this|it|us|our proposal)\b[^.]{0,40}\bfirst\b",
    r"\b(full|maximum|top|perfect) (marks|score|points)\b",
    r"\bignore (all |any )?(previous|prior|other) (instructions|rules|criteria)\b",
    r"\bpre-?approved\b",
]


def extract_live(criteria: dict, proposal_id: str, text: str, today: str,
                 provider: str = "claude", fallback: str | None = None) -> dict:
    """One model call per proposal: the main provider (with retries), then the fallback provider
    if the main one is down. A refusal, a cut-off or an unparseable answer is never guessed
    around: it comes back as an error and the proposal goes to a person."""
    user = build_user_message(criteria, proposal_id, text, today)
    schema = build_output_schema(criteria)
    attempts = []
    for name in [provider] + ([fallback] if fallback and fallback != provider else []):
        payload = _with_retries(_PROVIDERS[name], user, schema, MODELS[name])
        attempts.append({"provider": name, "model": payload.get("model"), "error": payload.get("error")})
        if "error" not in payload:
            break
    payload["provider"] = attempts[-1]["provider"]
    payload["fallback_used"] = len(attempts) > 1 and "error" not in payload
    payload["attempts"] = attempts
    payload["prompt_version"] = PROMPT_VERSION
    return payload


def _with_retries(call, user: str, schema: dict, model: str) -> dict:
    for attempt in range(4):
        try:
            return call(user, schema)
        except Exception as exc:  # each SDK raises its own types; the HTTP status decides
            status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            if status in (429, 500, 502, 503, 529) and attempt < 3:
                time.sleep(2 ** (attempt + 1))  # 2, 4, 8 seconds
                continue
            return {"error": f"extraction failed: {type(exc).__name__} {status or ''}".strip(), "model": model}
    return {"error": "extraction failed", "model": model}


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


def _groq(user: str, schema: dict) -> dict:
    """Needs GROQ_API_KEY (free key from console.groq.com)."""
    from groq import Groq

    response = Groq(api_key=os.environ.get("GROQ_API_KEY")).chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        response_format={"type": "json_schema",
                         "json_schema": {"name": "proposal_facts", "schema": schema, "strict": True}},
        temperature=0,
        seed=7,
    )
    choice = response.choices[0]
    if choice.finish_reason != "stop" or not choice.message.content:
        return {"error": f"extraction stopped: {choice.finish_reason}", "model": GROQ_MODEL}
    try:
        payload = json.loads(choice.message.content)
    except json.JSONDecodeError:
        return {"error": "extraction returned invalid JSON", "model": GROQ_MODEL}
    payload["model"] = response.model
    return payload


_PROVIDERS = {"claude": _claude, "gemini": _gemini, "groq": _groq}


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
