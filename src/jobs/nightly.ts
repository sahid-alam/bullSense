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
import { complete } from "../providers/llm.js";
import { archiveShortInterest } from "./si-archive.js";
import { runSqueezeScout } from "../lib/squeeze.js";
import { runPaperFund, runPersonalFunds } from "../lib/paperfund.js";

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

  // Receipts scorer — fill entries at next-open, mark open signals, close finished ones
  const score = await runScorer();

  // Engine paper fund — take new signals, close finished ones, snapshot the equity curve
  const fund = await runPaperFund();
  // Personal funds — settle each human's own positions (opened via /took)
  const personal = await runPersonalFunds();

  // Watchtower sweep — every book position checked against its plan
  const watch = await runWatchtower();

  await logJobRun("nightly", asOf, "ok", started, { ...out, si, squeeze, scorer: score, paperfund: fund, personal, watchtower: watch });
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
  process.exit(1);
});
