/**
 * Nightly job (17:30 ET weekdays via GitHub Actions):
 * gather regime inputs → compute Radar (with hysteresis vs stored history) → persist
 * via Supabase REST → log the run. Dry-runs cleanly if the store isn't configured.
 */
import { fetchDailyBars } from "../providers/prices.js";
import { computeRadar, sma, applyHysteresis, bandRegime, type Regime } from "../lib/radar.js";
import { storeAvailable, upsertRegimeScore, getRecentRegimes, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";
import { runWatchtower } from "../lib/watchtower.js";
import { runScorer } from "../lib/scorer.js";

const SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC"];

async function main() {
  const started = Date.now();
  const persist = storeAvailable();

  if (persist && !(await routineEnabled("nightly"))) {
    console.log("nightly: routine disabled or engine paused — archiving only is a later concern; exiting.");
    return;
  }

  const [vix, vix3m, spy, hyg, lqd] = await Promise.all([
    fetchDailyBars("^VIX", "3y"),
    fetchDailyBars("^VIX3M", "3y"),
    fetchDailyBars("SPY", "3y"),
    fetchDailyBars("HYG", "3y"),
    fetchDailyBars("LQD", "3y"),
  ]);

  const sectors = await Promise.all(SECTOR_ETFS.map((s) => fetchDailyBars(s, "1y")));
  let above = 0;
  for (const bars of sectors) {
    const closes = bars.map((b) => b.close);
    const ma50 = sma(closes, 50);
    if (ma50 !== null && closes[closes.length - 1] > ma50) above++;
  }

  const radar = computeRadar({
    vixCloses: vix.map((b) => b.close),
    vix3mCloses: vix3m.map((b) => b.close),
    spyCloses: spy.map((b) => b.close),
    hygCloses: hyg.map((b) => b.close),
    lqdCloses: lqd.map((b) => b.close),
    sectorAbove50dma: above / SECTOR_ETFS.length,
  });

  const asOf = spy[spy.length - 1].date;

  // hysteresis: a regime flip needs 2 consecutive closes in the new band
  let effectiveRegime: Regime = radar.regime;
  let prevScore: number | null = null;
  if (persist) {
    const recent = (await getRecentRegimes(3)).filter((r) => r.date !== asOf);
    if (recent.length > 0) {
      prevScore = recent[0].score;
      const prevRegime = recent[0].regime as Regime;
      const rawYesterday = bandRegime(recent[0].score);
      effectiveRegime = applyHysteresis(prevRegime, radar.regime, rawYesterday);
    }
  }

  const out = {
    as_of: asOf,
    score: radar.score,
    regime_raw: radar.regime,
    regime: effectiveRegime,
    components: radar.components,
    breadth_detail: `${above}/${SECTOR_ETFS.length} sector ETFs above their 50DMA`,
    heat_ceiling: effectiveRegime === "risk_on" ? "20%" : effectiveRegime === "neutral" ? "12%" : "5%",
    ms: Date.now() - started,
  };

  if (!persist) {
    console.log("[dry-run — store not configured] Radar computed from live market data:\n");
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  await upsertRegimeScore({
    date: asOf,
    score: radar.score,
    regime: effectiveRegime,
    components: radar.components,
    prev_score: prevScore,
  });

  // Receipts scorer — fill entries at next-open, mark open signals, close finished ones
  const score = await runScorer();

  // Watchtower sweep — every book position checked against its plan
  const watch = await runWatchtower();

  await logJobRun("nightly", asOf, "ok", started, { ...out, scorer: score, watchtower: watch });
  await touchRoutine("nightly",
    `Radar ${radar.score} → ${effectiveRegime} · scorer +${score.entriesFilled}/mark ${score.marked}/close ${score.closed.length} · Watchtower ${watch.events.length} events`);
  console.log("Radar persisted:", JSON.stringify(out));
  console.log("Scorer:", JSON.stringify(score));
  console.log("Watchtower:", JSON.stringify(watch));
}

main().catch(async (err) => {
  console.error("nightly job failed:", err);
  try {
    if (storeAvailable()) {
      await logJobRun("nightly", new Date().toISOString().slice(0, 10), "error", Date.now(), { error: String(err) });
    }
  } catch {}
  process.exit(1);
});
