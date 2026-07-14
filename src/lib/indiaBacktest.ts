/**
 * India-native signal-family backtest machinery (A2). Mirrors backtest.ts's discipline
 * (entry at next-session open, real stop/time-stop, chronological drawdown) but reads the
 * India Archivist's own data and applies REAL India friction (STT/exchange/SEBI/stamp/DP/GST
 * + STCG/LTCG via indiaFriction.ts) instead of a flat round-trip bps assumption, benchmarked
 * to NIFTY instead of SPY.
 *
 * HONESTY (non-negotiable — same discipline as advisor.ts and the US Lab gauntlet): this is
 * machinery for TESTING candidate families, not a validated edge. The archive is currently
 * ~121 trading days deep — nowhere near the ~100-trades-per-walk-forward-window the US Lab
 * gauntlet requires for a promotion to mean anything. Running this today and calling a result
 * "promoted" would be exactly the curve-fit false positive the gauntlet exists to prevent (see
 * the momentum sniff-test finding: bottom decile beat top decile on this same archive). So this
 * module reports honest PF/trade-count and lets the CALLER decide — it never gates promotion
 * itself, and no genome produced here is marked "live" until the same out-of-sample bar the US
 * families clear is met.
 *
 * Only two of the four roadmap-named families are implemented here — the other two
 * (OI-buildup, FII-flow-tailwind) need archive depth this desk doesn't have yet:
 *   OI-buildup        needs nse_fno_oi history; NSE only serves ~1mo of UDiFF F&O bhavcopy,
 *                      so the archive has ~19 days as of A2 — not enough for a real backtest.
 *   FII-flow-tailwind  needs fii_dii_flows history; capture is forward-only from 2026-07-13,
 *                      so the archive has ~1-2 days as of A2 — nowhere close.
 * Building backtest logic for either now would be encoding noise, not machinery — deferred
 * honestly until the archive matures, exactly like India Radar's FII/DII component defers to
 * neutral until it has enough rolling windows.
 */
import { indiaFriction } from "./indiaFriction.js";

// Matches the Treasury's ~₹100k fractional position sizing (paperfund.ts ENGINE_START). At
// qty:1 the DP charge's flat ₹15+GST fee reads as a ~1-2% per-trade cost artifact instead of
// the near-nothing it is against a real position — that would overstate friction drag and could
// falsely graveyard a genuinely-good family once the archive matures.
const BACKTEST_NOTIONAL = 100_000;

export interface NseBar { date: string; open: number; high: number; low: number; close: number; volume: number; deliveryPct: number | null }

export interface IndiaGenomeParams {
  invalidationPct: number;   // stop at -this from entry, or 20-day low (whichever tighter)
  timeStopDays: number;
  minRelVolume: number;
}

export interface DeliverySurgeParams extends IndiaGenomeParams {
  minSurgeRatio: number;     // recent-5d avg delivery% >= this x prior-20d baseline
}

export interface MomentumBreakoutParams extends IndiaGenomeParams {
  minMomentum20: number;     // 20-day momentum % required at breakout
}

export interface IndiaBacktestResult {
  trades: number;
  winRate: number;
  profitFactor: number;      // net of REAL India friction (STT/exchange/SEBI/stamp/DP/GST/tax)
  avgNetReturnPct: number;
  avgNiftyReturnPct: number;
  excessVsNifty: number;
  maxDrawdownPct: number;
}

const HORIZON_CAP = 60;
const EMPTY: IndiaBacktestResult = { trades: 0, winRate: 0, profitFactor: 0, avgNetReturnPct: 0, avgNiftyReturnPct: 0, excessVsNifty: 0, maxDrawdownPct: 0 };

/** Delivery-surge: recent accumulation (5d avg delivery% well above its own 20d baseline)
 *  confirmed by a price cross above the 20-day MA — the archive's deepest, most reliable
 *  signal (121 days of real delivery% history, vs ~19 for F&O OI and ~1-2 for FII/DII). */
export function backtestDeliverySurge(params: DeliverySurgeParams, universe: Map<string, NseBar[]>, nifty: NseBar[]): IndiaBacktestResult {
  return runIndiaBacktest(universe, nifty, params, (bars, i, p) => {
    if (i < 25) return false;
    const recentDeliv = avgDeliv(bars, i, 5);
    const baseDeliv = avgDeliv(bars, i - 5, 20);
    if (recentDeliv === null || baseDeliv === null || baseDeliv <= 0) return false;
    const ma20 = avgClose(bars, i, 20), prevMa20 = avgClose(bars, i - 1, 20);
    const crossed = bars[i].close > ma20 && bars[i - 1].close <= prevMa20;
    const vol20 = avgVol(bars, i - 1, 20);
    const relVol = vol20 > 0 ? bars[i].volume / vol20 : 0;
    return crossed && relVol >= p.minRelVolume && recentDeliv / baseDeliv >= (params as DeliverySurgeParams).minSurgeRatio;
  });
}

/** Momentum-breakout: a proper stop/time-stop/friction-aware genome test of the same
 *  momentum signal the A1 sniff-test checked cross-sectionally (bottom decile beat top
 *  decile there) — testing it as an actual tradeable genome, not just a return-decile split. */
export function backtestMomentumBreakout(params: MomentumBreakoutParams, universe: Map<string, NseBar[]>, nifty: NseBar[]): IndiaBacktestResult {
  return runIndiaBacktest(universe, nifty, params, (bars, i, p) => {
    if (i < 21) return false;
    const mom20 = (bars[i].close / bars[i - 20].close - 1) * 100;
    const vol20 = avgVol(bars, i - 1, 20);
    const relVol = vol20 > 0 ? bars[i].volume / vol20 : 0;
    return mom20 >= (params as MomentumBreakoutParams).minMomentum20 && relVol >= p.minRelVolume;
  });
}

function runIndiaBacktest(
  universe: Map<string, NseBar[]>, nifty: NseBar[], params: IndiaGenomeParams,
  triggers: (bars: NseBar[], i: number, p: IndiaGenomeParams) => boolean,
): IndiaBacktestResult {
  const niftyClose = (d: string) => nifty.find((b) => b.date >= d)?.close ?? null;
  const netRets: number[] = [];
  const entryDates: string[] = [];
  const niftyRets: number[] = [];
  const lastSignal = new Map<string, string>();

  for (const [symbol, bars] of universe) {
    if (bars.length < 30) continue;
    let trigIdx = -1;
    for (let i = 25; i < bars.length - 1; i++) {
      if (!triggers(bars, i, params)) continue;
      const prev = lastSignal.get(symbol);
      if (prev && daysBetween(prev, bars[i].date) < 28) continue;
      trigIdx = i;
      lastSignal.set(symbol, bars[i].date);

      const entry = bars[trigIdx + 1].open;
      if (!(entry > 0)) continue;
      const entryDate = bars[trigIdx + 1].date;
      const low20 = Math.min(...bars.slice(Math.max(0, trigIdx - 19), trigIdx + 1).map((b) => b.low));
      const invalidation = Math.max(low20, entry * (1 - params.invalidationPct));

      let exit = entry, exitDate = entryDate;
      const timeStopI = trigIdx + 1 + params.timeStopDays;
      const maxI = Math.min(timeStopI, trigIdx + 1 + HORIZON_CAP, bars.length - 1);
      for (let j = trigIdx + 1; j <= maxI; j++) {
        const b = bars[j];
        if (j > trigIdx + 1 && b.low <= invalidation) { exit = invalidation; exitDate = b.date; break; }
        if (j === maxI) { exit = b.close; exitDate = b.date; }
      }

      const heldDays = Math.round(daysBetween(entryDate, exitDate));
      const qty = Math.max(1, Math.round(BACKTEST_NOTIONAL / entry));
      const net = indiaFriction({ entry, exit, qty, holdingDays: heldDays }).netReturnPct / 100;
      netRets.push(net); entryDates.push(entryDate);
      const nc0 = niftyClose(entryDate), nc1 = niftyClose(exitDate);
      niftyRets.push(nc0 && nc1 ? nc1 / nc0 - 1 : 0);
    }
  }

  if (netRets.length === 0) return EMPTY;
  const wins = netRets.filter((r) => r > 0);
  const losses = netRets.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const chrono = netRets.map((r, i) => ({ d: entryDates[i], r })).sort((a, b) => a.d.localeCompare(b.d));
  let eq = 1, peak = 1, maxDD = 0;
  for (const { r } of chrono) { eq *= 1 + r * 0.02; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, 1 - eq / peak); }

  return {
    trades: netRets.length,
    winRate: wins.length / netRets.length,
    profitFactor: grossWin / Math.max(grossLoss, 0.001 * netRets.length), // floored, no zero-loss sentinel
    avgNetReturnPct: mean(netRets) * 100,
    avgNiftyReturnPct: mean(niftyRets) * 100,
    excessVsNifty: (mean(netRets) - mean(niftyRets)) * 100,
    maxDrawdownPct: maxDD * 100,
  };
}

function avgClose(bars: NseBar[], idx: number, n: number): number { let s = 0; for (let i = idx - n + 1; i <= idx; i++) s += bars[i].close; return s / n; }
function avgVol(bars: NseBar[], idx: number, n: number): number { let s = 0; for (let i = idx - n + 1; i <= idx; i++) s += bars[i].volume; return s / n; }
function avgDeliv(bars: NseBar[], endIdx: number, n: number): number | null {
  const slice = bars.slice(Math.max(0, endIdx - n + 1), endIdx + 1).map((b) => b.deliveryPct).filter((v): v is number => v !== null);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / a.length; }
function daysBetween(a: string, b: string): number { return Math.abs((new Date(b).getTime() - new Date(a).getTime()) / 86400_000); }
