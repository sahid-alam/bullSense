/**
 * LLM provider — tiered per FINAL.md §4: routine calls (narratives, triage) on Haiku,
 * judgment calls (theses, debates, Lab hypotheses) on Sonnet. Dry-runs without a key.
 */

type Tier = "routine" | "judgment";

export async function complete(tier: Tier, system: string, user: string, maxTokens = 1024): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "placeholder") {
    console.log(`[llm dry-run ${tier}] system: ${system.slice(0, 80)}… user: ${user.slice(0, 120)}…`);
    return null;
  }
  const model = tier === "routine"
    ? process.env.LLM_ROUTINE_MODEL ?? "claude-haiku-4-5-20251001"
    : process.env.LLM_JUDGMENT_MODEL ?? "claude-sonnet-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) {
    console.error(`llm ${tier} failed: HTTP ${res.status} ${await res.text()}`);
    return null;
  }
  const json = (await res.json()) as any;
  return json?.content?.[0]?.text ?? null;
}
