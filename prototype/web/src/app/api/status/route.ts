import { NextResponse } from "next/server";
import { availableProviders, GEMINI_MODEL, GROQ_MODEL } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Which AI providers are configured on the server. Says nothing about the keys themselves. */
export function GET() {
  const providers = availableProviders();
  return NextResponse.json({
    live: providers.length > 0,
    providers: providers.map((p) => ({ provider: p, model: p === "gemini" ? GEMINI_MODEL : GROQ_MODEL })),
  });
}
