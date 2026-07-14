/**
 * Engine Bench (CLI) — a THIN renderer over runBench() in src/lib/benchcore.ts.
 * All engine logic lives in the core; this file only parses argv and prints. The
 * dashboard's server action calls the same runBench(), so CLI and web can't drift.
 *
 *   npx tsx src/jobs/bench.ts GME
 *   npx tsx src/jobs/bench.ts GME --dtc 7 --equity 100000 --years 3 --profile sahid
 *   npx tsx src/jobs/bench.ts CUPID.NS --dtc 6        (NSE: SI is US-only — pass --dtc to test the logic)
 */
import { runBench } from "../lib/benchcore.js";

// Load .env so a local run reads the LIVE engine state (regime, genome, account, SI archive)
// from Supabase. In CI the env is injected directly and there is no .env file — hence the catch.
try { process.loadEnvFile(".env"); } catch { /* no .env file — env already set (CI) */ }

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(64));

async function main() {
  const symbol = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "");
  if (!symbol) { line("Usage: npx tsx src/jobs/bench.ts SYMBOL [--dtc N] [--equity N] [--years N] [--profile id]"); process.exit(1); }

  const r = await runBench({
    symbol,
    dtc: arg("--dtc") !== undefined ? Number(arg("--dtc")) : undefined,
    equity: arg("--equity") !== undefined ? Number(arg("--equity")) : undefined,
    years: arg("--years") !== undefined ? Number(arg("--years")) : undefined,
    profileId: arg("--profile"),
    allowLiveSI: true, // CLI can afford the slow live FINRA fallback; the web action cannot
  });

  line();
  line(`  ⚙️  BULLSENSE ENGINE BENCH — ${r.symbol}`);
  rule();
  if (!r.ok) { line(`✗ ${r.error}`); process.exit(1); }

  if (r.priceMeta) line(`Price history: ${r.priceMeta.sessions} sessions, ${r.priceMeta.from} → ${r.priceMeta.to}. Last close ${r.priceMeta.lastClose.toFixed(2)}.`);
  if (r.regime) line(`Market regime: ${r.regime.label}. Squeeze gate: ${r.regime.gateOpen ? "OPEN ✓" : "CLOSED ✗ (would fire but be SUPPRESSED live)"}`);

  // No short interest → honest boundary, price-only snapshot, done.
  if (!r.dtc) {
    rule();
    for (const n of r.notes) line(`⚠️  ${n}`);
    if (r.rightNow) line(`\nPrice-side today: 20-day MA cross-up ${r.rightNow.features.close_vs_ma20__prev <= 0 && r.rightNow.features.close_vs_ma20 > 0 ? "YES" : "no"} · rel-volume ${r.rightNow.features.rel_volume}.`);
    rule();
    line(`Verdict: engine has no short-interest data for ${r.symbol} → no signal. (US tickers only.)`);
    line();
    return;
  }

  line(`Days-to-cover: ${r.dtc.value.toFixed(1)} — ${r.dtc.source}.`);

  // Replay
  if (r.replay) {
    rule();
    line(`HISTORICAL REPLAY — every day the engine would have fired`);
    line(`(entry: days-to-cover ≥ ${r.replay.minDtc}, 20-day MA cross-up, rel-volume ≥ ${r.replay.minRelVol})`);
    line();
    const t = r.replay.trades;
    if (t.length === 0) {
      line(`No fires: the price never crossed its 20-day average on ≥ ${r.replay.minRelVol}× volume inside a short-interest window over this period.`);
    } else {
      line(`  #  entry date    entry    stop    exit date     exit   held   return    exit reason`);
      t.forEach((x, i) => line(
        `  ${String(i + 1).padStart(2)}  ${x.entryDate}  ${x.entry.toFixed(2).padStart(7)}  ${x.invalidation.toFixed(2).padStart(6)}  ` +
        `${x.exitDate}  ${x.exit.toFixed(2).padStart(6)}  ${String(x.heldDays).padStart(3)}d  ${pct(x.netReturnPct).padStart(7)}   ${x.exitReason}`,
      ));
      const s = r.replay.stats;
      line();
      line(`  Trades ${s.trades} · win rate ${(s.winRate * 100).toFixed(0)}% · profit factor ${s.profitFactor.toFixed(2)}`);
      line(`  Avg trade ${pct(s.avgNetReturn)} (net of friction) · SPY over same windows ${pct(s.avgSpyReturn)} · EXCESS ${pct(s.excessVsSpy)}`);
      line(`  Max drawdown on the trade curve ${s.maxDrawdownPct.toFixed(1)}%`);
    }
  }

  // Live decision
  if (r.liveDecision) {
    const d = r.liveDecision;
    rule();
    line(`LIVE DECISION on the most recent fire (${d.entryDate}) — what the desk would have told you:`);
    line(`  Conviction ${d.conviction}/100 · entry ~${d.entry.toFixed(2)} · invalidation ${d.invalidation.toFixed(2)} · time-stop ${d.timeStop}`);
    line(`  Account: ${d.account} · regime ${r.regime?.regime}`);
    if (d.sized.approved) line(`  Treasury: *${d.sized.qty} shares* · ${(d.sized.riskBudgetPct * 100).toFixed(1)}% risk · max loss ~${d.maxLoss.toFixed(0)} — ${d.sized.reason}`);
    else line(`  Treasury: NO POSITION — ${d.sized.reason}`);
    if (!arg("--profile")) line(`  (tip: --profile sahid sizes against the real account — equity, peak & open heat)`);
  }

  // Right now
  if (r.rightNow) {
    rule();
    line(`RIGHT NOW (${r.priceMeta?.to}): ${r.rightNow.fires ? "✅ WOULD FIRE" : "— no fire"}${r.rightNow.suppressed ? " but SUPPRESSED by regime gate" : ""}`);
    line(`  today's features: ${JSON.stringify(r.rightNow.features)}`);
    if (!r.rightNow.fires) line(`  not met: ${r.rightNow.failedOn.join(", ")}  (a one-day MA cross is rare on any given day — the replay above is the real test)`);
  }
  // assumption footnote
  const assumption = r.notes.find((n) => n.includes("held constant"));
  if (assumption) { rule(); line(`Note: ${assumption}`); }
  rule();
  line();
}

main().catch((e) => { console.error("bench failed:", e); process.exit(1); });
