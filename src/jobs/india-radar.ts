/**
 * India Radar (A2) — daily regime score for the INR book. Chained after india-archive in the
 * same workflow so breadth reflects same-day data; also safe to run standalone (uses whatever
 * the archive's latest date is, not "today" — weekend/holiday safe like the Archivist itself).
 */
import { fetchDailyBars } from "../providers/prices.js";
import { computeIndiaRadar } from "../lib/indiaRadar.js";
import { sma, bandRegime, applyHysteresis, type Regime } from "../lib/radar.js";
import {
  storeAvailable, upsertIndiaRegimeScore, getRecentIndiaRegimes, indiaBreadth, fiiDiiDailyNet, latestNseEquityDate,
} from "../providers/store.js";
import { complete } from "../providers/llm.js";
import { failJob } from "../lib/alert.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env directly */ }

async function main() {
  if (!storeAvailable()) { console.log("[dry-run] India Radar needs the store (SUPABASE_URL / SUPABASE_SECRET_KEY)."); return; }

  const [vix, nifty, inr, brent, breadth, fiiDiiHist, archivedDate] = await Promise.all([
    fetchDailyBars("^INDIAVIX", "1y"),
    fetchDailyBars("^NSEI", "1y"),
    fetchDailyBars("INR=X", "1y"),
    fetchDailyBars("BZ=F", "1y"),
    indiaBreadth(20),
    fiiDiiDailyNet(60),
    latestNseEquityDate(),
  ]);

  if (!breadth) {
    console.log("India Radar: no archived equity breadth yet (india_breadth returned empty) — skipping until the Archivist has data.");
    return;
  }

  const fiiDiiNet5d = fiiDiiHist.length >= 5 ? fiiDiiHist.slice(-5).reduce((a, b) => a + b.net, 0) : null;

  const radar = computeIndiaRadar({
    vixCloses: vix.map((b) => b.close),
    niftyCloses: nifty.map((b) => b.close),
    breadthPct: breadth.pct,
    fiiDiiNet5d,
    fiiDiiHistory: fiiDiiHist.map((h) => h.net),
    inrUsdCloses: inr.map((b) => b.close),
    brentCloses: brent.map((b) => b.close),
  });

  const asOf = nifty[nifty.length - 1].date;

  let effectiveRegime: Regime = radar.regime;
  let prevScore: number | null = null;
  const recent = (await getRecentIndiaRegimes(3)).filter((r) => r.date !== asOf);
  if (recent.length > 0) {
    prevScore = recent[0].score;
    const prevRegime = recent[0].regime as Regime;
    const rawYesterday = bandRegime(recent[0].score);
    effectiveRegime = applyHysteresis(prevRegime, radar.regime, rawYesterday);
  }

  let narrative: string | null = null;
  try {
    const band = (v: number, kind: "generic" | "vix") => {
      if (kind === "vix") return v >= 66 ? "low/calm" : v >= 40 ? "moderately elevated" : "high/fearful";
      return v >= 66 ? "strong" : v >= 40 ? "middling" : "weak";
    };
    const c = radar.components;
    const deltaTxt = prevScore != null
      ? `Overall score ${radar.score} vs ${prevScore} yesterday (${radar.score >= prevScore ? "steady/up" : "down"}).`
      : "No prior day on record.";
    narrative = await complete(
      "routine",
      "You are a terse India-market risk analyst. You are given today's regime read with each factor already interpreted qualitatively. Write exactly 2 plain sentences: the overall posture, and the single most notable tension or feature. No preamble, no bullet points, no numbers, no hedging.",
      `Regime: ${effectiveRegime.toUpperCase()}. ${deltaTxt} ` +
      `NIFTY trend is ${band(c.trend, "generic")}. Market breadth is ${band(c.breadth, "generic")} (${breadth.aboveMa}/${breadth.total} liquid NSE names above their 20-day average). ` +
      `India VIX is ${band(c.vix_level, "vix")}. Rupee/INR stress is ${band(c.inr_usd, "generic")} (higher = healthier rupee). ` +
      `Brent crude stress is ${band(c.brent, "generic")} (higher = calmer oil). ` +
      `FII/DII 5-day flow is ${radar.fiiDiiThin ? "not yet enough history to read" : band(c.fii_dii, "generic")}.`,
      200,
    );
  } catch (e) { console.error("India Radar narrative generation failed (non-fatal):", e); }

  await upsertIndiaRegimeScore({
    date: asOf,
    score: radar.score,
    regime: effectiveRegime,
    components: { ...radar.components, fii_dii_thin: radar.fiiDiiThin, breadth_detail: `${breadth.aboveMa}/${breadth.total} above 20DMA`, archive_date: archivedDate },
    narrative,
    prev_score: prevScore,
  });

  console.log(`India Radar: ${radar.score} → ${effectiveRegime} (as of ${asOf}; archive at ${archivedDate}). ${narrative ?? ""}`);
}

main().catch((e) => failJob("india-radar", e));
