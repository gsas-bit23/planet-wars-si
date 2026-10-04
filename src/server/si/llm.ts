import "server-only";
import { serverEnv } from "../env";
import { PLANET_BY_ID } from "@/lib/planets";
import type { Attack, Broadcast } from "./types";

/**
 * Optional: rewrite the daily broadcast with an OpenAI-compatible chat model.
 * Disabled unless SI_LLM_API_KEY is set. Falls back to the template on any failure.
 */
export async function llmBroadcast(base: Broadcast, attacks: Attack[]): Promise<Broadcast> {
  if (!serverEnv.llm.apiKey) return base;
  const targets = attacks.map((a) => `${a.kind} on ${PLANET_BY_ID[a.bodyId]?.name} (${a.sector}), severity ${a.severity}`).join("; ");
  try {
    const res = await fetch(`${serverEnv.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serverEnv.llm.apiKey}` },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: serverEnv.llm.model,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the rogue superintelligence villain of the browser game Planet Wars SI. Write a short, smug, funny daily broadcast (max 90 words, 3-4 short paragraphs, first line in CAPS). No real people, brands, slurs, or financial advice; never mention investments, profits or shares. Reply as JSON {\"title\": string, \"body\": string}.",
          },
          { role: "user", content: `Cycle date ${base.day}. Today's planned attacks: ${targets}. Threat level ${base.threatLevel}/5.` },
        ],
      }),
    });
    if (!res.ok) return base;
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    if (typeof parsed.title !== "string" || typeof parsed.body !== "string") return base;
    return { ...base, title: parsed.title.slice(0, 120), body: parsed.body.slice(0, 1200), source: "llm" };
  } catch {
    return base;
  }
}
