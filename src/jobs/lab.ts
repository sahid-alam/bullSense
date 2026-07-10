/**
 * The Lab v0 (monthly). Re-tunes each live genome against historical data:
 * mutate parameters → walk-forward backtest (train + held-out test) → rank →
 * propose a promotion ONLY if a variant beats the incumbent AND the benchmark
 * out-of-sample AND doesn't overfit. Otherwise: no promotion (self-healing).
 * Human approval is the final gate in v0 — the Lab proposes, it doesn't auto-swap.
 */
import { gunzipSync } from "node:zlib";
import { backtestSqueeze, type Bar, type SIRow, type SqueezeParams } from "../lib/backtest.js";
import { proposeGenomes, sensitivityFloor, type ProposedGenome } from "../lib/labgen.js";
import { storeAvailable, getLiveGenomes, getProfiles, insertGraveyard, cumulativeVariantsTested, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";

const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SECRET_KEY;
const CUT = "2024-07-01"; // walk-forward split: train < CUT, test >= CUT

async function dl(name: string): Promise<string> {
  const res = await fetch(`${SB}/storage/v1/object/lab-data/${name}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`lab data ${name}: HTTP ${res.status}`);
  return gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
}

function parsePrices(csv: string): Map<string, Bar[]> {
  const m = new Map<string, Bar[]>();
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 7) continue;
    if (!m.has(c[1])) m.set(c[1], []);
    m.get(c[1])!.push({ date: c[0], open: +c[2], high: +c[3], low: +c[4], close: +c[5], volume: +c[6] });
  }
  for (const a of m.values()) a.sort((x, y) => x.date.localeCompare(y.date));
  return m;
}
function parseSI(csv: string): SIRow[] {
  const out: SIRow[] = [];
  for (const line of csv.split("\n").slice(1)) { const c = line.split(","); if (c.length >= 5) out.push({ settlementDate: c[0], symbol: c[1], daysToCover: +c[4] }); }
  return out;
}
function parseSpy(csv: string): Bar[] {
  const out: Bar[] = [];
  for (const line of csv.split("\n").slice(1)) { const c = line.split(","); if (c.length >= 6) out.push({ date: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] }); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const started = Date.now();
  if (!storeAvailable()) { console.log("[dry-run] lab needs the store."); return; }
  if (!(await routineEnabled("lab"))) { console.log("lab: disabled/paused."); return; }

  const squeeze = (await getLiveGenomes("squeeze"))[0];
  if (!squeeze) { console.log("lab: no live squeeze genome."); return; }

  console.log("lab: downloading historical bundle (full universe, 2 parts)…");
  const [pA, pB, sCsv, spyCsv] = await Promise.all([dl("prices_lab_a.csv.gz"), dl("prices_lab_b.csv.gz"), dl("si_candidates_clean.csv.gz"), dl("spy_prices.csv.gz")]);
  const prices = parsePrices(pA);
  for (const [sym, bars] of parsePrices(pB)) prices.set(sym, bars); // merge part B
  const si = parseSI(sCsv), spy = parseSpy(spyCsv);
  const siTrain = si.filter((r) => r.settlementDate < CUT), siTest = si.filter((r) => r.settlementDate >= CUT);

  // incumbent from the live genome
  const def = squeeze.definition;
  const dtc = def.entry.find((e: any) => e.feature === "days_to_cover")?.value ?? 5;
  const rv = def.entry.find((e: any) => e.feature === "rel_volume")?.value ?? 1.5;
  const incumbent: SqueezeParams = { minDaysToCover: dtc, minRelVolume: rv, invalidationPct: 0.10, timeStopDays: 30 };
  const incTr = backtestSqueeze(incumbent, siTrain, prices, spy), incTe = backtestSqueeze(incumbent, siTest, prices, spy);

  // --- candidates: parameter grid + LLM-INVENTED genomes (Lab v1) ---
  const gridVariants: SqueezeParams[] = [];
  for (const d of [4, 5, 6, 8, 10]) for (const r of [1.3, 1.5, 2.0]) for (const inv of [0.08, 0.10, 0.12])
    gridVariants.push({ minDaysToCover: d, minRelVolume: r, invalidationPct: inv, timeStopDays: 30 });

  const context = `Incumbent squeeze genome: dtc>=${incumbent.minDaysToCover}, relVol>=${incumbent.minRelVolume}, invalidation ${(incumbent.invalidationPct * 100).toFixed(0)}%. ` +
    `Its held-out test profit factor is ${incTe.profitFactor.toFixed(2)} with excess-vs-SPY ${incTe.excessVsSpy.toFixed(2)}% over ${incTe.trades} trades — it does NOT clearly beat buy-and-hold. ` +
    `Design 6 genomes that might find a real edge where it doesn't.`;
  let proposed: ProposedGenome[] = [];
  try { proposed = await proposeGenomes(context); } catch (e) { console.error("genome proposal failed (non-fatal):", e); }
  console.log(`lab: ${gridVariants.length} grid + ${proposed.length} LLM-invented candidates`);

  const gridScored = gridVariants.map((p) => ({ p, rationale: "parameter mutation", tr: backtestSqueeze(p, siTrain, prices, spy), te: backtestSqueeze(p, siTest, prices, spy) }));
  const genScored = proposed.map((g) => ({ p: g.params, rationale: g.rationale, tr: backtestSqueeze(g.params, siTrain, prices, spy), te: backtestSqueeze(g.params, siTest, prices, spy) }));
  const scored = [...gridScored, ...genScored].filter((x) => x.tr.trades >= 100 && x.te.trades >= 100);

  // multiple-testing haircut: the more variants ever tested, the higher the bar the
  // best-by-chance must clear (deflated expectation). Grows slowly with log(total).
  const everTested = (await cumulativeVariantsTested()) + scored.length;
  const haircut = 0.15 + 0.03 * Math.log10(Math.max(10, everTested));

  // promotion: beats incumbent test-PF by the (haircut) margin, beats SPY out-of-sample,
  // doesn't overfit (test ≥75% of train), AND survives the sensitivity gauntlet.
  const passers = scored.filter((x) =>
    x.te.profitFactor >= incTe.profitFactor + haircut &&
    x.te.excessVsSpy > 1.0 &&
    x.te.profitFactor >= x.tr.profitFactor * 0.75,
  ).sort((a, b) => b.te.profitFactor - a.te.profitFactor);

  // gauntlet: parameter-sensitivity — a real edge survives ±20% perturbation
  let best: typeof passers[0] | null = null;
  for (const cand of passers) {
    const floor = sensitivityFloor(cand.p, siTest, prices, spy);
    if (floor >= incTe.profitFactor) { best = cand; break; }
    await insertGraveyard({ family: "squeeze", params: cand.p, rationale: cand.rationale, cause_of_death: "fragile", train_pf: cand.tr.profitFactor, test_pf: cand.te.profitFactor, test_excess_spy: cand.te.excessVsSpy });
  }

  // bury the LLM-invented genomes that failed outright (with their thesis + cause) —
  // the public record of ideas that didn't survive contact with the data.
  for (const g of genScored) {
    if (g === best) continue;
    if (g.te.trades < 100) { await insertGraveyard({ family: "squeeze", params: g.p, rationale: g.rationale, cause_of_death: "too_few_trades", train_pf: g.tr.profitFactor, test_pf: g.te.profitFactor, test_excess_spy: g.te.excessVsSpy }); continue; }
    if (g.te.profitFactor < g.tr.profitFactor * 0.75) { await insertGraveyard({ family: "squeeze", params: g.p, rationale: g.rationale, cause_of_death: "overfit", train_pf: g.tr.profitFactor, test_pf: g.te.profitFactor, test_excess_spy: g.te.excessVsSpy }); continue; }
    if (g.te.excessVsSpy <= 1.0) { await insertGraveyard({ family: "squeeze", params: g.p, rationale: g.rationale, cause_of_death: "lost_to_spy", train_pf: g.tr.profitFactor, test_pf: g.te.profitFactor, test_excess_spy: g.te.excessVsSpy }); }
  }

  const verdict = best ? "promotion_proposed" : "no_promotion";
  const detail = best
    ? `Proposed: dtc>=${best.p.minDaysToCover} rv>=${best.p.minRelVolume} inv=${(best.p.invalidationPct * 100).toFixed(0)}%${best.p.requireAbove50ma ? " +trend" : ""} — test PF ${best.te.profitFactor.toFixed(2)} vs incumbent ${incTe.profitFactor.toFixed(2)}, excess vs SPY +${best.te.excessVsSpy.toFixed(2)}%, survived ±20% sensitivity. Rationale: ${best.rationale}`
    : `No candidate (${scored.length} tested, ${genScored.length} LLM-invented) beat the incumbent AND the benchmark out-of-sample and survived the gauntlet. Incumbent test PF ${incTe.profitFactor.toFixed(2)}, excess vs SPY ${incTe.excessVsSpy.toFixed(2)}%. Genome unchanged; failed ideas retired to the graveyard.`;

  // persist experiment
  await fetch(`${SB}/rest/v1/lab_experiments`, {
    method: "POST", headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify([{
      family: "squeeze", n_variants: scored.length, verdict, detail,
      incumbent: { params: incumbent, train: incTr, test: incTe },
      best_candidate: best ? { params: best.p, train: best.tr, test: best.te } : null,
    }]),
  });

  // notify operators
  const msg = [
    `🧪 *Lab — squeeze re-tune*`,
    ``,
    `Tested ${scored.length} candidates (${genScored.length} LLM-invented) — grid + invented genomes, walk-forward + ±20% sensitivity gauntlet.`,
    verdict === "promotion_proposed" ? `✅ *Promotion proposed:* ${detail}` : `↔️ *No promotion.* ${detail}`,
    ``,
    `_The Lab invents, tests, and buries what fails — you approve promotions. It won't chase a curve-fit that dies out-of-sample._`,
  ].join("\n");
  const seen = new Set<string>();
  for (const p of await getProfiles()) { if (p.telegram_chat_id && !seen.has(p.telegram_chat_id)) { seen.add(p.telegram_chat_id); await sendTelegram(p.telegram_chat_id, msg); } }

  const asOf = new Date().toISOString().slice(0, 10);
  await logJobRun("lab", asOf, "ok", started, { verdict, n_variants: scored.length, incTe });
  await touchRoutine("lab", `${verdict} · ${scored.length} variants · incumbent test PF ${incTe.profitFactor.toFixed(2)}`);
  console.log("lab:", verdict, "-", detail);
}

main().catch((e) => { console.error("lab job failed:", e); process.exit(1); });
