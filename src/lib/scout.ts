/**
 * The Scout — turns a live genome + market data into frozen signals.
 * Hype path (v1): reads the sentiment archive for velocity, confirms with price,
 * evaluates the genome, and on a pass freezes an immutable signal + fans out
 * Treasury-sized cards to each profile.
 */
import { fetchDailyBars } from "../providers/prices.js";
import {
  getLiveGenomes, getSentimentHistory, getActiveHypeSymbols, signalExistsWithin,
  insertSignal, getProfiles, getLatestRegime, latestTreasuryState, getOpenPositions, type GenomeRow,
} from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";
import { evaluateEntry, conviction, invalidationPrice, timeStopDate, type Features } from "./genome.js";
import { sizePosition, type Regime, type RiskPrefs } from "./treasury.js";

const TOP_N = 40; // most-mentioned symbols to price-confirm each sweep (keeps it fast)

/** Mention velocity = current 24h mentions ÷ the trailing 7-day hourly-average baseline. */
async function mentionVelocity(symbol: string, current: number): Promise<number | undefined> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const hist = await getSentimentHistory(symbol, "apewisdom", since);
  if (hist.length < 12) return undefined; // not enough baseline yet (needs ~days of archive)
  const vals = hist.map((h) => h.mentions_24h ?? 0).filter((v) => v > 0);
  if (vals.length === 0) return undefined;
  const baseline = vals.reduce((a, b) => a + b, 0) / vals.length;
  return baseline > 0 ? current / baseline : undefined;
}

export interface SweepReport { evaluated: number; velocityReady: number; fired: number; signals: string[]; note?: string }

export async function runHypeScout(): Promise<SweepReport> {
  const report: SweepReport = { evaluated: 0, velocityReady: 0, fired: 0, signals: [] };

  const genomes = await getLiveGenomes("hype");
  const genome: GenomeRow | undefined = genomes[0];
  if (!genome) { report.note = "no live hype genome"; return report; }

  const regimeRow = await getLatestRegime();
  const regime = (regimeRow?.regime ?? "neutral") as Regime;
  const regimeAllowed = genome.definition.regime_gate.includes(regime);

  const symbols = (await getActiveHypeSymbols(6)).slice(0, TOP_N);
  const profiles = await getProfiles();

  // Portfolio-aware sizing state per profile (same as the squeeze scout): real peak
  // equity + real open heat so the heat cap and drawdown throttle actually engage.
  // ponytail: duplicated with squeeze.ts; extract a shared helper if a third scout appears.
  const book = new Map<string, { equity: number; peak: number; heat: number }>();
  for (const p of profiles) {
    const st = await latestTreasuryState(p.id);
    const equity = st?.equity ?? p.equity;
    const open = await getOpenPositions(p.id);
    const heat = open.reduce((a, o) => a + (Number(o.risk_budget_pct) || 0), 0);
    book.set(p.id, { equity, peak: st?.peak_equity ?? equity, heat });
  }

  for (const symbol of symbols) {
    report.evaluated++;
    // current mentions = latest snapshot
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const recent = await getSentimentHistory(symbol, "apewisdom", since);
    const current = recent[0]?.mentions_24h ?? 0;
    if (current < 30) continue;

    const velocity = await mentionVelocity(symbol, current);
    if (velocity === undefined) continue; // baseline not ready — correct behavior early on
    report.velocityReady++;

    // price confirmation
    let bars;
    try { bars = await fetchDailyBars(symbol, "1y"); } catch { continue; }
    if (bars.length < 21) continue;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const vol20 = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20; // prior 20 bars, excl. today
    const relVol = vol20 > 0 ? last.volume / vol20 : 0;
    const dayChange = (last.close / prev.close - 1) * 100;

    // tradestie bullish ratio if we have it
    const tsHist = await getSentimentHistory(symbol, "tradestie", since);
    const bullish = tsHist[0]?.bullish_ratio ?? 0.6;

    const features: Features = {
      mentions_24h: current,
      mention_velocity: velocity,
      bullish_ratio: bullish,
      rel_volume: relVol,
      day_change_pct: dayChange,
    };

    const result = evaluateEntry(genome.definition, features);
    if (!result.passed) continue;

    // dedupe
    if (await signalExistsWithin(genome.id, symbol, genome.definition.dedupe_days)) continue;

    const conv = conviction("hype", features);
    const entry = last.close;
    const inval = invalidationPrice(genome.definition.exit, { entry, triggerDayLow: last.low });
    const now = new Date().toISOString();
    const tsDate = timeStopDate(now, genome.definition.exit.time_stop_days);

    const evidence = {
      ...result.evidence,
      mentions_24h: current,
      mention_velocity: Math.round(velocity * 10) / 10,
      rel_volume: Math.round(relVol * 10) / 10,
      day_change_pct: Math.round(dayChange * 10) / 10,
    };
    const thesis = `🔥 Hype surge: ${symbol} mentioned ${current}× in 24h (${velocity.toFixed(1)}× its 7-day pace), ` +
      `up ${dayChange.toFixed(1)}% today on ${relVol.toFixed(1)}× volume. Momentum confirmed by price. ` +
      `Risk: hype fades fast — invalidation at ${inval.toFixed(2)}.`;

    const signalId = await insertSignal({
      genome_id: genome.id, symbol, triggered_at: now, trading_date: now.slice(0, 10),
      conviction: conv, evidence, thesis_md: thesis, invalidation_price: inval,
      time_stop_date: tsDate, regime_at_trigger: regime, regime_suppressed: !regimeAllowed,
    });

    report.fired++;
    report.signals.push(`${symbol}(conv ${conv}${regimeAllowed ? "" : ", SUPPRESSED"})`);

    // fan out Treasury-sized cards — only when the regime allows a live trade
    if (regimeAllowed && signalId) {
      for (const p of profiles) {
        if (!p.telegram_chat_id) continue;
        const b = book.get(p.id)!;
        const size = sizePosition({
          equity: b.equity, peakEquity: b.peak, regime, conviction: conv,
          entryPrice: entry, invalidationPrice: inval, currentHeatPct: b.heat, prefs: p.risk_prefs as RiskPrefs,
        });
        if (size.approved) b.heat += size.riskBudgetPct; // this alert's risk counts against later signals this sweep
        const sizeLine = size.approved
          ? `Treasury size: *${size.qty} shares* (${(size.riskBudgetPct * 100).toFixed(1)}% risk, max loss ~${(size.qty * (entry - inval)).toFixed(0)})`
          : `Treasury: *no position* — ${size.reason}`;
        await sendTelegram(p.telegram_chat_id, [
          `🔥 *Hype signal — ${symbol}*  (conviction ${conv})`,
          thesis,
          ``,
          `Entry ~${entry.toFixed(2)} · invalidation *${inval.toFixed(2)}* · time stop ${tsDate}`,
          sizeLine,
          `_Regime ${regime.toUpperCase()}. Your call — this is a signal, not an order._`,
        ].join("\n"));
      }
    }
  }

  return report;
}
