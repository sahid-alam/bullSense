/**
 * Advisor Card queue (A1) — processes Telegram /card requests using the SAME buildAdvisorCard
 * engine as the CLI and dashboard (no Deno reimplementation, no drift). Freezes each verdict
 * and delivers the rendered card. Runs on a frequent cron, like the dossier queue.
 */
import { buildAdvisorCard, type AdvisorCard } from "../lib/advisor.js";
import { storeAvailable, queuedCardRequests, completeCardRequest, insertAdvisorCard } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";
import { failJob } from "../lib/alert.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env */ }

const cur = (m: string) => (m === "NSE" ? "₹" : "$");
const V = { enter: "🟢 *ENTER*", watch: "🟡 *WATCH*", avoid: "🔴 *AVOID*" };

function render(c: AdvisorCard): string {
  if (!c.ok) return `📋 *${c.symbol}* — couldn't build a card: ${c.error}`;
  const L: string[] = [
    `📋 *Advisor Card — ${c.symbol}*  (${c.market} · ${c.horizon})`,
    ``,
    `*Market:* ${c.marketRead.label}`,
    `*Potential:* ${c.potential}/100  →  ${V[c.verdict]}`,
    c.factors.map((f) => `  · ${f.name} ${f.score} — ${f.note}`).join("\n"),
    ``,
    `*Lot:* ${c.suggestedQty} sh (${(c.riskPct * 100).toFixed(1)}% risk) · *Entry* ~${cur(c.market)}${c.entry.toFixed(2)}`,
    `*Stop* ${cur(c.market)}${c.stop.toFixed(2)} · *Target* ${cur(c.market)}${c.target.toFixed(2)} (${c.riskReward}R)`,
  ];
  if (c.rationale) L.push(``, `_${c.rationale}_`);
  L.push(``, `⚠️ _Interim heuristic — frozen & scored vs ${c.benchmarkName}, not validated advice._`);
  return L.join("\n");
}

async function main() {
  if (!storeAvailable()) { console.log("[dry-run] card-queue needs the store."); return; }
  const reqs = await queuedCardRequests();
  if (reqs.length === 0) { console.log("card-queue: empty."); return; }

  let built = 0;
  for (const req of reqs) {
    try {
      const c = await buildAdvisorCard(req.symbol);
      if (c.ok) {
        await insertAdvisorCard({
          symbol: c.symbol, market: c.market, horizon: c.horizon, as_of: c.asOf,
          potential: c.potential, verdict: c.verdict, entry: c.entry, stop: c.stop, target: c.target,
          risk_reward: c.riskReward, suggested_qty: c.suggestedQty, risk_pct: c.riskPct,
          regime: c.marketRead.label, factors: c.factors, rationale: c.rationale, benchmark_at_creation: c.benchmarkClose,
        });
        built++;
      }
      if (req.chat_id) await sendTelegram(req.chat_id, render(c));
      await completeCardRequest(req.id, c.ok ? "done" : "failed");
    } catch (e) {
      console.error("card-queue error", req.symbol, e);
      await completeCardRequest(req.id, "failed");
      if (req.chat_id) await sendTelegram(req.chat_id, `⚠️ Card for *${req.symbol}* failed. Try again shortly.`);
    }
  }
  console.log(`card-queue: processed ${reqs.length}, built ${built}`);
}

main().catch((e) => failJob("card-queue", e));
