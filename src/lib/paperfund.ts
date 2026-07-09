/**
 * Fund tracking (P1). Two kinds of "fund":
 *   - The ENGINE paper fund auto-takes every live (non-suppressed) signal at Treasury
 *     size vs its own equity — it measures the STRATEGY, independent of our behavior.
 *   - PERSONAL funds hold only the positions a human actually took (/took) — they
 *     measure US, and the gap between the two is User Alpha.
 * Both share the same settle logic: close positions whose signal has closed, then
 * snapshot a daily equity curve. The engine's curve activates the drawdown throttle.
 */
import { latestClose } from "../providers/prices.js";
import {
  getProfile, latestTreasuryState, upsertTreasuryState,
  signalsNeedingPaperPosition, enginePositionExists, insertPosition,
  getOpenPositions, closedSignalOutcomes, closePosition, sumRealizedPnl,
  getLatestRegime, getProfilesWithPositions, scoreOverrideForPosition,
} from "../providers/store.js";
import { sizePosition, type Regime, type RiskPrefs } from "./treasury.js";

const ENGINE_START = 100_000;

export interface FundReport { profile: string; opened: number; closed: number; equity: number; drawdownPct: number; openPositions: number }

/** Close finished positions and snapshot the equity curve for one profile. */
async function settleProfile(profileId: string, startingEquity: number, regime: Regime, prefs: RiskPrefs): Promise<FundReport> {
  const report: FundReport = { profile: profileId, opened: 0, closed: 0, equity: startingEquity, drawdownPct: 0, openPositions: 0 };
  const prev = await latestTreasuryState(profileId);
  const peakPrev = prev?.peak_equity ?? startingEquity;

  // close positions whose signal has closed
  const stillOpen = await getOpenPositions(profileId);
  const outcomes = await closedSignalOutcomes(stillOpen.filter((p) => p.signal_id != null).map((p) => p.signal_id));
  for (const p of stillOpen) {
    const o = p.signal_id != null ? outcomes[p.signal_id] : undefined;
    if (!o || o.exit_close == null) continue;
    await closePosition(p.id, o.exit_close, p.qty * (o.exit_close - p.entry_price));
    // score any override attached to this position (sizing deviation P&L)
    if (profileId !== "engine") await scoreOverrideForPosition(p.id, p.qty, p.entry_price, o.exit_close);
    report.closed++;
  }

  // snapshot equity = starting + realized + unrealized(open, marked to latest)
  const realizedTotal = await sumRealizedPnl(profileId);
  const openAfter = await getOpenPositions(profileId);
  let unrealized = 0, openHeat = 0;
  for (const p of openAfter) {
    openHeat += Number(p.risk_budget_pct) || 0;
    try { unrealized += p.qty * ((await latestClose(p.symbol)).close - p.entry_price); } catch { /* unpriceable */ }
  }
  const equity = startingEquity + realizedTotal + unrealized;
  const peak = Math.max(peakPrev, equity);
  const dd = peak > 0 ? 1 - equity / peak : 0;

  await upsertTreasuryState({
    profile_id: profileId, date: new Date().toISOString().slice(0, 10),
    equity, peak_equity: peak, drawdown_pct: dd, heat_pct: openHeat, regime,
    sizing_multiplier: dd >= prefs.dd_throttle_pause ? 0 : dd >= prefs.dd_throttle_half ? 0.5 : 1,
  });

  report.equity = Math.round(equity);
  report.drawdownPct = Math.round(dd * 1000) / 10;
  report.openPositions = openAfter.length;
  return report;
}

/** Engine paper fund: auto-open every live signal, then settle. */
export async function runPaperFund(): Promise<FundReport> {
  const engine = await getProfile("engine");
  if (!engine) return { profile: "engine", opened: 0, closed: 0, equity: ENGINE_START, drawdownPct: 0, openPositions: 0 };
  const prefs = engine.risk_prefs as RiskPrefs;
  const state = await latestTreasuryState("engine");
  const equityNow = state?.equity ?? ENGINE_START;
  const peak = state?.peak_equity ?? ENGINE_START;
  const regime = ((await getLatestRegime())?.regime ?? "neutral") as Regime;

  let heatPct = (await getOpenPositions("engine")).reduce((a, p) => a + (Number(p.risk_budget_pct) || 0), 0);
  let opened = 0;
  for (const sig of await signalsNeedingPaperPosition()) {
    if (await enginePositionExists(sig.id)) continue;
    const size = sizePosition({ equity: equityNow, peakEquity: peak, regime, conviction: sig.conviction, entryPrice: sig.entry_price, invalidationPrice: sig.invalidation_price, currentHeatPct: heatPct, prefs });
    if (!size.approved) continue;
    await insertPosition({ profile_id: "engine", signal_id: sig.id, symbol: sig.symbol, qty: size.qty, entry_price: sig.entry_price, entry_at: sig.entry_at, risk_budget_pct: size.riskBudgetPct, invalidation_price: sig.invalidation_price });
    heatPct += size.riskBudgetPct;
    opened++;
  }

  const r = await settleProfile("engine", ENGINE_START, regime, prefs);
  r.opened = opened;
  return r;
}

/** Personal funds: settle every human profile that holds positions (opened via /took). */
export async function runPersonalFunds(): Promise<FundReport[]> {
  const regime = ((await getLatestRegime())?.regime ?? "neutral") as Regime;
  const reports: FundReport[] = [];
  for (const profileId of await getProfilesWithPositions()) {
    if (profileId === "engine") continue;
    const p = await getProfile(profileId);
    if (!p) continue;
    reports.push(await settleProfile(profileId, p.equity, regime, p.risk_prefs as RiskPrefs));
  }
  return reports;
}
