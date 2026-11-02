import { NextResponse } from "next/server";
import criteria from "@/data/criteria.v1.json";
import type { Criteria } from "@/lib/engine";
import { availableProviders, extractLive } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // one proposal per request; retries can take a few seconds

const MAX_CHARS = 30_000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>(); // best-effort, per instance: protects the free quota

/** Extract the facts for ONE proposal. Scoring happens in the browser with the same rules. */
export async function POST(req: Request) {
  if (!availableProviders().length) {
    return NextResponse.json({ error: "Live mode is off: no AI key is configured on the server." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }
  hits.set(ip, [...recent, now]);

  let body: { id?: unknown; text?: unknown; today?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{1,12}$/.test(body.id) ? body.id : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!id) return NextResponse.json({ error: "Give the proposal a short id (letters or digits)." }, { status: 400 });
  if (text.length < 40) return NextResponse.json({ error: "The proposal text is too short." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: `The proposal text is over ${MAX_CHARS.toLocaleString()} characters.` }, { status: 413 });

  const extraction = await extractLive(criteria as unknown as Criteria, id, text, today);
  return NextResponse.json(extraction);
}
