/**
 * Lab v1 — genome invention + gauntlet.
 * The LLM proposes NEW genome hypotheses across the fuller design space (not just
 * threshold tweaks), each with an economic rationale. Survivors face a stronger
 * anti-overfitting gauntlet; failures are retired to the graveyard with a cause of death.
 */
import { completeJson } from "../providers/llm.js";
import { backtestSqueeze, type SqueezeParams, type SIRow, type Bar, type BacktestResult } from "./backtest.js";

export interface ProposedGenome { params: SqueezeParams; rationale: string }

/** Ask the LLM to invent squeeze-family genomes across the design space, with reasons. */
export async function proposeGenomes(context: string): Promise<ProposedGenome[]> {
  const out = await completeJson(
    `You are a quant strategy designer. Invent 6 DISTINCT short-squeeze entry genomes to backtest. Each is a JSON object of parameters plus a one-sentence economic rationale for why that combination might have an edge. Vary the DESIGN, not just thresholds — use the optional filters to express different theses (e.g. "only squeezes already in an uptrend", "fade over-extended pops", "extreme short interest only").
Return JSON: { "genomes": [ { "minDaysToCover": number(4-15), "minRelVolume": number(1.2-3), "invalidationPct": number(0.06-0.15), "timeStopDays": 30, "requireAbove50ma": boolean (optional), "minMomentum20": number (optional, %), "maxMomentum20": number (optional, %), "rationale": string } ] }
Make the 6 genuinely different in thesis. Keep timeStopDays at 30.`,
    context, 1400,
  );
  const genomes = out?.genomes;
  if (!Array.isArray(genomes)) return [];
  return genomes.slice(0, 6).map((g: any) => ({
    rationale: String(g.rationale ?? "").slice(0, 200),
    params: {
      minDaysToCover: clamp(g.minDaysToCover, 4, 15, 6),
      minRelVolume: clamp(g.minRelVolume, 1.2, 3, 1.5),
      invalidationPct: clamp(g.invalidationPct, 0.06, 0.15, 0.10),
      timeStopDays: 30,
      requireAbove50ma: g.requireAbove50ma === true ? true : undefined,
      minMomentum20: typeof g.minMomentum20 === "number" ? g.minMomentum20 : undefined,
      maxMomentum20: typeof g.maxMomentum20 === "number" ? g.maxMomentum20 : undefined,
    },
  }));
}

/** Parameter-sensitivity gauntlet: perturb thresholds ±20%; a real edge must survive.
 *  Returns the WORST test-PF among perturbations — if that's still strong, it's robust. */
export function sensitivityFloor(
  p: SqueezeParams, siTest: SIRow[], prices: Map<string, Bar[]>, spy: Bar[],
): number {
  const perturbs: SqueezeParams[] = [
    { ...p, minDaysToCover: p.minDaysToCover * 1.2 },
    { ...p, minDaysToCover: p.minDaysToCover * 0.8 },
    { ...p, minRelVolume: p.minRelVolume * 1.2 },
    { ...p, minRelVolume: p.minRelVolume * 0.8 },
    { ...p, invalidationPct: Math.min(0.15, p.invalidationPct * 1.2) },
    { ...p, invalidationPct: Math.max(0.06, p.invalidationPct * 0.8) },
  ];
  let worst = Infinity;
  for (const pp of perturbs) {
    const r = backtestSqueeze(pp, siTest, prices, spy);
    if (r.trades >= 60) worst = Math.min(worst, r.profitFactor);
  }
  return worst === Infinity ? 0 : worst;
}

function clamp(v: any, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
