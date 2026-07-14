/**
 * Genome backtest engine (Lab). Replays a squeeze-family genome over historical
 * short-interest + price data and returns net-of-friction stats. Same entry/exit
 * rules as the live Scout, so backtest and live are the SAME logic — no drift.
 *
 * Data is passed in (loaded from the bundle), keeping this a pure function that
 * the Lab can call thousands of times to compare parameter variants.
 */

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface SIRow { symbol: string; settlementDate: string; daysToCover: number }

export interface SqueezeParams {
  minDaysToCover: number;   // days_to_cover >= this
  minRelVolume: number;     // rel_volume >= this
  invalidationPct: number;  // stop at -this from entry (0.10 = -10%), or 20-day low
  timeStopDays: number;
  // --- optional genome dimensions (Lab v1: the LLM can design across these) ---
  requireAbove50ma?: boolean;  // only enter if price is above its 50-day average (trend filter)
  minMomentum20?: number;      // require 20-day momentum >= this % (e.g. 0 = flat, 5 = rising)
  maxMomentum20?: number;      // require 20-day momentum <= this % (fade over-extension)
}

export interface BacktestResult {
  trades: number;
  winRate: number;
  profitFactor: number;     // net of friction
  avgNetReturn: number;     // % per trade
  avgSpyReturn: number;     // % over same windows
  excessVsSpy: number;      // avg net - avg spy
  maxDrawdownPct: number;   // on the equal-weight trade equity curve
}

/** One completed trade — only collected when a sink is passed (the bench uses this to
 *  show the engine's actual entries/exits; the Lab ignores it). Purely additive. */
export interface TradeDetail {
  symbol: string;
  entryDate: string;
  entry: number;
  invalidation: number;
  exitDate: string;
  exit: number;
  netReturnPct: number;     // after friction
  spyReturnPct: number;     // SPY over the same window
  heldDays: number;
  exitReason: "stop" | "time_stop" | "horizon" | "data_end";
}

const FRICTION_RT = 0.002;  // 20bps round-trip (commission + slippage)
const HORIZON_CAP = 60;
const SI_DISSEMINATION_LAG_BDAYS = 9;  // FINRA publishes short interest ~9 business days after settlement

/** Run one genome variant. prices: symbol → bars (sorted). si: settlement candidates. */
export function backtestSqueeze(
  params: SqueezeParams,
  si: SIRow[],
  prices: Map<string, Bar[]>,
  spy: Bar[],
  sink?: TradeDetail[],   // optional: collect per-trade detail (bench). Does not affect stats.
): BacktestResult {
  const spyClose = (d: string) => spy.find((b) => b.date >= d)?.close ?? null;
  const rets: number[] = [];
  const entryDates: string[] = [];
  const spyRets: number[] = [];
  const lastSignal = new Map<string, string>();

  const candidates = si.filter((r) => r.daysToCover >= params.minDaysToCover);

  for (const cand of candidates) {
    const bars = prices.get(cand.symbol);
    if (!bars || bars.length < 21) continue;

    // FINRA short interest isn't public until ~9 business days after the settlement
    // date, so the trigger window must START at dissemination — entering earlier is
    // look-ahead (trading on data that didn't exist yet). Search 21 days from there.
    const windowStart = addBusinessDays(cand.settlementDate, SI_DISSEMINATION_LAG_BDAYS);
    const windowEnd = new Date(new Date(windowStart + "T00:00:00Z").getTime() + 21 * 86400_000).toISOString().slice(0, 10);
    let trigIdx = -1;
    for (let i = 20; i < bars.length; i++) {
      const b = bars[i];
      if (b.date < windowStart || b.date > windowEnd) continue;
      const ma20 = avg(bars, i, 20);
      const prevMa20 = avg(bars, i - 1, 20);
      const vol20 = avgVol(bars, i - 1, 20); // prior 20 bars, excl. the current one
      const relVol = vol20 > 0 ? b.volume / vol20 : 0;
      const crossed = b.close > ma20 && bars[i - 1].close <= prevMa20;
      if (!(crossed && relVol >= params.minRelVolume)) continue;
      // optional Lab-v1 filters
      if (params.requireAbove50ma && i >= 50 && b.close < avg(bars, i, 50)) continue;
      if (params.minMomentum20 !== undefined || params.maxMomentum20 !== undefined) {
        const mom = (b.close / bars[i - 20].close - 1) * 100;
        if (params.minMomentum20 !== undefined && mom < params.minMomentum20) continue;
        if (params.maxMomentum20 !== undefined && mom > params.maxMomentum20) continue;
      }
      trigIdx = i; break;
    }
    if (trigIdx < 0 || trigIdx + 1 >= bars.length) continue;

    // dedupe: one signal per symbol per ~20 sessions
    const trigDate = bars[trigIdx].date;
    const prev = lastSignal.get(cand.symbol);
    if (prev && daysBetween(prev, trigDate) < 28) continue;
    lastSignal.set(cand.symbol, trigDate);

    const entry = bars[trigIdx + 1].open;    // next-session open (anti-cherry-picking)
    if (!(entry > 0)) continue;
    const entryDate = bars[trigIdx + 1].date;
    const low20 = Math.min(...bars.slice(Math.max(0, trigIdx - 19), trigIdx + 1).map((b) => b.low));
    const invalidation = Math.max(low20, entry * (1 - params.invalidationPct));

    let exit = entry, exitDate = entryDate;
    let exitReason: TradeDetail["exitReason"] = "data_end";
    const timeStopI = trigIdx + 1 + params.timeStopDays;
    const maxI = Math.min(timeStopI, trigIdx + 1 + HORIZON_CAP, bars.length - 1);
    for (let i = trigIdx + 1; i <= maxI; i++) {
      const b = bars[i];
      if (i > trigIdx + 1 && b.low <= invalidation) { exit = invalidation; exitDate = b.date; exitReason = "stop"; break; }
      if (i === maxI) { exit = b.close; exitDate = b.date; exitReason = maxI === timeStopI ? "time_stop" : maxI === trigIdx + 1 + HORIZON_CAP ? "horizon" : "data_end"; }
    }
    const net = exit / entry - 1 - FRICTION_RT;
    rets.push(net); entryDates.push(entryDate);
    const se = spyClose(entryDate), sx = spyClose(exitDate);
    const spyRet = se && sx ? sx / se - 1 : 0;
    spyRets.push(spyRet);
    if (sink) sink.push({
      symbol: cand.symbol, entryDate, entry, invalidation, exitDate, exit,
      netReturnPct: net * 100, spyReturnPct: spyRet * 100,
      heldDays: Math.round(daysBetween(entryDate, exitDate)), exitReason,
    });
  }

  if (rets.length === 0) return { trades: 0, winRate: 0, profitFactor: 0, avgNetReturn: 0, avgSpyReturn: 0, excessVsSpy: 0, maxDrawdownPct: 0 };
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  // equal-weight equity curve for drawdown — trades ordered by ENTRY DATE, not the
  // arbitrary candidate-iteration order, or the max-drawdown number is meaningless.
  const chrono = rets.map((r, i) => ({ d: entryDates[i], r })).sort((a, b) => a.d.localeCompare(b.d));
  let eq = 1, peak = 1, maxDD = 0;
  for (const { r } of chrono) { eq *= 1 + r * 0.02; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, 1 - eq / peak); }
  return {
    trades: rets.length,
    winRate: wins.length / rets.length,
    // no 99 sentinel: a "zero-loss" variant over a real sample is almost always an
    // artifact, not an edge. Floor the loss denominator at the friction actually paid
    // so PF stays finite and can't trivially clear the Lab's promotion bar.
    profitFactor: grossWin / Math.max(grossLoss, FRICTION_RT * rets.length),
    avgNetReturn: mean(rets) * 100,
    avgSpyReturn: mean(spyRets) * 100,
    excessVsSpy: (mean(rets) - mean(spyRets)) * 100,
    maxDrawdownPct: maxDD * 100,
  };
}

function avg(bars: Bar[], idx: number, n: number): number { let s = 0; for (let i = idx - n + 1; i <= idx; i++) s += bars[i].close; return s / n; }
function avgVol(bars: Bar[], idx: number, n: number): number { let s = 0; for (let i = idx - n + 1; i <= idx; i++) s += bars[i].volume; return s / n; }
function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / a.length; }
function daysBetween(a: string, b: string): number { return Math.abs((new Date(b).getTime() - new Date(a).getTime()) / 86400_000); }
function addBusinessDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) added++; }
  return d.toISOString().slice(0, 10);
}
