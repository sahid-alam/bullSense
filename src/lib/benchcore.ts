/**
 * Bench core — the engine test-bench as a PURE function that returns structured data.
 *
 * runBench(params) drives the real engine over one ticker and returns everything a caller
 * needs to render: the live regime, the historical replay (every fire + outcome), the
 * aggregate stats, the live Treasury decision, and the "would it fire right now" snapshot.
 * It prints NOTHING and reads no argv — the CLI (src/jobs/bench.ts) and the dashboard's
 * server action are both thin callers of THIS function. One engine, two front-ends, no drift.
 *
 * Data path: days-to-cover is resolved archive-first (short_interest table — fast, indexed,
 * the same SI the nightly scout uses), then the caller's manual value, then optionally a live
 * FINRA page-through (CLI only — too slow for a serverless request). US-only; NSE tickers
 * return an honest "engine can't evaluate" result.
 */
import { fetchDailyBars, type Bar } from "../providers/prices.js";
import { fetchLatestShortInterest } from "../providers/shortinterest.js";
import {
  getLatestRegime, getLiveGenomes, storeAvailable, getProfiles,
  latestTreasuryState, getOpenPositions, latestShortInterestForSymbol,
} from "../providers/store.js";
import { evaluateEntry, conviction, invalidationPrice, timeStopDate, type Features, type GenomeDef } from "./genome.js";
import { backtestSqueeze, type SIRow, type TradeDetail, type BacktestResult } from "./backtest.js";
import { sizePosition, type Regime, type RiskPrefs, type SizingResult } from "./treasury.js";

// Live squeeze genome fallback — mirrors genomes.squeeze-setup-v1 exactly (for offline runs).
export const FALLBACK_GENOME: GenomeDef = {
  entry: [
    { feature: "days_to_cover", op: ">=", value: 5 },
    { feature: "close_vs_ma20", op: "cross_above" },
    { feature: "rel_volume", op: ">=", value: 1.5 },
  ],
  regime_gate: ["risk_on", "neutral"],
  dedupe_days: 20,
  exit: { invalidation: "low_20d_or_-10pct", time_stop_days: 30 },
  universe_extra: { mcap_max: 10_000_000_000 },
};

export const DEFAULT_PREFS: RiskPrefs = {
  per_trade_risk_min: 0.01, per_trade_risk_max: 0.025,
  heat_cap_risk_on: 0.20, heat_cap_neutral: 0.12, heat_cap_risk_off: 0.05,
  dd_throttle_half: 0.10, dd_throttle_pause: 0.18, max_position_pct: 0.25,
};

export interface BenchParams {
  symbol: string;
  dtc?: number;          // manual days-to-cover override
  equity?: number;       // hypothetical account equity (default 100k)
  years?: number;        // replay window, 1–10 (default 3)
  profileId?: string;    // size the live-decision card against a real account
  allowLiveSI?: boolean; // CLI only: fall back to a slow live FINRA fetch if the archive misses
}

export interface BenchResult {
  symbol: string;
  isNSE: boolean;
  ok: boolean;                       // false only on a hard data failure (no price history)
  error?: string;
  notes: string[];                   // assumptions & boundary messages (e.g. US-only)
  priceMeta?: { sessions: number; from: string; to: string; lastClose: number };
  regime?: { regime: Regime; label: string; gateOpen: boolean };
  dtc?: { value: number; source: string };   // absent = no short interest → engine cannot fire
  replay?: { minDtc: number; minRelVol: number; trades: TradeDetail[]; stats: BacktestResult };
  liveDecision?: {
    entryDate: string; conviction: number; entry: number; invalidation: number; timeStop: string;
    account: string; sized: SizingResult; maxLoss: number;
  };
  rightNow?: { fires: boolean; suppressed: boolean; features: Record<string, number>; failedOn: string[] };
}

const REGIME_LABEL: Record<Regime, string> = { risk_on: "RISK_ON", neutral: "NEUTRAL", risk_off: "RISK_OFF" };

export async function runBench(params: BenchParams): Promise<BenchResult> {
  const symbol = params.symbol.toUpperCase();
  const isNSE = symbol.endsWith(".NS");
  const years = Math.min(10, Math.max(1, params.years ?? 3));
  const range = (years <= 1 ? "1y" : years <= 3 ? "3y" : years <= 5 ? "5y" : "10y") as "1y" | "3y" | "5y" | "10y";
  const equity = params.equity ?? 100_000;
  const notes: string[] = [];

  // 1. PRICE DATA
  let bars: Bar[], spy: Bar[];
  try {
    [bars, spy] = await Promise.all([fetchDailyBars(symbol, range), fetchDailyBars("SPY", range)]);
  } catch (e) {
    return { symbol, isNSE, ok: false, error: `could not fetch prices: ${e}`, notes };
  }
  if (bars.length < 40) {
    return { symbol, isNSE, ok: false, error: `only ${bars.length} price bars — not enough history (check the ticker)`, notes };
  }
  const last = bars[bars.length - 1];
  const priceMeta = { sessions: bars.length, from: bars[0].date, to: last.date, lastClose: last.close };

  // 2. MARKET CONTEXT (live Radar) + live genome
  let regime: Regime = "neutral", regimeLabelExtra = "default (store not read)";
  if (storeAvailable()) {
    const r = await getLatestRegime();
    if (r) { regime = r.regime as Regime; regimeLabelExtra = `Radar ${r.score}/100 (${r.date})`; }
  }
  const genome: GenomeDef = (storeAvailable() ? (await getLiveGenomes("squeeze"))[0]?.definition : null) ?? FALLBACK_GENOME;
  const gateOpen = genome.regime_gate.includes(regime);
  const regimeOut = { regime, label: `${REGIME_LABEL[regime]} — ${regimeLabelExtra}`, gateOpen };

  // 3. DAYS-TO-COVER — archive-first, then manual, then optional live
  let dtc: { value: number; source: string } | undefined;
  if (typeof params.dtc === "number" && isFinite(params.dtc)) {
    dtc = { value: params.dtc, source: "manual override" };
  } else if (!isNSE && storeAvailable()) {
    const si = await latestShortInterestForSymbol(symbol);
    if (si) dtc = { value: Number(si.days_to_cover), source: `archived FINRA ${si.settlement_date} (${(Number(si.si_shares) / 1e6).toFixed(1)}M short)` };
  }
  if (!dtc && !isNSE && params.allowLiveSI) {
    const live = await fetchLatestShortInterest();
    const row = live?.rows.find((r) => r.symbol === symbol);
    if (row) dtc = { value: row.daysToCover, source: `live FINRA ${live!.date} (${(row.shortShares / 1e6).toFixed(1)}M short)` };
  }

  // No short interest → the squeeze engine cannot evaluate this name. Honest boundary.
  if (!dtc) {
    if (isNSE) notes.push(`${symbol} is NSE. The Squeeze engine runs on FINRA short interest (US-only), so it cannot generate a signal here. Pass a days-to-cover value to test the trigger logic hypothetically.`);
    else notes.push(`${symbol} has no qualifying short interest on record (below the 200k-share floor, or not squeeze-relevant). Pass a days-to-cover value to test the trigger anyway.`);
    return { symbol, isNSE, ok: true, notes, priceMeta, regime: regimeOut, rightNow: rightNowSnapshot(bars, genome, undefined, gateOpen) };
  }

  notes.push(`Days-to-cover held constant at ${dtc.value.toFixed(1)} across the replay (SI is US-only + latest-settlement-only; the signal's day-to-day variation is the price cross + relative volume, not DTC).`);
  const minDtc = genome.entry.find((r) => r.feature === "days_to_cover")?.value ?? 5;
  const minRelVol = genome.entry.find((r) => r.feature === "rel_volume")?.value ?? 1.5;

  // 4. HISTORICAL REPLAY — the real Lab/Scout path, with per-trade detail collected
  const trades: TradeDetail[] = [];
  const stats = backtestSqueeze(
    { minDaysToCover: minDtc, minRelVolume: minRelVol, invalidationPct: 0.10, timeStopDays: genome.exit.time_stop_days },
    syntheticSI(symbol, bars, dtc.value),
    new Map([[symbol, bars]]),
    spy,
    trades,
  );

  // 5. LIVE-DECISION CARD (Treasury) on the most recent fire
  let liveDecision: BenchResult["liveDecision"];
  if (trades.length > 0) {
    const t = trades[trades.length - 1];
    const conv = conviction("squeeze", { days_to_cover: dtc.value, rel_volume: minRelVol, si_pct_float: 0.2 });
    let acctEquity = equity, peak = equity, heat = 0, prefs = DEFAULT_PREFS, account = `hypothetical ₹${equity.toLocaleString()}`;
    if (params.profileId && storeAvailable()) {
      const prof = (await getProfiles()).find((p) => p.id === params.profileId);
      if (!prof) notes.push(`profile "${params.profileId}" not found — sized against the hypothetical account instead.`);
      else {
        const st = await latestTreasuryState(prof.id);
        const open = await getOpenPositions(prof.id);
        acctEquity = st?.equity ?? prof.equity;
        peak = st?.peak_equity ?? acctEquity;
        heat = open.reduce((a, o) => a + (Number(o.risk_budget_pct) || 0), 0);
        prefs = { ...DEFAULT_PREFS, ...(prof.risk_prefs ?? {}) };
        account = `${prof.id}: ₹${Math.round(acctEquity).toLocaleString()} equity, peak ₹${Math.round(peak).toLocaleString()}, ${(heat * 100).toFixed(1)}% open heat`;
      }
    }
    const sized = sizePosition({ equity: acctEquity, peakEquity: peak, regime, conviction: conv, entryPrice: t.entry, invalidationPrice: t.invalidation, currentHeatPct: heat, prefs });
    liveDecision = {
      entryDate: t.entryDate, conviction: conv, entry: t.entry, invalidation: t.invalidation,
      timeStop: timeStopDate(t.entryDate, genome.exit.time_stop_days), account, sized,
      maxLoss: sized.qty * (t.entry - t.invalidation),
    };
  }

  return {
    symbol, isNSE, ok: true, notes, priceMeta, regime: regimeOut, dtc,
    replay: { minDtc, minRelVol, trades, stats },
    liveDecision,
    rightNow: rightNowSnapshot(bars, genome, dtc.value, gateOpen),
  };
}

/** "Would it fire on the latest bar today?" — features match runSqueezeScout exactly. */
function rightNowSnapshot(bars: Bar[], genome: GenomeDef, dtc: number | undefined, gateOpen: boolean): BenchResult["rightNow"] {
  const snap = snapshotFeatures(bars);
  const features: Features = dtc !== undefined ? { days_to_cover: dtc, ...snap } : snap;
  const ev = evaluateEntry(genome, features);
  return {
    fires: ev.passed, suppressed: ev.passed && !gateOpen,
    features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, Number(v)])),
    failedOn: ev.failedOn,
  };
}

/** Trailing-window features for the latest bar. */
function snapshotFeatures(bars: Bar[]): Features {
  const last = bars[bars.length - 1], prev = bars[bars.length - 2];
  const closes = bars.map((b) => b.close);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const prevMa20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const vol20 = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20; // prior 20 bars, excl. today
  const relVol = vol20 > 0 ? last.volume / vol20 : 0;
  return {
    rel_volume: Math.round(relVol * 100) / 100,
    close_vs_ma20: Math.round((last.close - ma20) * 100) / 100,
    close_vs_ma20__prev: Math.round((prev.close - prevMa20) * 100) / 100,
  };
}

/** Bi-monthly (15th + month-end) settlement dates spanning the bar range, weekday-nudged,
 *  each carrying the SAME days-to-cover — the stated constant-DTC approximation. */
function syntheticSI(symbol: string, bars: Bar[], dtc: number): SIRow[] {
  const first = new Date(bars[0].date + "T00:00:00Z");
  const last = new Date(bars[bars.length - 1].date + "T00:00:00Z");
  const rows: SIRow[] = [];
  const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (d <= last) {
    for (const day of [15, 0]) {
      const dt = day === 0 ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15));
      while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() - 1);
      const iso = dt.toISOString().slice(0, 10);
      if (iso >= bars[0].date && iso <= bars[bars.length - 1].date) rows.push({ symbol, settlementDate: iso, daysToCover: dtc });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return rows;
}
