/**
 * Advisor Card (A1) — answers the six-question contract for ANY stock, US or NSE:
 *   market read · potential · enter/avoid · lot size · stop · target.
 *
 * HONESTY (non-negotiable): the potential score + verdict are an INTERIM HEURISTIC — a
 * hand-authored formula with NO backtest and NO calibration yet. It is deliberately NOT
 * gauntlet-validated alpha (that is A2's job). So every verdict is frozen (advisor_cards)
 * and will be scored vs the benchmark, exactly like a signal — that is how we learn whether
 * this read predicts anything. The LLM only narrates the fixed numbers; it never decides.
 */
import { fetchDailyBars, latestClose, type Bar } from "../providers/prices.js";
import { getLatestRegime, nseDeliveryTrend, nseFnoLatest, storeAvailable, unmarkedAdvisorCards, markAdvisorCard } from "../providers/store.js";
import { sizePosition, type Regime, type RiskPrefs } from "./treasury.js";
import { DEFAULT_PREFS } from "./benchcore.js";
import { complete } from "../providers/llm.js";

export interface Factor { name: string; score: number; note: string }
export interface AdvisorCard {
  symbol: string; market: "US" | "NSE"; horizon: "invest"; asOf: string;
  ok: boolean; error?: string;
  marketRead: { label: string; facts: string[]; cautious: boolean };
  potential: number; verdict: "enter" | "watch" | "avoid"; factors: Factor[];
  entry: number; stop: number; target: number; riskReward: number;
  suggestedQty: number; riskPct: number; account: string; sizingNote: string;
  rationale: string | null;
  benchmarkClose: number | null; benchmarkName: string;
  disclaimer: string;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const sma = (c: number[], n: number) => c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null;
const cur = (sym: string) => (sym.endsWith(".NS") ? "₹" : "$");

export async function buildAdvisorCard(symbol: string, opts: { equity?: number; prefs?: RiskPrefs; profileId?: string } = {}): Promise<AdvisorCard> {
  const sym = symbol.toUpperCase();
  const isNSE = sym.endsWith(".NS");
  const market = isNSE ? "NSE" : "US";
  const equity = opts.equity ?? 100_000;
  const prefs = opts.prefs ?? DEFAULT_PREFS;
  const disclaimer =
    "Interim heuristic — this potential score and verdict are a hand-authored formula, NOT yet backtested or calibrated. " +
    "The verdict is frozen and will be scored vs the benchmark so we learn if it predicts. Treat as a starting read, not validated advice.";

  const base = (extra: Partial<AdvisorCard>): AdvisorCard => ({
    symbol: sym, market, horizon: "invest", asOf: new Date().toISOString().slice(0, 10),
    ok: true, marketRead: { label: "", facts: [], cautious: false }, potential: 0, verdict: "avoid",
    factors: [], entry: 0, stop: 0, target: 0, riskReward: 0, suggestedQty: 0, riskPct: 0,
    account: "", sizingNote: "", rationale: null, benchmarkClose: null, benchmarkName: isNSE ? "NIFTY" : "SPY",
    disclaimer, ...extra,
  });

  let bars: Bar[];
  try { bars = await fetchDailyBars(sym, "3y"); }
  catch (e) { return base({ ok: false, error: `could not fetch prices: ${e}` }); }
  if (bars.length < 60) return base({ ok: false, error: `only ${bars.length} bars — not enough history (check the ticker)` });

  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const close = last.close;
  const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  const hi52 = Math.max(...closes.slice(-252)), lo52 = Math.min(...closes.slice(-252));
  const ret3m = closes.length > 63 ? (close / closes[closes.length - 64] - 1) * 100 : 0;
  const ret6m = closes.length > 126 ? (close / closes[closes.length - 127] - 1) * 100 : 0;
  const low20 = Math.min(...bars.slice(-20).map((b) => b.low));
  const vol20 = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
  const relVol = vol20 > 0 ? last.volume / vol20 : 1;

  // ── Q1: market read ──────────────────────────────────────────────
  let regime: Regime = "neutral";
  const marketRead = { label: "", facts: [] as string[], cautious: false };
  let benchmarkClose: number | null = null;
  if (isNSE) {
    // indiaRadar v0 — raw facts only, NOT a published regime label (A2 builds the real India Radar)
    try {
      const [nifty, vix] = await Promise.all([fetchDailyBars("^NSEI", "1y"), fetchDailyBars("^INDIAVIX", "1y")]);
      const nc = nifty.map((b) => b.close), n50 = sma(nc, 50);
      benchmarkClose = nc[nc.length - 1];
      const vixLast = vix[vix.length - 1].close;
      const niftyUp = n50 != null && nc[nc.length - 1] > n50;
      const vixCalm = vixLast < 15, vixHigh = vixLast > 22;
      marketRead.facts.push(`NIFTY ${niftyUp ? "above" : "below"} its 50-day average`);
      marketRead.facts.push(`India VIX ${vixLast.toFixed(1)} (${vixCalm ? "calm" : vixHigh ? "elevated" : "moderate"})`);
      marketRead.cautious = !niftyUp || vixHigh;
      marketRead.label = `India (indiaRadar v0) — ${marketRead.cautious ? "cautious" : "constructive"}`;
      regime = vixHigh ? "risk_off" : niftyUp ? "risk_on" : "neutral";
    } catch { marketRead.label = "India (market read unavailable)"; }
  } else {
    if (storeAvailable()) {
      const r = await getLatestRegime();
      if (r) {
        regime = r.regime as Regime;
        marketRead.label = `US — ${r.regime.replace("_", "-").toUpperCase()} (Radar ${r.score}/100)`;
        marketRead.facts.push(r.narrative ?? "");
        marketRead.cautious = r.regime === "risk_off";
      }
    }
    try { const spy = await fetchDailyBars("SPY", "1mo" as any); benchmarkClose = spy[spy.length - 1]?.close ?? null; } catch { /* best-effort */ }
    if (!marketRead.label) marketRead.label = "US — regime unavailable";
  }

  // ── Q2: potential score — transparent, deterministic components (each 0-100) ──
  const factors: Factor[] = [];
  // Trend
  let trend = 50;
  if (sma50 != null && sma200 != null) trend = (close > sma50 ? 50 : 0) + (close > sma200 ? 50 : 0);
  else if (sma50 != null) trend = close > sma50 ? 75 : 25;
  factors.push({ name: "Trend", score: trend, note: sma200 != null ? `price ${close > (sma50 ?? 0) ? ">" : "<"} 50DMA, ${close > sma200 ? ">" : "<"} 200DMA` : "price vs 50DMA (short history)" });
  // Momentum (3m + 6m blend; +25% ≈ full marks)
  const momentum = clamp(50 + (ret3m + ret6m) / 2 * 2);
  factors.push({ name: "Momentum", score: Math.round(momentum), note: `3m ${ret3m >= 0 ? "+" : ""}${ret3m.toFixed(0)}% · 6m ${ret6m >= 0 ? "+" : ""}${ret6m.toFixed(0)}%` });
  // Structure — position in the 52-week range, penalize gap-extension above 50DMA
  const rangePos = hi52 > lo52 ? ((close - lo52) / (hi52 - lo52)) * 100 : 50;
  const extended = sma50 != null && close > sma50 * 1.25;
  const structure = clamp(rangePos - (extended ? 25 : 0));
  factors.push({ name: "Structure", score: Math.round(structure), note: `${Math.round(rangePos)}% of 52w range${extended ? " · extended >25% above 50DMA" : ""}` });
  // Participation — relative volume; NSE adds delivery-% trend (accumulation)
  let participation = clamp(40 + (relVol - 1) * 40);
  let partNote = `rel-volume ${relVol.toFixed(1)}×`;
  let deliveryUp = false;
  if (isNSE) {
    const dt = await nseDeliveryTrend(sym.replace(/\.NS$/, ""));
    if (dt) {
      deliveryUp = dt.recent > dt.base;
      participation = clamp((participation + (deliveryUp ? 70 : 35)) / 2);
      partNote += ` · delivery ${dt.recent.toFixed(0)}% (${deliveryUp ? "rising ↑ accumulation" : "flat/soft"})`;
    }
  }
  factors.push({ name: "Participation", score: Math.round(participation), note: partNote });

  const potential = Math.round(0.30 * trend + 0.30 * momentum + 0.20 * structure + 0.20 * participation);

  // ── Q3: verdict — deterministic (regime gate + extension guard) ──
  let verdict: AdvisorCard["verdict"];
  if (regime === "risk_off" && potential < 75) verdict = "watch"; // defensive market caps enthusiasm
  else if (potential >= 65 && !extended) verdict = "enter";
  else if (potential < 45) verdict = "avoid";
  else verdict = "watch";

  // ── Q5/Q6: stop & target (deterministic) ──
  const stop = Math.max(low20, close * 0.90);           // recent support, floored at −10%
  const risk = close - stop;
  const target = close + 2 * risk;                       // 2R
  const riskReward = 2;

  // ── Q4: lot size (Treasury) ──
  const sized = sizePosition({ equity, peakEquity: equity, regime, conviction: potential, entryPrice: close, invalidationPrice: stop, currentHeatPct: 0, prefs });
  const account = opts.profileId ? `${opts.profileId}` : `hypothetical ${cur(sym)}${equity.toLocaleString()}`;

  // ── narration — LLM writes prose around the FIXED numbers, decides nothing ──
  let rationale: string | null = null;
  try {
    rationale = await complete(
      "routine",
      "You are BullSense's advisor. You are given a stock's computed facts and a FIXED verdict/score. Write 2-3 plain sentences explaining the read — the trend, the one strongest point, and the one biggest risk. Do NOT change the verdict or invent numbers. No preamble, no disclaimers.",
      `${sym} (${market}). Verdict ${verdict.toUpperCase()}, potential ${potential}/100. ` +
      `Trend ${factors[0].note}. Momentum ${factors[1].note}. Structure ${factors[2].note}. Participation ${factors[3].note}. ` +
      `Market: ${marketRead.label}. Entry ~${close.toFixed(2)}, stop ${stop.toFixed(2)}, target ${target.toFixed(2)} (2R).`,
      220,
    );
  } catch { /* narration is best-effort */ }

  return base({
    ok: true, marketRead, potential, verdict, factors,
    entry: close, stop, target, riskReward,
    suggestedQty: sized.qty, riskPct: sized.riskBudgetPct, account,
    sizingNote: sized.approved ? sized.reason : `no position — ${sized.reason}`,
    rationale, benchmarkClose,
  });
}

/**
 * Score frozen advisor cards whose forward window has elapsed (calibration). This is what
 * makes the freeze meaningful: after ~3 weeks we start learning whether the potential score
 * actually predicts forward returns vs the benchmark. Runs from nightly.
 */
export async function markCards(minAgeDays = 21): Promise<{ marked: number }> {
  const cards = await unmarkedAdvisorCards(minAgeDays);
  let marked = 0;
  const benchCache = new Map<string, number | null>();
  for (const c of cards) {
    try {
      const cur = (await latestClose(c.symbol)).close;
      const forward = (cur / c.entry - 1) * 100;
      const benchSym = c.market === "NSE" ? "^NSEI" : "SPY";
      if (!benchCache.has(benchSym)) { try { benchCache.set(benchSym, (await latestClose(benchSym)).close); } catch { benchCache.set(benchSym, null); } }
      const curBench = benchCache.get(benchSym) ?? null;
      const benchRet = curBench != null && c.benchmark_at_creation ? (curBench / c.benchmark_at_creation - 1) * 100 : null;
      const outcome = benchRet != null ? (forward > benchRet ? "beat" : "lag") : (forward > 0 ? "up" : "down");
      await markAdvisorCard(c.id, { forward_return_pct: Math.round(forward * 100) / 100, benchmark_return_pct: benchRet != null ? Math.round(benchRet * 100) / 100 : null, outcome });
      marked++;
    } catch (e) { console.error("markCards: failed for", c.symbol, e); }
  }
  return { marked };
}
