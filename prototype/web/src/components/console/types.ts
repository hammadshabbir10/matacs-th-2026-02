import type { Extraction, Override, Verified } from "@/lib/engine";

export type Mode = "saved" | "live";
export type Actor = "system" | "AI" | "admin" | "reviewer";

export interface AuditEvent { at: string; actor: Actor; message: string }

export interface LiveDoc { id: string; name: string; text: string }

export interface LiveResult {
  extraction: Extraction & { attempts?: { provider: string; model: string; error: string | null }[]; fallback_used?: boolean };
  verified: Verified;
}

export interface ReviewState {
  overrides: Override[];
  cleared: Record<string, string>; // proposal -> reason the reviewer gave for clearing its flag
  decision: { proposal: string; note: string; at: string } | null;
}

export const CRITERION_COLOURS: Record<string, string> = {
  experience: "#115E59",
  price: "#14B8A6",
  timeline: "#0EA5E9",
  warranty: "#8B5CF6",
  team: "#F59E0B",
};

export const now = () => new Date().toISOString();
