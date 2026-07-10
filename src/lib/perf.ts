/**
 * Risk-adjusted performance metrics for an equity curve (P2).
 * CAGR, Sharpe, Sortino, max drawdown, volatility — the real bar a strategy must
 * clear (FINAL.md §3A: "an aggressive strategy has to earn its risk premium").
 * Pure functions over a daily equity series; benchmark (SPY) compared over the
 * same window so "beats a coin flip" isn't confused with "beats buy-and-hold".
 */

const TRADING_DAYS = 252;

export interface PerfMetrics {
  days: number;
  totalReturnPct: number;
  cagrPct: number;
  volPct: number;        // annualized
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
}

function dailyReturns(equity: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < equity.length; i++) r.push(equity[i] / equity[i - 1] - 1);
  return r;
}

function std(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** rfDaily: risk-free daily rate (default ~4% annual). */
export function perfMetrics(equity: number[], rfAnnual = 0.04): PerfMetrics {
  const empty: PerfMetrics = { days: equity.length, totalReturnPct: 0, cagrPct: 0, volPct: 0, sharpe: 0, sortino: 0, maxDrawdownPct: 0 };
  if (equity.length < 2) return empty;

  const rets = dailyReturns(equity);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const rfDaily = rfAnnual / TRADING_DAYS;

  const vol = std(rets, mean);
  const downside = rets.filter((r) => r < 0);
  const downMean = downside.length ? downside.reduce((a, b) => a + b, 0) / downside.length : 0;
  const downStd = std(downside, downMean);

  const totalReturn = equity[equity.length - 1] / equity[0] - 1;
  const cagr = Math.pow(equity[equity.length - 1] / equity[0], TRADING_DAYS / rets.length) - 1;

  let peak = equity[0], maxDD = 0;
  for (const e of equity) { peak = Math.max(peak, e); maxDD = Math.max(maxDD, 1 - e / peak); }

  return {
    days: equity.length,
    totalReturnPct: totalReturn * 100,
    cagrPct: cagr * 100,
    volPct: vol * Math.sqrt(TRADING_DAYS) * 100,
    sharpe: vol > 0 ? ((mean - rfDaily) / vol) * Math.sqrt(TRADING_DAYS) : 0,
    sortino: downStd > 0 ? ((mean - rfDaily) / downStd) * Math.sqrt(TRADING_DAYS) : 0,
    maxDrawdownPct: maxDD * 100,
  };
}
