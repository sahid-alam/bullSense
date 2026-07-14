/**
 * Squeeze scout (nightly). Reads the archived FINRA short-interest, price-confirms
 * the top candidates, evaluates the genome, and freezes signals + Treasury cards.
 *
 * Live v1 = days-to-cover + MA20 cross + relative volume (the 7,210-trade backtest
 * variant). Bounded to top-N by days-to-cover so the nightly price fetches stay fast.
 */
import { fetchDailyBars } from "../providers/prices.js";
import {
  getLiveGenomes, squeezeCandidates, latestShortInterestDate, signalExistsWithin,
  insertSignal, getProfiles, getLatestRegime, latestTreasuryState, getOpenPositions, type GenomeRow,
} from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";
import { evaluateEntry, conviction, invalidationPrice, timeStopDate, type Features } from "./genome.js";
import { sizePosition, type Regime, type RiskPrefs } from "./treasury.js";

const MIN_DTC = 5;
const MAX_CANDIDATES = 180; // price-confirm the top-N by days-to-cover

export interface SqueezeReport { candidates: number; priceConfirmed: number; fired: number; signals: string[]; note?: string }

export async function runSqueezeScout(): Promise<SqueezeReport> {
  const report: SqueezeReport = { candidates: 0, priceConfirmed: 0, fired: 0, signals: [] };

  const genome: GenomeRow | undefined = (await getLiveGenomes("squeeze"))[0];
  if (!genome) { report.note = "no live squeeze genome"; return report; }

  const settlement = await latestShortInterestDate();
  if (!settlement) { report.note = "no short-interest archived yet"; return report; }

  const regimeRow = await getLatestRegime();
  const regime = (regimeRow?.regime ?? "neutral") as Regime;
  const regimeAllowed = genome.definition.regime_gate.includes(regime);

  const candidates = await squeezeCandidates(settlement, MIN_DTC, MAX_CANDIDATES);
  report.candidates = candidates.length;
  const profiles = await getProfiles();

  // Portfolio-aware sizing state per profile: real peak equity + real open heat, so the
  // Treasury heat cap and drawdown throttle actually engage instead of the old
  // 0-heat / equity-as-peak stubs that silently disabled both guardrails.
  const book = new Map<string, { equity: number; peak: number; heat: number }>();
  for (const p of profiles) {
    const st = await latestTreasuryState(p.id);
    const equity = st?.equity ?? p.equity;
    const open = await getOpenPositions(p.id);
    const heat = open.reduce((a, o) => a + (Number(o.risk_budget_pct) || 0), 0);
    book.set(p.id, { equity, peak: st?.peak_equity ?? equity, heat });
  }

  for (const cand of candidates) {
    let bars;
    try { bars = await fetchDailyBars(cand.symbol, "1y"); } catch { continue; }
    if (bars.length < 21) continue;
    report.priceConfirmed++;

    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const closes = bars.map((b) => b.close);
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const prevMa20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const vol20 = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20; // prior 20 bars, excl. today
    const relVol = vol20 > 0 ? last.volume / vol20 : 0;
    const low20 = Math.min(...bars.slice(-20).map((b) => b.low));

    const features: Features = {
      days_to_cover: cand.days_to_cover,
      rel_volume: relVol,
      close_vs_ma20: last.close - ma20,
      close_vs_ma20__prev: prev.close - prevMa20,
    };

    if (!evaluateEntry(genome.definition, features).passed) continue;
    if (await signalExistsWithin(genome.id, cand.symbol, genome.definition.dedupe_days)) continue;

    const conv = conviction("squeeze", { days_to_cover: cand.days_to_cover, rel_volume: relVol, si_pct_float: 0.2 });
    const entry = last.close;
    const inval = invalidationPrice(genome.definition.exit, { entry, low20 });
    const now = new Date().toISOString();
    const tsDate = timeStopDate(now, genome.definition.exit.time_stop_days);

    const evidence = {
      days_to_cover: cand.days_to_cover,
      short_shares: cand.si_shares,
      rel_volume: Math.round(relVol * 10) / 10,
      settlement,
    };
    const thesis = `🩳 Squeeze setup: ${cand.symbol} has ${cand.days_to_cover.toFixed(1)} days-to-cover ` +
      `(${(cand.si_shares / 1e6).toFixed(1)}M shares short, settled ${settlement}), and price just crossed above its 20-day average ` +
      `on ${relVol.toFixed(1)}× volume. A short-covering rally can be sharp. Invalidation at ${inval.toFixed(2)}.`;

    const signalId = await insertSignal({
      genome_id: genome.id, symbol: cand.symbol, triggered_at: now, trading_date: now.slice(0, 10),
      conviction: conv, evidence, thesis_md: thesis, invalidation_price: inval,
      time_stop_date: tsDate, regime_at_trigger: regime, regime_suppressed: !regimeAllowed,
    });

    report.fired++;
    report.signals.push(`${cand.symbol}(conv ${conv}${regimeAllowed ? "" : ", SUPPRESSED"})`);

    if (regimeAllowed && signalId) {
      for (const p of profiles) {
        if (!p.telegram_chat_id) continue;
        const b = book.get(p.id)!;
        const size = sizePosition({
          equity: b.equity, peakEquity: b.peak, regime, conviction: conv,
          entryPrice: entry, invalidationPrice: inval, currentHeatPct: b.heat, prefs: p.risk_prefs as RiskPrefs,
        });
        if (size.approved) b.heat += size.riskBudgetPct; // this alert's risk counts against later signals tonight
        const sizeLine = size.approved
          ? `Treasury size: *${size.qty} shares* (${(size.riskBudgetPct * 100).toFixed(1)}% risk, max loss ~${(size.qty * (entry - inval)).toFixed(0)})`
          : `Treasury: *no position* — ${size.reason}`;
        await sendTelegram(p.telegram_chat_id, [
          `🩳 *Squeeze signal — ${cand.symbol}*  (conviction ${conv})`,
          thesis, ``,
          `Entry ~${entry.toFixed(2)} · invalidation *${inval.toFixed(2)}* · time stop ${tsDate}`,
          sizeLine,
          `_Regime ${regime.toUpperCase()}. A signal, not an order._`,
        ].join("\n"));
      }
    }
  }

  return report;
}
