import type { Metadata } from "next";
import { Console } from "@/components/console/Console";

export const metadata: Metadata = {
  title: "Triage console · Proposal Triage",
  description: "Rank contractor proposals: AI extraction with quotes, rule-based scoring, reviewer overrides and an audit log.",
};

export default function ConsolePage() {
  return <Console />;
}
