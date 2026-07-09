/**
 * LLM provider — tiered per FINAL.md §4, cost-optimized:
 *   routine (narratives, triage, formatting) → Groq free tier (Llama), if a key exists
 *   judgment (theses, debates, Lab hypotheses) → Anthropic Claude
 * Each tier falls back to the other provider if its own key is missing, and
 * dry-runs cleanly if neither is configured.
 */

type Tier = "routine" | "judgment";

const has = (v?: string) => !!v && v !== "placeholder";

async function groq(model: string, system: string, user: string, maxTokens: number): Promise<string | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.4,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) { console.error(`groq failed: HTTP ${res.status} ${await res.text()}`); return null; }
  const json = (await res.json()) as any;
  return json?.choices?.[0]?.message?.content ?? null;
}

async function anthropic(model: string, system: string, user: string, maxTokens: number): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) { console.error(`anthropic failed: HTTP ${res.status} ${await res.text()}`); return null; }
  const json = (await res.json()) as any;
  return json?.content?.[0]?.text ?? null;
}

export async function complete(tier: Tier, system: string, user: string, maxTokens = 512): Promise<string | null> {
  const groqKey = has(process.env.GROQ_API_KEY);
  const anthKey = has(process.env.ANTHROPIC_API_KEY);

  if (tier === "routine") {
    if (groqKey) return groq(process.env.GROQ_ROUTINE_MODEL ?? "llama-3.3-70b-versatile", system, user, maxTokens);
    if (anthKey) return anthropic(process.env.LLM_ROUTINE_MODEL ?? "claude-haiku-4-5-20251001", system, user, maxTokens);
  } else {
    // judgment: prefer Claude; fall back to Groq's strongest open model if Claude absent
    if (anthKey) return anthropic(process.env.LLM_JUDGMENT_MODEL ?? "claude-sonnet-5", system, user, maxTokens);
    if (groqKey) return groq("openai/gpt-oss-120b", system, user, maxTokens);
  }

  console.log(`[llm dry-run ${tier}] ${system.slice(0, 60)}… | ${user.slice(0, 100)}…`);
  return null;
}
