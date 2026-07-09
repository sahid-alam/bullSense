/**
 * Daily briefing (18:15 ET weekdays) — the Decision Queue's voice.
 * Per profile with a Telegram chat: Radar read, book status vs plans, engine health.
 */
import { latestClose } from "../providers/prices.js";
import {
  storeAvailable, getLatestRegime, getProfiles, getBook, getJobHealth,
  logJobRun, routineEnabled, touchRoutine,
} from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";

function regimeLabel(regime: string): string {
  return regime === "risk_on" ? "🟢 RISK-ON" : regime === "neutral" ? "🟡 NEUTRAL" : "🔴 RISK-OFF";
}

async function main() {
  const started = Date.now();
  if (!storeAvailable()) {
    console.log("[dry-run] briefing needs the store; configure SUPABASE_URL/SUPABASE_SECRET_KEY.");
    return;
  }
  if (!(await routineEnabled("briefing"))) {
    console.log("briefing: disabled or paused — exiting.");
    return;
  }

  const regime = await getLatestRegime();
  const profiles = (await getProfiles()).filter((p) => p.telegram_chat_id);
  const health = await getJobHealth(1);
  const failures = health.filter((h) => h.status === "error").length;

  let sent = 0;
  for (const profile of profiles) {
    const lines: string[] = [];
    lines.push(`*BullSense daily briefing* 🐂`);
    lines.push("");

    if (regime) {
      const c = regime.components ?? {};
      lines.push(`*Market Radar* (${regime.date})`);
      lines.push(`Score *${regime.score}/100* → ${regimeLabel(regime.regime)}`);
      lines.push(`Trend ${c.trend} · Credit ${c.credit} · Breadth ${c.breadth} · VIX ${c.vix_level}`);
      lines.push(`Heat ceiling: *${regime.regime === "risk_on" ? "20%" : regime.regime === "neutral" ? "12%" : "5%"}*`);
      lines.push("");
    }

    const holdings = (await getBook(profile.id)).filter((b) => b.kind === "holding" && b.qty > 0);
    if (holdings.length > 0) {
      lines.push(`*Your Book* (${profile.id})`);
      for (const pos of holdings) {
        try {
          const { close } = await latestClose(pos.symbol);
          const pnlPct = (close / pos.cost_basis - 1) * 100;
          const pnlAbs = (close - pos.cost_basis) * pos.qty;
          const guard = pos.invalidation_price
            ? `stop ${pos.invalidation_price} (${(((close - pos.invalidation_price) / close) * 100).toFixed(1)}% away)`
            : "⚠️ *no stop set*";
          lines.push(`${pos.symbol} — ${pos.qty} @ ${pos.cost_basis} → ${close.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%, ${pnlAbs >= 0 ? "+" : ""}${pnlAbs.toFixed(0)}) · ${guard}`);
        } catch {
          lines.push(`${pos.symbol} — price unavailable today`);
        }
      }
      lines.push("");
    }

    lines.push(failures === 0 ? `_Engine: all systems ran clean today._` : `_Engine: ${failures} job failure(s) in the last 24h — check Actions._`);

    if (await sendTelegram(profile.telegram_chat_id!, lines.join("\n"))) sent++;
  }

  const asOf = new Date().toISOString().slice(0, 10);
  await logJobRun("briefing", asOf, "ok", started, { profiles_briefed: sent });
  await touchRoutine("briefing", `briefed ${sent} profile(s)`);
  console.log(`briefing: sent to ${sent} profile(s)`);
}

main().catch((err) => {
  console.error("briefing failed:", err);
  process.exit(1);
});
