/**
 * The India Radar (A2) — daily regime score for the INR book, mirroring the US Radar's
 * discipline (SCOPE.md §3.4) but built on India's own instruments and the archive:
 *   VIX level 20% · NIFTY trend 25% · breadth 20% · FII/DII flow 15% · INR/USD stress 10% · Brent stress 10%
 * Regime: >=65 RISK_ON · 40–64 NEUTRAL · <40 RISK_OFF (hysteresis applied by the job, over stored history).
 * Reuses sma/percentileRank/bandRegime/applyHysteresis from radar.ts — no reimplementation.
 *
 * FII/DII flow capture started 2026-07-13 (forward-only; NSE's API is latest-day-only).
 * Until 5 days have accreted, that component reports neutral (50) rather than a false read —
 * same honesty discipline as the Advisor Card's interim-heuristic labeling.
 */
import { sma, percentileRank, bandRegime, type Regime } from "./radar.js";

export interface IndiaRadarComponents {
  vix_level: number;
  trend: number;
  breadth: number;
  fii_dii: number;
  inr_usd: number;
  brent: number;
}

export interface IndiaRadarResult {
  score: number;
  regime: Regime;
  components: IndiaRadarComponents;
  fiiDiiThin: boolean; // true when the flow component is a neutral placeholder, not a real read
}

const WEIGHTS: Record<keyof IndiaRadarComponents, number> = {
  vix_level: 0.20,
  trend: 0.25,
  breadth: 0.20,
  fii_dii: 0.15,
  inr_usd: 0.10,
  brent: 0.10,
};

export function computeIndiaRadar(inp: {
  vixCloses: number[];     // ~1y of ^INDIAVIX closes, oldest→newest
  niftyCloses: number[];   // ~1y of ^NSEI closes
  breadthPct: number;      // 0–100, from india_breadth() RPC
  fiiDiiNet5d: number | null; // sum of last-5-days net FII+DII flow (INR cr); null if thin
  fiiDiiHistory: number[]; // trailing daily net-flow history for percentile context (may be short)
  inrUsdCloses: number[];  // ~1y of INR=X closes (USD/INR — rising = rupee weakening)
  brentCloses: number[];   // ~1y of BZ=F closes (Brent crude)
}): IndiaRadarResult {
  const { vixCloses, niftyCloses, inrUsdCloses, brentCloses } = inp;

  // 1. India VIX level — high VIX percentile = fear = LOW score (inverted)
  const vixNow = vixCloses[vixCloses.length - 1];
  const vix_level = 100 - percentileRank(vixCloses, vixNow);

  // 2. NIFTY trend — vs 50/200 DMA + 20d slope, blended (mirrors US SPY trend calc)
  const niftyNow = niftyCloses[niftyCloses.length - 1];
  const ma50 = sma(niftyCloses, 50);
  const ma200 = sma(niftyCloses, 200);
  const nifty20ago = niftyCloses[niftyCloses.length - 21] ?? niftyNow;
  const slope20 = (niftyNow / nifty20ago - 1) * 100;
  let trend = 50;
  if (ma50 !== null && ma200 !== null) {
    const above50 = niftyNow > ma50 ? 30 : 0;
    const above200 = niftyNow > ma200 ? 40 : 0;
    const slopePts = Math.max(-15, Math.min(15, slope20 * 3)) + 15;
    trend = above50 + above200 + slopePts;
  } else if (ma50 !== null) {
    trend = niftyNow > ma50 ? 65 : 35;
  }

  // 3. Breadth — % of archived liquid NSE EQ symbols above their own N-day MA, direct 0–100
  const breadth = inp.breadthPct;

  // 4. FII/DII 5-day net flow — percentile vs its own (short) history; neutral if thin
  let fii_dii = 50;
  const fiiDiiThin = inp.fiiDiiNet5d === null || inp.fiiDiiHistory.length < 5;
  if (!fiiDiiThin && inp.fiiDiiNet5d !== null) {
    fii_dii = percentileRank(inp.fiiDiiHistory, inp.fiiDiiNet5d);
  }

  // 5. INR/USD stress — rupee weakening (rising INR=X) = stress = LOW score (inverted percentile
  //    on level) blended with a 20d trend penalty
  const inrNow = inrUsdCloses[inrUsdCloses.length - 1];
  const inrPct = 100 - percentileRank(inrUsdCloses, inrNow);
  const inr20ago = inrUsdCloses[inrUsdCloses.length - 21] ?? inrNow;
  const inrTrendPts = inrNow <= inr20ago ? 100 : 0; // flat/strengthening rupee = healthy
  const inr_usd = inrPct * 0.6 + inrTrendPts * 0.4;

  // 6. Brent stress — high oil percentile = import-cost stress for India = LOW score (inverted)
  const brentNow = brentCloses[brentCloses.length - 1];
  const brent = 100 - percentileRank(brentCloses, brentNow);

  const components: IndiaRadarComponents = {
    vix_level: round1(vix_level),
    trend: round1(trend),
    breadth: round1(breadth),
    fii_dii: round1(fii_dii),
    inr_usd: round1(inr_usd),
    brent: round1(brent),
  };

  const score = round1(
    (Object.keys(WEIGHTS) as (keyof IndiaRadarComponents)[]).reduce(
      (acc, k) => acc + components[k] * WEIGHTS[k], 0),
  );

  return { score, regime: bandRegime(score), components, fiiDiiThin };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
