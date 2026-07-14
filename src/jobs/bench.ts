/**
 * Engine Bench — run the REAL engine on ONE named stock and print what it sees & decides.
 *
 *   npx tsx src/jobs/bench.ts GME
 *   npx tsx src/jobs/bench.ts GME --dtc 7 --equity 100000 --years 3
 *   npx tsx src/jobs/bench.ts CUPID.NS --dtc 6           (NSE: SI is US-only, so pass --dtc to test the logic)
 *
 * It calls the same functions the nightly Scout / Lab use — evaluateEntry, conviction,
 * invalidationPrice, sizePosition, backtestSqueeze — so this genuinely tests our
 * capabilities, not a parallel re-implementation. It does two things:
 *   1) HISTORICAL REPLAY — walks the price history and shows every day the engine WOULD
 *      have fired, with the forward outcome (stop / time-stop / return), because the
 *      entry uses a one-day MA-cross that a single snapshot almost never catches.
 *   2) RIGHT-NOW snapshot — would it fire on the latest bar today? (secondary line)
 *
 * Honest approximation: FINRA short interest is US-only and only the latest settlement is
 * fetchable, so we hold days-to-cover CONSTANT across the window (from the live lookup or
 * --dtc). The signal's day-to-day variation comes from the price cross + relative volume,
 * not DTC — so this is a fair test of the trigger. It is stated in the output.
 */
import { fetchDailyBars, type Bar } from "../providers/prices.js";
import { fetchLatestShortInterest } from "../providers/shortinterest.js";
import { getLatestRegime, getLiveGenomes, storeAvailable, getProfiles, latestTreasuryState, getOpenPositions } from "../providers/store.js";
import { evaluateEntry, conviction, invalidationPrice, timeStopDate, type Features, type GenomeDef } from "../lib/genome.js";
import { backtestSqueeze, type SIRow, type TradeDetail } from "../lib/backtest.js";
import { sizePosition, type Regime, type RiskPrefs } from "../lib/treasury.js";

// Load .env so a local run reads the LIVE engine state (regime, genome, account) from
// Supabase. In CI the env is injected directly and there is no .env file — hence the catch.
try { process.loadEnvFile(".env"); } catch { /* no .env file — env already set (CI) */ }

// The live squeeze genome (fallback mirrors genomes.squeeze-setup-v1 exactly, for offline runs).
const FALLBACK_GENOME: GenomeDef = {
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

const DEFAULT_PREFS: RiskPrefs = {
  per_trade_risk_min: 0.01, per_trade_risk_max: 0.025,
  heat_cap_risk_on: 0.20, heat_cap_neutral: 0.12, heat_cap_risk_off: 0.05,
  dd_throttle_half: 0.10, dd_throttle_pause: 0.18, max_position_pct: 0.25,
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Bi-monthly (15th + month-end) settlement dates spanning the bar range, weekday-nudged.
 *  Each carries the SAME days-to-cover — the stated approximation. */
function syntheticSI(symbol: string, bars: Bar[], dtc: number): SIRow[] {
  const first = new Date(bars[0].date + "T00:00:00Z");
  const last = new Date(bars[bars.length - 1].date + "T00:00:00Z");
  const rows: SIRow[] = [];
  const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (d <= last) {
    for (const day of [15, 0]) { // 15th, then month-end (day 0 of next month)
      const dt = day === 0 ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15));
      while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() - 1);
      const iso = dt.toISOString().slice(0, 10);
      if (iso >= bars[0].date && iso <= bars[bars.length - 1].date) rows.push({ symbol, settlementDate: iso, daysToCover: dtc });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return rows;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(64));

async function main() {
  const symbol = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "").toUpperCase();
  if (!symbol) { line("Usage: npx tsx src/jobs/bench.ts SYMBOL [--dtc N] [--equity N] [--years N] [--profile id]"); process.exit(1); }
  const equity = Number(arg("--equity") ?? 100_000);
  const years = Math.min(10, Math.max(1, Number(arg("--years") ?? 3)));
  const range = (years <= 1 ? "1y" : years <= 3 ? "3y" : years <= 5 ? "5y" : "10y") as "1y" | "3y" | "5y" | "10y";
  const isNSE = symbol.endsWith(".NS");

  line();
  line(`  ⚙️  BULLSENSE ENGINE BENCH — ${symbol}`);
  rule();

  // ── 1. PRICE DATA ────────────────────────────────────────────────
  let bars: Bar[], spy: Bar[];
  try {
    [bars, spy] = await Promise.all([fetchDailyBars(symbol, range), fetchDailyBars("SPY", range)]);
  } catch (e) { line(`✗ Could not fetch prices for ${symbol}: ${e}`); process.exit(1); }
  if (bars.length < 40) { line(`✗ Only ${bars.length} bars for ${symbol} — need history to test. Check the ticker.`); process.exit(1); }
  const last = bars[bars.length - 1];
  line(`Price history: ${bars.length} sessions, ${bars[0].date} → ${last.date}. Last close ${last.close.toFixed(2)}.`);

  // ── 2. MARKET CONTEXT (Radar) ────────────────────────────────────
  let regime: Regime = "neutral"; let regimeNote = "default (store not read)";
  if (storeAvailable()) {
    const r = await getLatestRegime();
    if (r) { regime = r.regime as Regime; regimeNote = `Radar ${r.score}/100 (${r.date})`; }
  }
  const genome: GenomeDef = (storeAvailable() ? (await getLiveGenomes("squeeze"))[0]?.definition : null) ?? FALLBACK_GENOME;
  const gateOpen = genome.regime_gate.includes(regime);
  line(`Market regime: ${regime.toUpperCase()} — ${regimeNote}. Squeeze gate for this regime: ${gateOpen ? "OPEN ✓" : "CLOSED ✗ (would fire but be SUPPRESSED live)"}`);

  // ── 3. SHORT INTEREST (days-to-cover) ────────────────────────────
  let dtc = Number(arg("--dtc") ?? NaN);
  let dtcSource = "--dtc override";
  if (!isFinite(dtc)) {
    if (isNSE) {
      rule();
      line(`⚠️  ${symbol} is an NSE stock. Our Squeeze engine runs on FINRA short interest, which is`);
      line(`   US-only — so the engine CANNOT generate a squeeze signal here. This is a real current`);
      line(`   boundary, not a bug. Re-run with --dtc N to test the trigger logic hypothetically.`);
      snapshotPriceOnly(bars, genome);
      rule(); line(`Verdict: engine has no short-interest data for ${symbol} → no signal. (US tickers only.)`); line();
      return;
    }
    line(`Fetching latest FINRA short interest for ${symbol}…`);
    const si = await fetchLatestShortInterest();
    const row = si?.rows.find((r) => r.symbol === symbol);
    if (row) { dtc = row.daysToCover; dtcSource = `FINRA ${si!.date} (${(row.shortShares / 1e6).toFixed(1)}M shares short)`; }
    else {
      line(`   ${symbol} not in the latest settlement (below 200k-share floor, or not squeeze-relevant).`);
      line(`   Re-run with --dtc N to test the trigger logic anyway.`);
      snapshotPriceOnly(bars, genome);
      rule(); line(`Verdict: no qualifying short interest → engine would not fire on ${symbol} now.`); line();
      return;
    }
  }
  line(`Days-to-cover: ${dtc.toFixed(1)} — ${dtcSource}. (Held constant across the replay — see header note.)`);
  const minDtc = genome.entry.find((r) => r.feature === "days_to_cover")?.value ?? 5;
  const minRv = genome.entry.find((r) => r.feature === "rel_volume")?.value ?? 1.5;

  // ── 4. HISTORICAL REPLAY (the real Lab/Scout path) ───────────────
  rule();
  line(`HISTORICAL REPLAY — every day the engine would have fired over ${years}y`);
  line(`(entry rules: days-to-cover ≥ ${minDtc}, 20-day MA cross-up, rel-volume ≥ ${minRv})`);
  line();
  const trades: TradeDetail[] = [];
  const res = backtestSqueeze(
    { minDaysToCover: minDtc, minRelVolume: minRv, invalidationPct: 0.10, timeStopDays: genome.exit.time_stop_days },
    syntheticSI(symbol, bars, dtc),
    new Map([[symbol, bars]]),
    spy,
    trades,
  );

  if (trades.length === 0) {
    line(`No fires: the price never crossed its 20-day average on ≥ ${minRv}× volume inside a short-interest`);
    line(`window over this period. (With DTC held at ${dtc.toFixed(1)}, the trigger is purely price+volume.)`);
  } else {
    line(`  #  entry date    entry    stop    exit date     exit   held   return    exit reason`);
    trades.forEach((t, i) => {
      line(
        `  ${String(i + 1).padStart(2)}  ${t.entryDate}  ${t.entry.toFixed(2).padStart(7)}  ${t.invalidation.toFixed(2).padStart(6)}  ` +
        `${t.exitDate}  ${t.exit.toFixed(2).padStart(6)}  ${String(t.heldDays).padStart(3)}d  ${pct(t.netReturnPct).padStart(7)}   ${t.exitReason}`,
      );
    });
    line();
    line(`  Trades ${res.trades} · win rate ${(res.winRate * 100).toFixed(0)}% · profit factor ${res.profitFactor.toFixed(2)}`);
    line(`  Avg trade ${pct(res.avgNetReturn)} (net of friction) · SPY over same windows ${pct(res.avgSpyReturn)} · EXCESS ${pct(res.excessVsSpy)}`);
    line(`  Max drawdown on the trade curve ${res.maxDrawdownPct.toFixed(1)}%`);
  }

  // ── 5. LIVE-DECISION CARD (Treasury) on the most recent fire ─────
  if (trades.length > 0) {
    const t = trades[trades.length - 1];
    const conv = conviction("squeeze", { days_to_cover: dtc, rel_volume: minRv, si_pct_float: 0.2 });

    // Default: hypothetical account (--equity, flat, no open heat). With --profile <id> and a
    // live store, size against the REAL account — equity, peak, and open heat — exercising the
    // same portfolio-aware path the nightly scouts use (latestTreasuryState + getOpenPositions).
    let acctEquity = equity, peak = equity, heat = 0, prefs = DEFAULT_PREFS, acctLabel = `hypothetical ₹${equity.toLocaleString()}`;
    const profileId = arg("--profile");
    if (profileId && storeAvailable()) {
      const prof = (await getProfiles()).find((p) => p.id === profileId);
      if (!prof) { line(`(--profile ${profileId} not found; using hypothetical account)`); }
      else {
        const st = await latestTreasuryState(prof.id);
        const open = await getOpenPositions(prof.id);
        acctEquity = st?.equity ?? prof.equity;
        peak = st?.peak_equity ?? acctEquity;
        heat = open.reduce((a, o) => a + (Number(o.risk_budget_pct) || 0), 0);
        prefs = { ...DEFAULT_PREFS, ...(prof.risk_prefs ?? {}) };
        acctLabel = `${prof.id}: ₹${Math.round(acctEquity).toLocaleString()} equity, peak ₹${Math.round(peak).toLocaleString()}, ${(heat * 100).toFixed(1)}% open heat`;
      }
    }

    const size = sizePosition({
      equity: acctEquity, peakEquity: peak, regime, conviction: conv,
      entryPrice: t.entry, invalidationPrice: t.invalidation, currentHeatPct: heat, prefs,
    });
    rule();
    line(`LIVE DECISION on the most recent fire (${t.entryDate}) — what the desk would have told you:`);
    line(`  Conviction ${conv}/100 · entry ~${t.entry.toFixed(2)} · invalidation ${t.invalidation.toFixed(2)} · time-stop ${timeStopDate(t.entryDate, genome.exit.time_stop_days)}`);
    line(`  Account: ${acctLabel} · regime ${regime}`);
    if (size.approved) {
      line(`  Treasury: *${size.qty} shares* · ${(size.riskBudgetPct * 100).toFixed(1)}% risk · max loss ~${(size.qty * (t.entry - t.invalidation)).toFixed(0)} — ${size.reason}`);
    } else {
      line(`  Treasury: NO POSITION — ${size.reason}`);
    }
    if (!profileId) line(`  (tip: --profile sahid sizes against the real account — equity, peak & open heat)`);
  }

  // ── 6. RIGHT-NOW snapshot (secondary) ────────────────────────────
  rule();
  const snap = snapshotFeatures(bars);
  const evalNow = evaluateEntry(genome, { ...snap, days_to_cover: dtc });
  line(`RIGHT NOW (${last.date}): ${evalNow.passed ? "✅ WOULD FIRE" : "— no fire"}${evalNow.passed && !gateOpen ? " but SUPPRESSED by regime gate" : ""}`);
  line(`  today's features: ${JSON.stringify({ days_to_cover: dtc, ...snap })}`);
  if (!evalNow.passed) line(`  not met: ${evalNow.failedOn.join(", ")}  (a one-day MA cross is rare on any given day — the replay above is the real test)`);
  rule();
  line();
}

/** Trailing-window features for the latest bar (matches runSqueezeScout exactly). */
function snapshotFeatures(bars: Bar[]): Features {
  const last = bars[bars.length - 1], prev = bars[bars.length - 2];
  const closes = bars.map((b) => b.close);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const prevMa20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const vol20 = bars.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
  const relVol = vol20 > 0 ? last.volume / vol20 : 0;
  return {
    rel_volume: Math.round(relVol * 100) / 100,
    close_vs_ma20: Math.round((last.close - ma20) * 100) / 100,
    close_vs_ma20__prev: Math.round((prev.close - prevMa20) * 100) / 100,
  };
}

/** For symbols with no short interest: show the price-side of the trigger only. */
function snapshotPriceOnly(bars: Bar[], genome: GenomeDef) {
  const snap = snapshotFeatures(bars);
  const minRv = genome.entry.find((r) => r.feature === "rel_volume")?.value ?? 1.5;
  const crossed = (snap.close_vs_ma20__prev ?? 0) <= 0 && (snap.close_vs_ma20 ?? 0) > 0;
  line();
  line(`Price-side of the trigger today: 20-day MA cross-up ${crossed ? "YES" : "no"} · rel-volume ${snap.rel_volume} (need ≥ ${minRv}).`);
}

main().catch((e) => { console.error("bench failed:", e); process.exit(1); });
