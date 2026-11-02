/**
 * Parity check: the browser engine must reproduce the Python prototype exactly.
 *  1. The prompt and schema equal `python -m triage.run --print-prompt` (fixture written by the
 *     Python side into scripts/prompt-fixture.txt).
 *  2. Scoring the saved run gives exactly the rows in ../../ranking.json.
 * Run: npm run parity
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import criteria from "../src/data/criteria.v1.json";
import saved from "../src/data/saved-run.json";
import { rank, validateCriteria, type Criteria, type Verified } from "../src/lib/engine";
import { buildOutputSchema, buildUserMessage, SYSTEM_PROMPT } from "../src/lib/prompt";

const c = criteria as unknown as Criteria;
validateCriteria(c);
let failed = 0;

const fixture = readFileSync(join(__dirname, "prompt-fixture.txt"), "utf8").replace(/\r\n/g, "\n");
const ours = `=== SYSTEM ===\n${SYSTEM_PROMPT}\n\n=== USER (template) ===\n${buildUserMessage(c, "{letter}", "{extracted PDF text}", "2026-11-02")}\n\n=== OUTPUT SCHEMA ===\n${JSON.stringify(buildOutputSchema(c), null, 2)}\n`;
if (ours !== fixture) { failed++; console.error("PROMPT MISMATCH with the Python prototype"); }
else console.log("prompt + schema: identical to the Python prototype");

const verified: Record<string, Verified> = {};
for (const [pid, p] of Object.entries(saved.proposals)) {
  verified[pid] = { facts: p.facts as Verified["facts"], problems: p.problems, instructions: Array(p.instructions_found).fill("(withheld)") };
}
const expected = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "ranking.json"), "utf8"));
const { rows } = rank(c, verified);
const a = JSON.stringify(rows, null, 2), b = JSON.stringify(expected, null, 2);
if (a !== b) { failed++; console.error("RANKING MISMATCH\n--- engine ---\n" + a + "\n--- ranking.json ---\n" + b); }
else console.log("ranking: identical to ranking.json (" + rows.length + " rows)");

const copy = readFileSync(join(__dirname, "..", "src", "data", "ranking.json"), "utf8");
if (JSON.stringify(JSON.parse(copy)) !== JSON.stringify(expected)) { failed++; console.error("src/data/ranking.json is out of date: copy ../../ranking.json"); }
else console.log("app copy of ranking.json: up to date");

process.exit(failed ? 1 : 0);
