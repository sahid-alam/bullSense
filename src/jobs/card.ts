/**
 * Advisor Card CLI — render the six-question card for a stock, and freeze the verdict.
 *   npx tsx src/jobs/card.ts RELIANCE.NS
 *   npx tsx src/jobs/card.ts AAPL --equity 100000 --no-freeze
 */
import { buildAdvisorCard } from "../lib/advisor.js";
import { storeAvailable, insertAdvisorCard } from "../providers/store.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env */ }

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const line = (s = "") => console.log(s);
const cur = (m: string) => (m === "NSE" ? "₹" : "$");

async function main() {
  const symbol = process.argv[2];
  if (!symbol || symbol.startsWith("--")) { line("Usage: npx tsx src/jobs/card.ts SYMBOL [--equity N] [--no-freeze]"); process.exit(1); }
  const c = await buildAdvisorCard(symbol, { equity: arg("--equity") ? Number(arg("--equity")) : undefined });

  line();
  line(`  📋 ADVISOR CARD — ${c.symbol} (${c.market} · ${c.horizon})`);
  line("─".repeat(60));
  if (!c.ok) { line(`✗ ${c.error}`); process.exit(1); }

  const V = { enter: "🟢 ENTER", watch: "🟡 WATCH", avoid: "🔴 AVOID" }[c.verdict];
  line(`1. Market:     ${c.marketRead.label}`);
  for (const f of c.marketRead.facts) if (f) line(`               · ${f}`);
  line(`2. Potential:  ${c.potential}/100`);
  for (const f of c.factors) line(`               ${f.name.padEnd(14)} ${String(f.score).padStart(3)}  ${f.note}`);
  line(`3. Verdict:    ${V}`);
  line(`4. Lot size:   ${c.suggestedQty} shares  (${(c.riskPct * 100).toFixed(1)}% risk · ${c.account})`);
  line(`               ${c.sizingNote}`);
  line(`5. Stop:       ${cur(c.market)}${c.stop.toFixed(2)}  (risk ${cur(c.market)}${(c.entry - c.stop).toFixed(2)}/sh)`);
  line(`6. Target:     ${cur(c.market)}${c.target.toFixed(2)}  (${c.riskReward}R · entry ~${cur(c.market)}${c.entry.toFixed(2)})`);
  if (c.rationale) { line(); line(`   ${c.rationale}`); }
  line();
  line(`   ⚠️  ${c.disclaimer}`);
  line("─".repeat(60));

  // Freeze the verdict (immutable receipt) unless suppressed
  if (!process.argv.includes("--no-freeze") && storeAvailable()) {
    const id = await insertAdvisorCard({
      symbol: c.symbol, market: c.market, horizon: c.horizon, as_of: c.asOf,
      potential: c.potential, verdict: c.verdict, entry: c.entry, stop: c.stop, target: c.target,
      risk_reward: c.riskReward, suggested_qty: c.suggestedQty, risk_pct: c.riskPct,
      regime: c.marketRead.label, factors: c.factors, rationale: c.rationale,
      benchmark_at_creation: c.benchmarkClose,
    });
    line(`   frozen as advisor_card #${id} (will be scored vs ${c.benchmarkName}).`);
  }
  line();
}

main().catch((e) => { console.error("card failed:", e); process.exit(1); });
