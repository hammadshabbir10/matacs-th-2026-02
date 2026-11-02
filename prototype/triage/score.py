"""Gates, scoring, ranking and reasons. Pure code: the same facts always give the same result."""

from __future__ import annotations


def _num(fact: dict):
    """A usable value, or None if the fact is missing."""
    return fact["value"] if fact["status"] in ("stated", "unclear") and fact["value"] is not None else None


def validate_criteria(criteria: dict) -> None:
    """Refuse a criteria set an admin could not have meant: bad weights or unknown fields."""
    for c in criteria["weighted"]:
        if not isinstance(c["weight"], (int, float)) or c["weight"] < 0:
            raise ValueError(f"criterion '{c['id']}' has an invalid weight {c['weight']!r}")
        if c["method"] not in ("ratio_to_best", "ratio_to_lowest", "checklist"):
            raise ValueError(f"criterion '{c['id']}' has an unknown method {c['method']!r}")
        if c.get("limit") is not None and c["limit"] <= 0:
            raise ValueError(f"criterion '{c['id']}' has a limit of {c['limit']}, which must be above 0")
    total = sum(c["weight"] for c in criteria["weighted"])
    if total != 100:
        raise ValueError(f"weighted criteria must add up to 100, got {total}")
    types = {f["id"]: f["type"] for f in criteria["fields"]}
    for c in criteria["mandatory"] + criteria["weighted"]:
        missing = [f for f in c["fields"] if f not in types]
        if missing:
            raise ValueError(f"criterion '{c['id']}' uses unknown fields {missing}")
        wanted = ("boolean",) if c in criteria["mandatory"] or c["method"] == "checklist" else ("integer", "number")
        wrong = [f for f in c["fields"] if types[f] not in wanted]
        if wrong:
            raise ValueError(f"criterion '{c['id']}' needs {' or '.join(wanted)} fields, not {wrong}")


def check_gates(criteria: dict, facts: dict) -> tuple[str, list[str]]:
    """pass / fail / unclear for the mandatory criteria, with the reason for anything not passed."""
    outcome, notes = "pass", []
    for gate in criteria["mandatory"]:
        values = [facts[f] for f in gate["fields"]]
        if any(v["status"] == "stated" and v["value"] is False for v in values):
            outcome = "fail"
            notes.append(f"fails mandatory '{gate['label']}'")
        elif not all(v["status"] == "stated" and v["value"] is True for v in values):
            if outcome != "fail":
                outcome = "unclear"
            notes.append(f"mandatory '{gate['label']}' not clearly confirmed")
    return outcome, notes


def _criterion_input(criterion: dict, facts: dict):
    if criterion["method"] == "checklist":
        return sum(1 for f in criterion["fields"] if facts[f]["value"] is True)
    values = [_num(facts[f]) for f in criterion["fields"]]
    return None if any(v is None for v in values) else sum(values)


def _valid(criterion: dict, v) -> bool:
    """Negative values never score; "lower is better" values must be above 0 (they are divided by)."""
    return v > 0 if criterion["method"] == "ratio_to_lowest" else v >= 0


def score_pool(criteria: dict, pool: dict[str, dict]) -> dict[str, dict]:
    """Score every gate-passing proposal. Ratios are taken against the best in the pool."""
    results = {pid: {"points": {}, "inputs": {}, "warnings": []} for pid in pool}
    for c in criteria["weighted"]:
        inputs = {pid: _criterion_input(c, facts) for pid, facts in pool.items()}
        limit = c.get("limit")
        usable = {pid: v for pid, v in inputs.items()
                  if v is not None and _valid(c, v) and (limit is None or v <= limit)}
        for pid, v in inputs.items():
            results[pid]["inputs"][c["id"]] = v
            if c["method"] == "checklist":
                share = v / len(c["fields"])
            elif v is None:
                share = 0.0
                results[pid]["warnings"].append(f"{c['label'].lower()} not stated (0 points)")
            elif not _valid(c, v):
                share = 0.0
                results[pid]["warnings"].append(f"{c['label'].lower()} {v:g} is not a valid value (0 points)")
            elif limit is not None and v > limit:
                share = 0.0
                results[pid]["warnings"].append(f"{c['label'].lower()} {v:g} exceeds the limit of {limit:g}")
            elif c["method"] == "ratio_to_best":
                best = max(usable.values())
                share = v / best if best > 0 else 0.0  # everyone at 0: no one earns these points
            else:  # ratio_to_lowest
                share = min(usable.values()) / v
            results[pid]["points"][c["id"]] = round(share * c["weight"], 2)
        for pid, facts in pool.items():
            for f in c["fields"]:
                if facts[f]["status"] == "unclear":
                    note = (facts[f].get("note") or "unclear").rstrip(".")
                    results[pid]["warnings"].append(f"{c['label'].lower()}: {note[0].lower()}{note[1:]}")
    for r in results.values():
        r["score"] = round(sum(r["points"].values()), 1)
    return results


def _describe(criterion: dict, value) -> str:
    """A criterion with the figure behind it, e.g. 'price ($238,000)'."""
    label = criterion["label"].lower()
    if value is None:
        return f"{label} (not stated)"
    if criterion["method"] == "checklist":
        return f"{label} ({value}/{len(criterion['fields'])} elements)"
    if criterion.get("unit") == "CAD":
        return f"{label} (${value:,.0f})"
    return f"{label} ({value:g} {criterion.get('unit', '')})".replace(" )", ")")


def _reason(criteria: dict, r: dict, rank: int, ranked_count: int) -> str:
    by_id = {c["id"]: c for c in criteria["weighted"]}
    share = {cid: pts / by_id[cid]["weight"] for cid, pts in r["points"].items()}
    strong = [_describe(by_id[c], r["inputs"][c]) for c, s in sorted(share.items(), key=lambda x: -x[1]) if s >= 0.95][:3]
    weak = [_describe(by_id[c], r["inputs"][c]) for c, s in sorted(share.items(), key=lambda x: x[1]) if s < 0.75][:2]
    parts = [f"#{rank} of {ranked_count}, {r['score']}/100"]
    if strong:
        parts.append("strongest on " + ", ".join(strong))
    if weak:
        parts.append("loses points on " + ", ".join(weak))
    if r["warnings"]:
        parts.append("check: " + "; ".join(r["warnings"]))
    return "; ".join(parts) + "."


def rank(criteria: dict, verified: dict[str, dict]) -> tuple[list[dict], dict]:
    """Return ranking.json rows and a detail record for the audit log."""
    gates = {pid: check_gates(criteria, v["facts"]) for pid, v in verified.items()}
    pool = {pid: v["facts"] for pid, v in verified.items() if gates[pid][0] != "fail"}
    scored = score_pool(criteria, pool)

    rows, detail = [], {}
    rankable = []
    for pid in sorted(verified):
        outcome, gate_notes = gates[pid]
        flags = list(verified[pid]["problems"])
        if verified[pid]["embedded_instructions"]:
            flags.append("contains instructions addressed to automated reviewers")
        if outcome == "unclear":
            flags += gate_notes
        detail[pid] = {"gate": outcome, "gate_notes": gate_notes, "flags": flags, **scored.get(pid, {})}
        if outcome == "fail":
            rows.append({"proposal": pid, "rank": None, "status": "ineligible", "score": None,
                         "reason": "Not scored: " + "; ".join(gate_notes) + "."})
        elif flags:
            also = scored[pid]["warnings"]
            rows.append({"proposal": pid, "rank": None, "status": "flagged", "score": None,
                         "reason": "Held for human review: " + "; ".join(flags)
                         + (f"; also check: {'; '.join(also)}" if also else "")
                         + f". Provisional score if cleared: {scored[pid]['score']}/100."})
        else:
            rankable.append(pid)

    # Tie-break, fixed and documented: score, then experience points, then lower price, then letter.
    rankable.sort(key=lambda p: (-scored[p]["score"], -scored[p]["points"].get("experience", 0),
                                 scored[p]["inputs"].get("price") or float("inf"), p))
    for i, pid in enumerate(rankable, start=1):
        rows.append({"proposal": pid, "rank": i, "status": "ranked", "score": scored[pid]["score"],
                     "reason": _reason(criteria, scored[pid], i, len(rankable))})
    rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0, r["proposal"]))
    return rows, detail
