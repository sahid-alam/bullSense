/**
 * Nightly job (17:30 ET weekdays via GitHub Actions):
 * gather regime inputs → compute Radar (with hysteresis vs stored history) → persist
 * via Supabase REST → log the run. Dry-runs cleanly if the store isn't configured.
 */
import { fetchDailyBars } from "../providers/prices.js";
import { pageOperators } from "../lib/alert.js";
import { markCards } from "../lib/advisor.js";
import { runPostmortems } from "../lib/postmortem.js";
import { computeRadar, sma, applyHysteresis, bandRegime, type Regime } from "../lib/radar.js";
import { storeAvailable, upsertRegimeScore, getRecentRegimes, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";
import { runWatchtower } from "../lib/watchtower.js";
import { runScorer } from "../lib/scorer.js";
import { complete } from "../providers/llm.js";
import { archiveShortInterest } from "./si-archive.js";
import { runSqueezeScout } from "../lib/squeeze.js";
import { runPaperFund, runPersonalFunds } from "../lib/paperfund.js";
import { perfMetrics } from "../lib/perf.js";
import { upsertBenchmark, getBenchmarkSeries, getEquitySeries, upsertFundMetrics, getProfilesWithPositions, recordBelief } from "../providers/store.js";

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

  // "What changed today" narrative — routine tier (Groq free). Generated once, then frozen.
  // Components are pre-interpreted into qualitative bands so the model can't misread
  // our 0-100 "calmness/health percentile" encoding as raw levels.
  let narrative: string | null = null;
  try {
    const band = (v: number, kind: "generic" | "vix") => {
      // higher score = calmer/healthier in every component
      if (kind === "vix") return v >= 66 ? "low/calm" : v >= 40 ? "moderately elevated" : "high/fearful";
      return v >= 66 ? "strong" : v >= 40 ? "middling" : "weak";
    };
    const c = radar.components;
    const deltaTxt = prevScore != null
      ? `Overall score ${radar.score} vs ${prevScore} yesterday (${radar.score >= prevScore ? "steady/up" : "down"}).`
      : "No prior day on record.";
    narrative = await complete(
      "routine",
      "You are a terse market-risk analyst. You are given today's regime read with each factor already interpreted qualitatively. Write exactly 2 plain sentences: the overall posture, and the single most notable tension or feature. No preamble, no bullet points, no numbers, no hedging.",
      `Regime: ${effectiveRegime.toUpperCase()}. ${deltaTxt} ` +
      `Index trend is ${band(c.trend, "generic")}. Credit conditions are ${band(c.credit, "generic")}. ` +
      `Market breadth is ${band(c.breadth, "generic")} (${above} of 11 sectors above their 50-day average). ` +
      `Volatility (VIX) is ${band(c.vix_level, "vix")}; the VIX term structure is ${band(c.vix_term, "vix")}.`,
      200,
    );
  } catch (e) { console.error("narrative generation failed (non-fatal):", e); }

  await upsertRegimeScore({
    date: asOf,
    score: radar.score,
    regime: effectiveRegime,
    components: radar.components,
    narrative,
    prev_score: prevScore,
  });

  // Short-interest archive (bi-monthly; cheap no-op when unchanged) → Squeeze scout
  const si = await archiveShortInterest();
  const squeeze = await runSqueezeScout();

  // Ledger of Beliefs — record the market-regime belief; supersession = a mind-change
  const regimeBelief = await recordBelief({ category: "market_regime", subject: "MARKET", stance: effectiveRegime, confidence: Math.round(radar.score), rationale: narrative ?? undefined });

  // Receipts scorer — fill entries at next-open, mark open signals, close finished ones
  const score = await runScorer();

  // Engine paper fund — take new signals, close finished ones, snapshot the equity curve
  const fund = await runPaperFund();
  // Personal funds — settle each human's own positions (opened via /took)
  const personal = await runPersonalFunds();

  // Benchmark + risk-adjusted fund metrics (engine + any profile with positions).
  // NIFTY is additive alongside SPY — real money is INR/NSE, so personal books read
  // against NIFTY too, without disturbing the existing SPY path (A2 India friction model).
  let niftyClose: number | null = null;
  try { const nifty = await fetchDailyBars("^NSEI", "1mo" as any); niftyClose = nifty[nifty.length - 1]?.close ?? null; } catch { /* best-effort */ }
  await upsertBenchmark(asOf, spy[spy.length - 1].close, niftyClose);
  const metricProfiles = ["engine", ...(await getProfilesWithPositions())].filter((v, i, a) => a.indexOf(v) === i);
  for (const pid of metricProfiles) {
    const series = await getEquitySeries(pid);
    if (series.length < 3) continue;
    const m = perfMetrics(series.map((r) => r.equity));
    // SPY / NIFTY total return over the same window (buy-hold benchmarks)
    const bench = await getBenchmarkSeries(series[0].date);
    const spyRet = bench.length >= 2 ? (bench[bench.length - 1].spy_close / bench[0].spy_close - 1) * 100 : null;
    const niftyBench = bench.filter((b) => b.nifty_close != null);
    const niftyRet = niftyBench.length >= 2 ? (niftyBench[niftyBench.length - 1].nifty_close! / niftyBench[0].nifty_close! - 1) * 100 : null;
    await upsertFundMetrics({
      profile_id: pid, date: asOf, days: m.days, total_return_pct: m.totalReturnPct, cagr_pct: m.cagrPct,
      vol_pct: m.volPct, sharpe: m.sharpe, sortino: m.sortino, max_drawdown_pct: m.maxDrawdownPct, spy_return_pct: spyRet, nifty_return_pct: niftyRet,
    });
  }

  // Watchtower sweep — every book position checked against its plan
  const watch = await runWatchtower();

  // Score matured advisor cards — calibration for the A1 heuristic verdict
  const cards = await markCards();

  // Post-mortems — every newly-closed position auto-examined (A2)
  const postmortems = await runPostmortems();

  await logJobRun("nightly", asOf, "ok", started, { ...out, si, squeeze, scorer: score, paperfund: fund, personal, watchtower: watch, postmortems });
  await touchRoutine("nightly",
    `Radar ${radar.score} → ${effectiveRegime} · SI ${si.fresh ? `+${si.archived}` : "cached"} · Squeeze ${squeeze.fired} fired · fund ₹${fund.equity} (dd ${fund.drawdownPct}%, ${fund.openPositions} open) · Watch ${watch.events.length}`);
  console.log("Radar persisted:", JSON.stringify(out));
  console.log("SI archive:", JSON.stringify(si));
  console.log("Squeeze:", JSON.stringify(squeeze));
  console.log("Scorer:", JSON.stringify(score));
  console.log("Paper fund:", JSON.stringify(fund));
  console.log("Watchtower:", JSON.stringify(watch));
}

main().catch(async (err) => {
  console.error("nightly job failed:", err);
  try {
    if (storeAvailable()) {
      await logJobRun("nightly", new Date().toISOString().slice(0, 10), "error", Date.now(), { error: String(err) });
    }
  } catch {}
  await pageOperators(`🚨 *nightly* failed: ${String(err).slice(0, 180)}`);
  process.exit(1);
});
