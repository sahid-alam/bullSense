/**
 * Generic genome evaluator (FINAL.md §Lab: "strategies are data, not code").
 * One engine runs any genome. Entry rules are declarative; features are computed
 * upstream and passed in. This is what lets the Lab later WRITE new genomes as JSON
 * without touching this code.
 */

export interface EntryRule {
  feature: string;
  op: ">=" | "<=" | ">" | "<" | "==" | "cross_above" | "cross_below";
  value?: number;
}

export interface GenomeDef {
  universe_extra?: { mcap_max?: number; mcap_min?: number };
  entry: EntryRule[];
  regime_gate: string[];       // regimes in which this genome may fire live
  dedupe_days: number;
  exit: { invalidation: string; time_stop_days: number };
  conviction?: string;         // optional formula string; we use a structured fallback
}

/** Feature bag for one symbol at evaluation time. `${feature}__prev` supplies the
 *  prior value for cross_above / cross_below rules. */
export type Features = Record<string, number | undefined>;

export interface EvalResult {
  passed: boolean;
  failedOn: string[];
  evidence: Record<string, number>;
}

export function evaluateEntry(def: GenomeDef, f: Features): EvalResult {
  const failedOn: string[] = [];
  const evidence: Record<string, number> = {};

  for (const rule of def.entry) {
    const v = f[rule.feature];
    if (v !== undefined) evidence[rule.feature] = round2(v);

    if (v === undefined) { failedOn.push(`${rule.feature}:missing`); continue; }

    let ok = false;
    switch (rule.op) {
      case ">=": ok = v >= (rule.value ?? 0); break;
      case "<=": ok = v <= (rule.value ?? 0); break;
      case ">":  ok = v >  (rule.value ?? 0); break;
      case "<":  ok = v <  (rule.value ?? 0); break;
      case "==": ok = v === (rule.value ?? 0); break;
      case "cross_above": {
        const prev = f[`${rule.feature}__prev`];
        ok = prev !== undefined && prev <= 0 && v > 0; // feature encoded as (close - ma)
        break;
      }
      case "cross_below": {
        const prev = f[`${rule.feature}__prev`];
        ok = prev !== undefined && prev >= 0 && v < 0;
        break;
      }
    }
    if (!ok) failedOn.push(`${rule.feature}${rule.op}${rule.value ?? ""}`);
  }

  return { passed: failedOn.length === 0, failedOn, evidence };
}

/**
 * Conviction 0–100. Structured, transparent scoring per family — how far each
 * qualifying feature clears its threshold, not a black box. (Matches SCOPE.md formulas.)
 */
export function conviction(family: string, f: Features): number {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  if (family === "hype") {
    const vel = f["mention_velocity"] ?? 3;
    const bull = f["bullish_ratio"] ?? 0.6;
    const rv = f["rel_volume"] ?? 2;
    return round0(40 + 20 * clamp01(vel / 6) + 20 * clamp01((bull - 0.6) / 0.4) + 20 * clamp01(rv / 5));
  }
  if (family === "squeeze") {
    const si = f["si_pct_float"] ?? 0.2;
    const dtc = f["days_to_cover"] ?? 4;
    const rv = f["rel_volume"] ?? 1.5;
    return round0(35 + 25 * clamp01((si - 0.2) / 0.2) + 20 * clamp01((dtc - 4) / 6) + 20 * clamp01(rv / 4));
  }
  return 50;
}

/** Compute invalidation price from the exit rule + context (entry, recent lows). */
export function invalidationPrice(exit: GenomeDef["exit"], ctx: { entry: number; triggerDayLow?: number; low20?: number }): number {
  const rule = exit.invalidation;
  if (rule.includes("trigger_day_low")) {
    const pct = ctx.entry * 0.92; // -8%
    return Math.max(ctx.triggerDayLow ?? pct, pct);
  }
  if (rule.includes("low_20d")) {
    const pct = ctx.entry * 0.90; // -10%
    return Math.max(ctx.low20 ?? pct, pct);
  }
  return ctx.entry * 0.90;
}

export function timeStopDate(fromIso: string, days: number): string {
  const d = new Date(fromIso);
  let added = 0;
  while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() >= 1 && d.getDay() <= 5) added++; }
  return d.toISOString().slice(0, 10);
}

const round0 = (x: number) => Math.round(x);
const round2 = (x: number) => Math.round(x * 100) / 100;
