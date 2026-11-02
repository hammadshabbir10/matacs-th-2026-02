/**
 * Server-only: the one AI step. Mirrors prototype/triage/extract.py: Gemini first, then Groq if
 * Gemini is down, retrying temporary errors; anything else comes back as an error so the
 * proposal goes to a person. Keys come from environment variables and never reach the browser.
 */
import "server-only";
import type { Criteria, Extraction } from "./engine";
import { buildOutputSchema, buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";

export const GEMINI_MODEL = process.env.TRIAGE_GEMINI_MODEL || "gemini-3.6-flash";
export const GROQ_MODEL = process.env.TRIAGE_GROQ_MODEL || "openai/gpt-oss-120b";

type Provider = "gemini" | "groq";
type Attempt = { provider: Provider; model: string; error: string | null };

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

export function availableProviders(): Provider[] {
  return [process.env.GEMINI_API_KEY && "gemini", process.env.GROQ_API_KEY && "groq"].filter(Boolean) as Provider[];
}

export async function extractLive(criteria: Criteria, id: string, text: string, today: string): Promise<Extraction & { attempts: Attempt[]; prompt_version: string; fallback_used: boolean }> {
  const user = buildUserMessage(criteria, id, text, today);
  const schema = buildOutputSchema(criteria);
  const attempts: Attempt[] = [];
  let result: (Extraction & { error?: string }) | null = null;
  for (const provider of availableProviders()) {
    const model = provider === "gemini" ? GEMINI_MODEL : GROQ_MODEL;
    result = await withRetries(() => (provider === "gemini" ? gemini(user, schema) : groq(user, schema)), model);
    attempts.push({ provider, model: result.model ?? model, error: result.error ?? null });
    if (!result.error) { result.provider = provider; break; }
  }
  if (!result) result = { facts: {}, error: "no AI provider is configured", model: undefined };
  return { ...result, attempts, prompt_version: PROMPT_VERSION, fallback_used: attempts.length > 1 && !result.error };
}

async function withRetries(call: () => Promise<Extraction>, model: string): Promise<Extraction & { error?: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await call();
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      if (RETRYABLE.has(status) && attempt < 3) { await new Promise((r) => setTimeout(r, 2 ** (attempt + 1) * 1000)); continue; }
      return { facts: {}, model, error: `extraction failed: ${status || (e as Error).name}` };
    }
  }
  return { facts: {}, model, error: "extraction failed" };
}

async function gemini(user: string, schema: Record<string, unknown>): Promise<Extraction> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0, seed: 7 },
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (cand?.finishReason !== "STOP" || !text) return { facts: {}, model: GEMINI_MODEL, error: `extraction stopped: ${cand?.finishReason ?? "no candidate"}` } as Extraction;
  return parse(text, data.modelVersion || GEMINI_MODEL);
}

async function groq(user: string, schema: Record<string, unknown>): Promise<Extraction> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: "proposal_facts", schema, strict: true } },
      temperature: 0,
      seed: 7,
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason !== "stop" || !choice?.message?.content) return { facts: {}, model: GROQ_MODEL, error: `extraction stopped: ${choice?.finish_reason}` } as Extraction;
  return parse(choice.message.content, data.model || GROQ_MODEL);
}

function parse(text: string, model: string): Extraction {
  try {
    return { ...(JSON.parse(text) as Extraction), model };
  } catch {
    return { facts: {}, model, error: "extraction returned invalid JSON" } as Extraction;
  }
}
