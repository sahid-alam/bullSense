/**
 * The Engine Paper Fund (P1). The engine "takes" every live (non-suppressed) signal
 * at Treasury size against its OWN equity, tracks each as a paper position, and
 * snapshots a daily equity curve. This:
 *   - activates the drawdown throttle (sizing now reads real paper-fund drawdown)
 *   - makes the trust clock concrete (PF over closed positions)
 *   - is the dashboard's centerpiece equity curve
 * Independent of what any human does — it measures the STRATEGY, not our behavior.
 */
import { latestClose } from "../providers/prices.js";
import {
  getProfile, latestTreasuryState, upsertTreasuryState,
  signalsNeedingPaperPosition, enginePositionExists, insertPosition,
  getOpenPositions, closedSignalOutcomes, closePosition, sumRealizedPnl,
  getLatestRegime,
} from "../providers/store.js";
import { sizePosition, heatCap, type Regime, type RiskPrefs } from "./treasury.js";

const STARTING_EQUITY = 100_000;

export interface PaperFundReport { opened: number; closed: number; equity: number; drawdownPct: number; openPositions: number }

export async function runPaperFund(): Promise<PaperFundReport> {
  const report: PaperFundReport = { opened: 0, closed: 0, equity: STARTING_EQUITY, drawdownPct: 0, openPositions: 0 };

  const engine = await getProfile("engine");
  if (!engine) return report;
  const prefs = engine.risk_prefs as RiskPrefs;
  const state = await latestTreasuryState("engine");
  const equityNow = state?.equity ?? STARTING_EQUITY;
  const peak = state?.peak_equity ?? STARTING_EQUITY;
  const regimeRow = await getLatestRegime();
  const regime = (regimeRow?.regime ?? "neutral") as Regime;

  // --- 1. open paper positions for newly-entered signals ---
  const open = await getOpenPositions("engine");
  let heatPct = open.reduce((a, p) => a + (Number(p.risk_budget_pct) || 0), 0);

  for (const sig of await signalsNeedingPaperPosition()) {
    if (await enginePositionExists(sig.id)) continue;
    const size = sizePosition({
      equity: equityNow, peakEquity: peak, regime, conviction: sig.conviction,
      entryPrice: sig.entry_price, invalidationPrice: sig.invalidation_price,
      currentHeatPct: heatPct, prefs,
    });
    if (!size.approved) continue; // heat cap / drawdown pause — the fund declines the trade, on the record
    await insertPosition({
      profile_id: "engine", signal_id: sig.id, symbol: sig.symbol, qty: size.qty,
      entry_price: sig.entry_price, entry_at: sig.entry_at, risk_budget_pct: size.riskBudgetPct,
      invalidation_price: sig.invalidation_price,
    });
    heatPct += size.riskBudgetPct;
    report.opened++;
  }

  // --- 2. close paper positions whose signal has closed ---
  const stillOpen = await getOpenPositions("engine");
  const outcomes = await closedSignalOutcomes(stillOpen.map((p) => p.signal_id));
  for (const p of stillOpen) {
    const o = outcomes[p.signal_id];
    if (!o || o.exit_close == null) continue;
    const realized = p.qty * (o.exit_close - p.entry_price); // long only
    await closePosition(p.id, o.exit_close, realized);
    report.closed++;
  }

  // --- 3. snapshot equity: starting + realized + unrealized(open marked to latest) ---
  const realizedTotal = await sumRealizedPnl("engine");
  const openAfter = await getOpenPositions("engine");
  let unrealized = 0;
  let openHeat = 0;
  for (const p of openAfter) {
    openHeat += Number(p.risk_budget_pct) || 0;
    try {
      const { close } = await latestClose(p.symbol);
      unrealized += p.qty * (close - p.entry_price);
    } catch { /* skip unpriceable; counted at entry cost */ }
  }
  const equity = STARTING_EQUITY + realizedTotal + unrealized;
  const newPeak = Math.max(peak, equity);
  const dd = newPeak > 0 ? 1 - equity / newPeak : 0;

  const today = new Date().toISOString().slice(0, 10);
  await upsertTreasuryState({
    profile_id: "engine", date: today, equity, peak_equity: newPeak,
    drawdown_pct: dd, heat_pct: openHeat, regime,
    sizing_multiplier: dd >= prefs.dd_throttle_pause ? 0 : dd >= prefs.dd_throttle_half ? 0.5 : 1,
  });

  report.equity = Math.round(equity);
  report.drawdownPct = Math.round(dd * 1000) / 10;
  report.openPositions = openAfter.length;
  return report;
}
