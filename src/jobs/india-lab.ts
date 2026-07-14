/**
 * India Lab (CLI, A2) — runs the India-native signal-family backtest machinery against the
 * real archive and reports HONEST results. Not scheduled: unlike job:lab (which re-tunes LIVE
 * genomes), there are no live India genomes to re-tune — the archive isn't deep enough yet for
 * a promotion to mean anything (see indiaBacktest.ts's header). This is a manually-run research
 * tool, exactly the role bench.ts plays for the US engine before anything goes live.
 *
 *   npx tsx src/jobs/india-lab.ts delivery-surge
 *   npx tsx src/jobs/india-lab.ts momentum-breakout
 */
import { fetchDailyBars } from "../providers/prices.js";
import { nseFnoUniverse, nseEquityBarsForUniverse, storeAvailable, insertGraveyard } from "../providers/store.js";
import { backtestDeliverySurge, backtestMomentumBreakout, type NseBar } from "../lib/indiaBacktest.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env directly */ }

const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(64));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;

async function main() {
  const family = process.argv[2];
  if (!family || !["delivery-surge", "momentum-breakout"].includes(family)) {
    line("Usage: npx tsx src/jobs/india-lab.ts delivery-surge|momentum-breakout");
    process.exit(1);
  }
  if (!storeAvailable()) { line("[dry-run] India Lab needs the store (SUPABASE_URL / SUPABASE_SECRET_KEY)."); return; }

  line();
  line(`  ⚙️  INDIA LAB — ${family}`);
  rule();

  const universeSymbols = await nseFnoUniverse();
  const [universe, niftyBars] = await Promise.all([
    nseEquityBarsForUniverse(universeSymbols),
    fetchDailyBars("^NSEI", "1y"),
  ]);
  const nifty: NseBar[] = niftyBars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, deliveryPct: null }));

  const totalDays = Math.max(...[...universe.values()].map((b) => b.length), 0);
  line(`Universe: ${universe.size} F&O-eligible symbols, up to ${totalDays} archived trading days each.`);
  line(`⚠️  The Lab's real gauntlet needs ~100 trades per walk-forward window for a promotion to`);
  line(`   mean anything — this archive is nowhere near that yet. Numbers below are informational.`);
  rule();

  const r = family === "delivery-surge"
    ? backtestDeliverySurge({ invalidationPct: 0.08, timeStopDays: 15, minRelVolume: 1.3, minSurgeRatio: 1.5 }, universe, nifty)
    : backtestMomentumBreakout({ invalidationPct: 0.08, timeStopDays: 15, minRelVolume: 1.3, minMomentum20: 8 }, universe, nifty);

  if (r.trades === 0) {
    line("No trades triggered — either the archive is too shallow yet, or the genome's thresholds never fired in this window.");
    rule();
    return;
  }

  line(`Trades: ${r.trades} · Win rate: ${(r.winRate * 100).toFixed(0)}%`);
  line(`Profit factor (net of REAL India friction — STT/exchange/SEBI/stamp/DP/GST/tax): ${r.profitFactor.toFixed(2)}`);
  line(`Avg net return/trade: ${pct(r.avgNetReturnPct)} · Avg NIFTY over same windows: ${pct(r.avgNiftyReturnPct)}`);
  line(`Excess vs NIFTY: ${pct(r.excessVsNifty)} · Max drawdown (equal-weight curve): ${r.maxDrawdownPct.toFixed(1)}%`);
  rule();
  const bar = 1.3;
  if (r.trades < 30) {
    line(`Verdict: NOT ENOUGH TRADES (${r.trades} < 30) to judge — the exit bar (PF ≥ ${bar} over 30 closed signals) needs more archive history. Not promoted. Not graveyarded — this is a data-sufficiency gap, not a tested failure.`);
  } else if (r.profitFactor >= bar) {
    line(`Verdict: cleared the raw PF bar (${r.profitFactor.toFixed(2)} ≥ ${bar}) on ${r.trades} trades — but this is still ONE in-sample run, not an out-of-sample walk-forward. Do NOT treat as promoted; route through the same walk-forward + multiple-testing discipline as the US Lab before it ever touches a signal.`);
  } else {
    line(`Verdict: PF ${r.profitFactor.toFixed(2)} < ${bar} bar on ${r.trades} real trades. Honest result — not promoted. Recording to the graveyard.`);
    await insertGraveyard({
      family: `india-${family}`, params: { note: "single in-sample run, no train/test split yet — archive too shallow for a walk-forward" },
      rationale: `India Lab CLI run over ${universe.size} F&O-eligible symbols, ${totalDays} archived days.`,
      cause_of_death: "in_sample_below_bar",
      train_pf: r.profitFactor, test_pf: r.profitFactor, test_excess_spy: r.excessVsNifty,
    });
  }
  line();
}

main().catch((e) => { console.error("india-lab failed:", e); process.exit(1); });
