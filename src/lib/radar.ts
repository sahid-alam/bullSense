/**
 * The Radar — daily market risk regime (SCOPE.md §3.4).
 * Five components, each normalized 0–100 against its own trailing history, weighted:
 *   VIX level 20% · VIX term structure 15% · breadth 25% · index trend 25% · credit stress 15%
 * Regime: >=65 RISK_ON · 40–64 NEUTRAL · <40 RISK_OFF (hysteresis applied by the job, over stored history).
 *
 * P0 note: breadth uses the 11 S&P sector ETFs vs their 50DMA as a free proxy;
 * FMP full-universe breadth (% of S&P 500 above 50DMA) replaces it in week 2.
 */

export type Regime = "risk_on" | "neutral" | "risk_off";

export interface RadarComponents {
  vix_level: number;
  vix_term: number;
  breadth: number;
  trend: number;
  credit: number;
}

export interface RadarResult {
  score: number;
  regime: Regime; // raw band; hysteresis applied by the caller against prior days
  components: RadarComponents;
}

const WEIGHTS: Record<keyof RadarComponents, number> = {
  vix_level: 0.20,
  vix_term: 0.15,
  breadth: 0.25,
  trend: 0.25,
  credit: 0.15,
};

export function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

/** Percent of trailing history strictly below `value` → 0–100. */
export function percentileRank(history: number[], value: number): number {
  if (history.length === 0) return 50;
  const below = history.filter((v) => v < value).length;
  return (below / history.length) * 100;
}

export function bandRegime(score: number): Regime {
  if (score >= 65) return "risk_on";
  if (score >= 40) return "neutral";
  return "risk_off";
}

/** Hysteresis: a flip requires 2 consecutive closes in the new band (SCOPE.md). */
export function applyHysteresis(prevRegime: Regime | null, rawToday: Regime, rawYesterday: Regime | null): Regime {
  if (!prevRegime) return rawToday;
  if (rawToday === prevRegime) return prevRegime;
  return rawYesterday === rawToday ? rawToday : prevRegime;
}

export function computeRadar(inp: {
  vixCloses: number[];        // ~3y of ^VIX closes, oldest→newest
  vix3mCloses: number[];      // ~3y of ^VIX3M closes
  spyCloses: number[];        // ~3y of SPY closes
  hygCloses: number[];        // ~3y of HYG closes
  lqdCloses: number[];        // ~3y of LQD closes
  sectorAbove50dma: number;   // 0..1 fraction of the 11 sector ETFs above their 50DMA
}): RadarResult {
  const { vixCloses, vix3mCloses, spyCloses, hygCloses, lqdCloses } = inp;

  // 1. VIX level — high VIX percentile = fear = LOW score (inverted)
  const vixNow = vixCloses[vixCloses.length - 1];
  const vix_level = 100 - percentileRank(vixCloses, vixNow);

  // 2. VIX term structure — VIX/VIX3M ratio; backwardation (>1) = acute fear (inverted percentile)
  const n = Math.min(vixCloses.length, vix3mCloses.length);
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = vixCloses[vixCloses.length - n + i];
    const v3 = vix3mCloses[vix3mCloses.length - n + i];
    if (v3 > 0) ratios.push(v / v3);
  }
  const vix_term = 100 - percentileRank(ratios, ratios[ratios.length - 1]);

  // 3. Breadth — sector-ETF proxy, direct 0–100
  const breadth = inp.sectorAbove50dma * 100;

  // 4. Index trend — SPY vs 50/200 DMA + 20d slope, blended
  const spyNow = spyCloses[spyCloses.length - 1];
  const ma50 = sma(spyCloses, 50);
  const ma200 = sma(spyCloses, 200);
  const spy20ago = spyCloses[spyCloses.length - 21] ?? spyNow;
  const slope20 = (spyNow / spy20ago - 1) * 100; // % over ~a month
  let trend = 50;
  if (ma50 !== null && ma200 !== null) {
    const above50 = spyNow > ma50 ? 30 : 0;
    const above200 = spyNow > ma200 ? 40 : 0;
    const slopePts = Math.max(-15, Math.min(15, slope20 * 3)) + 15; // -5%..+5% month → 0..30
    trend = above50 + above200 + slopePts;
  }

  // 5. Credit stress — HYG/LQD ratio: 1y percentile (60%) + 20d trend (40%)
  const m = Math.min(hygCloses.length, lqdCloses.length);
  const hl: number[] = [];
  for (let i = 0; i < m; i++) {
    const h = hygCloses[hygCloses.length - m + i];
    const l = lqdCloses[lqdCloses.length - m + i];
    if (l > 0) hl.push(h / l);
  }
  const hlNow = hl[hl.length - 1];
  const hlYear = hl.slice(-252);
  const hlPct = percentileRank(hlYear, hlNow);
  const hl20ago = hl[hl.length - 21] ?? hlNow;
  const hlTrendPts = hlNow >= hl20ago ? 100 : 0;
  const credit = hlPct * 0.6 + hlTrendPts * 0.4;

  const components: RadarComponents = {
    vix_level: round1(vix_level),
    vix_term: round1(vix_term),
    breadth: round1(breadth),
    trend: round1(trend),
    credit: round1(credit),
  };

  const score = round1(
    (Object.keys(WEIGHTS) as (keyof RadarComponents)[]).reduce(
      (acc, k) => acc + components[k] * WEIGHTS[k], 0),
  );

  return { score, regime: bandRegime(score), components };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
