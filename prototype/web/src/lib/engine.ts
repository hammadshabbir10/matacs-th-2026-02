/**
 * The rule engine, ported line for line from prototype/triage/{extract,score}.py so the browser
 * can verify, score and rescore instantly. `npm run parity` checks it reproduces ranking.json.
 * No AI here: the model's only job (extraction) happens in /api/extract.
 */

export type FieldType = "boolean" | "integer" | "number" | "string";
export type Status = "stated" | "not_stated" | "unclear";
export type Value = boolean | number | string | null;

export interface Field { id: string; type: FieldType; question: string }
export interface Gate { id: string; label: string; fields: string[] }
export interface Weighted {
  id: string; label: string; weight: number;
  method: "ratio_to_best" | "ratio_to_lowest" | "checklist";
  fields: string[]; limit?: number; unit?: string;
}
export interface Criteria {
  category: string; version: number | string; published_by?: string; published_at?: string;
  context: { project: string; budget_ceiling_cad: number; max_completion_weeks: number;
             experience_window_years: number; min_install_size_kw: number };
  fields: Field[]; mandatory: Gate[]; weighted: Weighted[];
}

export interface Fact { value: Value; status: Status; quote?: string | null; note?: string | null }
export type Facts = Record<string, Fact>;
export interface Extraction {
  bidder_name?: string | null; facts: Facts; embedded_instructions?: { quote: string }[];
  model?: string; provider?: string; fallback_used?: boolean; error?: string;
}
export interface Verified { facts: Facts; problems: string[]; instructions: string[] }

export interface Row {
  proposal: string; rank: number | null; status: "ranked" | "flagged" | "ineligible";
  score: number | null; reason: string;
}
export interface Detail {
  gate: "pass" | "fail" | "unclear"; gate_notes: string[]; flags: string[];
  points: Record<string, number>; inputs: Record<string, number | null>; warnings: string[]; score?: number;
}

// --- checks on the model's answer (extract.py) -------------------------------------------

const INSTRUCTION_PATTERNS = [
  /\b(automated|automatic|ai|machine)\s+(review|reviewer|reviewers|system|systems|scoring|evaluation|evaluator)/i,
  /\brank (this|it|us|our proposal)\b[^.]{0,40}\bfirst\b/i,
  /\b(full|maximum|top|perfect) (marks|score|points)\b/i,
  /\bignore (all |any )?(previous|prior|other) (instructions|rules|criteria)\b/i,
  /\bpre-?approved\b/i,
];

const normalise = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();

export const quoteFound = (quote: string | null | undefined, text: string) =>
  !!quote && normalise(text).includes(normalise(quote));

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14 };

export function numberInQuote(value: number, quote: string): boolean {
  const nums = (quote.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => parseFloat(n.replace(/,/g, "")));
  for (const [w, n] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`).test(quote.toLowerCase())) nums.push(n);
  return nums.some((n) => Math.abs(n - value) < 1e-9);
}

export function scanForInstructions(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim())
    .filter((s) => s && INSTRUCTION_PATTERNS.some((p) => p.test(s)));
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A value no real proposal could mean: the wrong type, not finite, negative, or a zero price. */
export function impossibleValue(type: FieldType, value: Value, mustBePositive: boolean): string | null {
  if (type === "boolean") return typeof value === "boolean" ? null : `value ${JSON.stringify(value)} is not yes/no`;
  if (type === "integer" || type === "number") {
    if (!isNum(value)) return `value ${JSON.stringify(value)} is not a number`;
    if (value < 0) return `value ${g(value)} is negative`;
    if (mustBePositive && value === 0) return "value is 0, which cannot be right for this field";
  }
  return null;
}

export function verify(criteria: Criteria, extraction: Extraction, text: string): Verified {
  const problems: string[] = [];
  const facts: Facts = {};
  // Fields scored "lower is better" (price, timeline) divide by the value, so they must be above 0.
  const positive = new Set(criteria.weighted.filter((w) => w.method === "ratio_to_lowest").flatMap((w) => w.fields));
  for (const f of criteria.fields) {
    const fact: Fact = { ...(extraction.facts?.[f.id] ?? { value: null, status: "not_stated", quote: null, note: null }) };
    if (!["stated", "not_stated", "unclear"].includes(fact.status)) { fact.status = "unclear"; problems.push(`${f.id}: invalid status`); }
    if (fact.status !== "not_stated" && fact.value !== null && fact.value !== undefined) {
      const problem = impossibleValue(f.type, fact.value, positive.has(f.id));
      if (problem) {
        problems.push(`${f.id}: ${problem}`); fact.status = "unclear";
        if (!isNum(fact.value)) fact.value = null; // nothing usable to score; the reviewer sees the problem
      } else if (!quoteFound(fact.quote, text)) { problems.push(`${f.id}: quote not found in the document`); fact.status = "unclear"; }
      else if ((f.type === "integer" || f.type === "number") && !numberInQuote(Number(fact.value), fact.quote!)) {
        problems.push(`${f.id}: number ${fact.value} does not appear in its quote`); fact.status = "unclear";
      }
    }
    facts[f.id] = fact;
  }
  const fromModel = (extraction.embedded_instructions ?? []).map((i) => i.quote).filter((q) => quoteFound(q, text));
  const instructions = [...new Set([...fromModel, ...scanForInstructions(text)])].sort();
  return { facts, problems, instructions };
}

// --- gates, scoring, ranking (score.py) -----------------------------------------------------

/**
 * Python's round(): it rounds the exact value the float stores (98.45 is really
 * 98.4500000000000028..., so it goes up), and breaks exact ties to even. Done on the
 * exact decimal expansion so the browser and the prototype agree to the last digit.
 */
export function pyRound(x: number, digits: number): number {
  const neg = x < 0;
  const [int, frac = ""] = Math.abs(x).toFixed(60).split(".");
  const kept = frac.slice(0, digits);
  const next = Number(frac[digits] ?? "0");
  const tail = frac.slice(digits + 1);
  const lastKept = Number((int + kept).slice(-1));
  const up = next > 5 || (next === 5 && (/[1-9]/.test(tail) || lastKept % 2 === 1));
  let v = Number(digits ? `${int}.${kept}` : int);
  if (up) v += 10 ** -digits;
  v = Number(v.toFixed(digits));
  return neg ? -v : v;
}

/** Python's format(x, 'g') for the small numbers used in reasons. */
const g = (x: number) => (Number.isInteger(x) ? String(x) : String(parseFloat(x.toPrecision(6))));
const pyNum = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x)); // str(float) as in f"{score}"

export function validateCriteria(c: Criteria): void {
  for (const w of c.weighted) {
    if (!isNum(w.weight) || w.weight < 0) throw new Error(`criterion '${w.id}' has an invalid weight ${w.weight}`);
    if (!["ratio_to_best", "ratio_to_lowest", "checklist"].includes(w.method)) throw new Error(`criterion '${w.id}' has an unknown method ${w.method}`);
    if (w.limit !== undefined && !(isNum(w.limit) && w.limit > 0)) throw new Error(`criterion '${w.id}' has a limit of ${w.limit}, which must be above 0`);
  }
  const total = c.weighted.reduce((s, w) => s + w.weight, 0);
  if (total !== 100) throw new Error(`weighted criteria must add up to 100, got ${total}`);
  const types = Object.fromEntries(c.fields.map((f) => [f.id, f.type]));
  const gates = new Set<object>(c.mandatory);
  for (const item of [...c.mandatory, ...c.weighted]) {
    const missing = item.fields.filter((f) => !(f in types));
    if (missing.length) throw new Error(`criterion '${item.id}' uses unknown fields ${missing.join(", ")}`);
    const wanted = gates.has(item) || (item as Weighted).method === "checklist" ? ["boolean"] : ["integer", "number"];
    const wrong = item.fields.filter((f) => !wanted.includes(types[f]));
    if (wrong.length) throw new Error(`criterion '${item.id}' needs ${wanted.join(" or ")} fields, not ${wrong.join(", ")}`);
  }
}

const usable = (f: Fact) => (f.status === "stated" || f.status === "unclear") && f.value !== null ? f.value : null;

export function checkGates(c: Criteria, facts: Facts): ["pass" | "fail" | "unclear", string[]] {
  let outcome: "pass" | "fail" | "unclear" = "pass";
  const notes: string[] = [];
  for (const gate of c.mandatory) {
    const vals = gate.fields.map((f) => facts[f]);
    if (vals.some((v) => v.status === "stated" && v.value === false)) {
      outcome = "fail"; notes.push(`fails mandatory '${gate.label}'`);
    } else if (!vals.every((v) => v.status === "stated" && v.value === true)) {
      if (outcome !== "fail") outcome = "unclear";
      notes.push(`mandatory '${gate.label}' not clearly confirmed`);
    }
  }
  return [outcome, notes];
}

function criterionInput(c: Weighted, facts: Facts): number | null {
  if (c.method === "checklist") return c.fields.filter((f) => facts[f].value === true).length;
  const vals = c.fields.map((f) => usable(facts[f]));
  return vals.some((v) => v === null) ? null : vals.reduce<number>((s, v) => s + Number(v), 0);
}

/** Negative values never score; "lower is better" values must be above 0 (they are divided by). */
const valid = (w: Weighted, v: number) => (w.method === "ratio_to_lowest" ? v > 0 : v >= 0);

export function scorePool(c: Criteria, pool: Record<string, Facts>) {
  const results: Record<string, { points: Record<string, number>; inputs: Record<string, number | null>; warnings: string[]; score: number }> = {};
  for (const pid of Object.keys(pool)) results[pid] = { points: {}, inputs: {}, warnings: [], score: 0 };
  for (const w of c.weighted) {
    const inputs: Record<string, number | null> = {};
    for (const [pid, facts] of Object.entries(pool)) inputs[pid] = criterionInput(w, facts);
    const ok = Object.values(inputs).filter((v): v is number => v !== null && valid(w, v) && (w.limit === undefined || v <= w.limit));
    for (const [pid, v] of Object.entries(inputs)) {
      results[pid].inputs[w.id] = v;
      let share: number;
      if (w.method === "checklist") share = (v as number) / w.fields.length;
      else if (v === null) { share = 0; results[pid].warnings.push(`${w.label.toLowerCase()} not stated (0 points)`); }
      else if (!valid(w, v)) { share = 0; results[pid].warnings.push(`${w.label.toLowerCase()} ${g(v)} is not a valid value (0 points)`); }
      else if (w.limit !== undefined && v > w.limit) {
        share = 0; results[pid].warnings.push(`${w.label.toLowerCase()} ${g(v)} exceeds the limit of ${g(w.limit)}`);
      } else if (w.method === "ratio_to_best") { const best = Math.max(...ok); share = best > 0 ? v / best : 0; } // everyone at 0: no one earns these points
      else share = Math.min(...ok) / v;
      results[pid].points[w.id] = pyRound(share * w.weight, 2);
    }
    for (const [pid, facts] of Object.entries(pool)) {
      for (const f of w.fields) {
        if (facts[f].status === "unclear") {
          const note = (facts[f].note || "unclear").replace(/\.+$/, "");
          results[pid].warnings.push(`${w.label.toLowerCase()}: ${note[0].toLowerCase()}${note.slice(1)}`);
        }
      }
    }
  }
  for (const r of Object.values(results)) r.score = pyRound(Object.values(r.points).reduce((s, p) => s + p, 0), 1);
  return results;
}

function describe(w: Weighted, value: number | null): string {
  const label = w.label.toLowerCase();
  if (value === null) return `${label} (not stated)`;
  if (w.method === "checklist") return `${label} (${value}/${w.fields.length} elements)`;
  if (w.unit === "CAD") return `${label} ($${Math.round(value).toLocaleString("en-US")})`;
  return `${label} (${g(value)} ${w.unit ?? ""})`.replace(" )", ")");
}

function reason(c: Criteria, r: { points: Record<string, number>; inputs: Record<string, number | null>; warnings: string[]; score: number }, rank: number, n: number): string {
  const byId = Object.fromEntries(c.weighted.map((w) => [w.id, w]));
  const share = Object.entries(r.points).map(([id, p]) => [id, p / byId[id].weight] as const);
  const strong = [...share].sort((a, b) => b[1] - a[1]).filter(([, s]) => s >= 0.95).slice(0, 3).map(([id]) => describe(byId[id], r.inputs[id]));
  const weak = [...share].sort((a, b) => a[1] - b[1]).filter(([, s]) => s < 0.75).slice(0, 2).map(([id]) => describe(byId[id], r.inputs[id]));
  const parts = [`#${rank} of ${n}, ${pyNum(r.score)}/100`];
  if (strong.length) parts.push("strongest on " + strong.join(", "));
  if (weak.length) parts.push("loses points on " + weak.join(", "));
  if (r.warnings.length) parts.push("check: " + r.warnings.join("; "));
  return parts.join("; ") + ".";
}

export interface Override { proposal: string; field: string; value: Value; status: Status; reason: string }

export function rank(c: Criteria, verified: Record<string, Verified>, cleared: Set<string> = new Set()): { rows: Row[]; detail: Record<string, Detail> } {
  const ids = Object.keys(verified).sort();
  const gates = Object.fromEntries(ids.map((p) => [p, checkGates(c, verified[p].facts)]));
  const pool = Object.fromEntries(ids.filter((p) => gates[p][0] !== "fail").map((p) => [p, verified[p].facts]));
  const scored = scorePool(c, pool);
  const rows: Row[] = [];
  const detail: Record<string, Detail> = {};
  const rankable: string[] = [];
  for (const pid of ids) {
    const [outcome, gateNotes] = gates[pid];
    let flags = [...verified[pid].problems];
    if (verified[pid].instructions.length) flags.push("contains instructions addressed to automated reviewers");
    if (outcome === "unclear") flags.push(...gateNotes);
    if (cleared.has(pid)) flags = [];
    const s = scored[pid];
    detail[pid] = { gate: outcome, gate_notes: gateNotes, flags, points: s?.points ?? {}, inputs: s?.inputs ?? {},
                    warnings: s?.warnings ?? [], score: s?.score };
    if (outcome === "fail") {
      rows.push({ proposal: pid, rank: null, status: "ineligible", score: null, reason: "Not scored: " + gateNotes.join("; ") + "." });
    } else if (flags.length) {
      const also = scored[pid].warnings;
      rows.push({ proposal: pid, rank: null, status: "flagged", score: null,
        reason: "Held for human review: " + flags.join("; ") + (also.length ? `; also check: ${also.join("; ")}` : "")
          + `. Provisional score if cleared: ${pyNum(scored[pid].score)}/100.` });
    } else rankable.push(pid);
  }
  rankable.sort((a, b) => scored[b].score - scored[a].score
    || (scored[b].points.experience ?? 0) - (scored[a].points.experience ?? 0)
    || (scored[a].inputs.price ?? Infinity) - (scored[b].inputs.price ?? Infinity)
    || a.localeCompare(b));
  rankable.forEach((pid, i) => rows.push({ proposal: pid, rank: i + 1, status: "ranked", score: scored[pid].score,
    reason: reason(c, scored[pid], i + 1, rankable.length) }));
  rows.sort((a, b) => (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0) || (a.rank ?? 0) - (b.rank ?? 0) || a.proposal.localeCompare(b.proposal));
  return { rows, detail };
}

/** Apply reviewer overrides to verified facts (a new object; the saved facts are never changed). */
export function applyOverrides(verified: Record<string, Verified>, overrides: Override[]): Record<string, Verified> {
  const out: Record<string, Verified> = JSON.parse(JSON.stringify(verified));
  for (const o of overrides) {
    if (out[o.proposal]?.facts[o.field]) out[o.proposal].facts[o.field] = { ...out[o.proposal].facts[o.field], value: o.value, status: o.status, note: `Reviewer override: ${o.reason}` };
  }
  return out;
}
