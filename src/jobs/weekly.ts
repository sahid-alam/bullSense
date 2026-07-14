/**
 * Weekly job (Sunday 12:00 ET) — self-health + data-quality report.
 * Confirms the engine is alive, the archives are growing, and no jobs are silently
 * failing. Sends a short digest to each distinct Telegram chat.
 */
import { storeAvailable, weeklyStats, getProfiles, latestFundMetrics, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";

async function main() {
  const started = Date.now();
  if (!storeAvailable()) {
    console.log("[dry-run] weekly needs the store.");
    return;
  }
  if (!(await routineEnabled("weekly"))) {
    console.log("weekly: disabled or paused — exiting.");
    return;
  }

  const s = await weeklyStats();
  const healthy = s.jobErrors7d === 0;
  const fm = await latestFundMetrics("engine");

  const fundLine = fm && fm.days >= 10
    ? `*Paper fund* (${fm.days}d): ${Number(fm.total_return_pct) >= 0 ? "+" : ""}${Number(fm.total_return_pct).toFixed(1)}% · Sharpe ${Number(fm.sharpe).toFixed(2)} · maxDD ${Number(fm.max_drawdown_pct).toFixed(1)}%` +
      (fm.spy_return_pct != null ? ` · vs SPY ${Number(fm.total_return_pct) - Number(fm.spy_return_pct) >= 0 ? "+" : ""}${(Number(fm.total_return_pct) - Number(fm.spy_return_pct)).toFixed(1)}%` : "")
    : `*Paper fund*: accruing — risk-adjusted stats appear once the equity curve has history.`;

  const lines = [
    `*BullSense — weekly health* 🐂`,
    ``,
    `${healthy ? "✅ All systems ran clean this week." : `⚠️ ${s.jobErrors7d} job failure(s) this week — check Actions.`}`,
    ``,
    `*Engine*`,
    `• Jobs run (7d): ${s.jobRuns7d}`,
    `• Sentiment archived (7d): ${s.sentimentRows} rows across ${s.hypeTickers} tickers`,
    `• Signals: ${s.openSignals} open · ${s.closedSignals} closed`,
    `• ${fundLine}`,
    ``,
    s.closedSignals < 30
      ? `_Trust clock: ${s.closedSignals}/30 closed signals. Live signals aren't trusted with real attention until a family clears 30 at PF ≥ 1.3._`
      : `_Trust clock: ${s.closedSignals} closed — the 30-signal bar is met. Time to read the receipts._`,
  ].join("\n");

  const seen = new Set<string>();
  let sent = 0;
  for (const p of await getProfiles()) {
    if (!p.telegram_chat_id || seen.has(p.telegram_chat_id)) continue;
    seen.add(p.telegram_chat_id);
    if (await sendTelegram(p.telegram_chat_id, lines)) sent++;
  }

  const asOf = new Date().toISOString().slice(0, 10);
  await logJobRun("weekly", asOf, "ok", started, { ...s, briefed: sent });
  await touchRoutine("weekly", `health: ${healthy ? "clean" : s.jobErrors7d + " errors"}, ${s.sentimentRows} sentiment rows, ${s.closedSignals} closed signals`);
  console.log("weekly:", JSON.stringify({ ...s, briefed: sent }));
}

import { failJob } from "../lib/alert.js";
main().catch((e) => failJob("weekly", e));
