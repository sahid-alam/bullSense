/**
 * The Treasury — capital & risk governance (FINAL.md §3A).
 * Every dollar amount is computed here. Nothing is ever sized by feel (guardrail 6).
 */

export type Regime = "risk_on" | "neutral" | "risk_off";

export interface RiskPrefs {
  per_trade_risk_min: number; // 0.005
  per_trade_risk_max: number; // 0.015
  heat_cap_risk_on: number;   // 0.20
  heat_cap_neutral: number;   // 0.12
  heat_cap_risk_off: number;  // 0.05
  dd_throttle_half: number;   // 0.10
  dd_throttle_pause: number;  // 0.18
  max_position_pct?: number;  // 0.25 — cap on CAPITAL deployed in one position
}

const DEFAULT_MAX_POSITION_PCT = 0.25;

export interface SizingInput {
  equity: number;
  peakEquity: number;
  regime: Regime;
  conviction: number;          // 0–100, moves risk within the band ONLY
  entryPrice: number;
  invalidationPrice: number;
  currentHeatPct: number;      // sum of open risk budgets / equity
  prefs: RiskPrefs;
}

export interface SizingResult {
  approved: boolean;
  reason: string;
  qty: number;
  riskBudgetPct: number;       // fraction of equity at risk to invalidation
  riskBudgetAmount: number;
  sizingMultiplier: number;    // 1 normal, 0.5 under drawdown-half, 0 paused
}

export function heatCap(regime: Regime, prefs: RiskPrefs): number {
  switch (regime) {
    case "risk_on": return prefs.heat_cap_risk_on;
    case "neutral": return prefs.heat_cap_neutral;
    case "risk_off": return prefs.heat_cap_risk_off;
  }
}

export function drawdownMultiplier(equity: number, peakEquity: number, prefs: RiskPrefs): number {
  const dd = peakEquity > 0 ? 1 - equity / peakEquity : 0;
  if (dd >= prefs.dd_throttle_pause) return 0;   // full pause pending manual review
  if (dd >= prefs.dd_throttle_half) return 0.5;  // half sizing until near new highs
  return 1;
}

/** Rule 1 + 2 + 3 + 4: fixed-fractional sizing, heat-capped, regime-scaled, drawdown-throttled. */
export function sizePosition(inp: SizingInput): SizingResult {
  const { equity, entryPrice, invalidationPrice, prefs } = inp;
  const stopDistance = entryPrice - invalidationPrice;

  if (stopDistance <= 0) {
    return { approved: false, reason: "invalidation must be below entry", qty: 0, riskBudgetPct: 0, riskBudgetAmount: 0, sizingMultiplier: 1 };
  }

  const mult = drawdownMultiplier(equity, inp.peakEquity, prefs);
  if (mult === 0) {
    return { approved: false, reason: "drawdown throttle: PAUSED pending manual review", qty: 0, riskBudgetPct: 0, riskBudgetAmount: 0, sizingMultiplier: 0 };
  }

  // conviction (0–100) interpolates within the narrow band ONLY — max 3x, never 20x
  const c = Math.min(100, Math.max(0, inp.conviction)) / 100;
  const baseRisk = prefs.per_trade_risk_min + c * (prefs.per_trade_risk_max - prefs.per_trade_risk_min);
  const riskPct = baseRisk * mult;

  const cap = heatCap(inp.regime, prefs);
  if (inp.currentHeatPct + riskPct > cap) {
    return {
      approved: false,
      reason: `portfolio heat cap: ${(inp.currentHeatPct * 100).toFixed(1)}% open + ${(riskPct * 100).toFixed(2)}% new > ${(cap * 100).toFixed(0)}% ${inp.regime} ceiling`,
      qty: 0, riskBudgetPct: riskPct, riskBudgetAmount: 0, sizingMultiplier: mult,
    };
  }

  const riskAmount = equity * riskPct;
  let qty = Math.floor(riskAmount / stopDistance);
  if (qty < 1) {
    return { approved: false, reason: "risk budget too small for one share at this stop distance", qty: 0, riskBudgetPct: riskPct, riskBudgetAmount: riskAmount, sizingMultiplier: mult };
  }

  // Capital-concentration cap: a very tight stop yields a huge share count for the
  // same rupee risk (e.g. a 2%-wide stop → ~50x leverage into one name). Cap the
  // CAPITAL deployed so a gap-through-the-stop can't blow past the risk budget.
  const maxPosPct = prefs.max_position_pct ?? DEFAULT_MAX_POSITION_PCT;
  const maxQtyByCapital = Math.floor((equity * maxPosPct) / inp.entryPrice);
  let capitalCapped = false;
  if (qty > maxQtyByCapital) { qty = maxQtyByCapital; capitalCapped = true; }
  if (qty < 1) {
    return { approved: false, reason: "capital cap too small for one share at this price", qty: 0, riskBudgetPct: riskPct, riskBudgetAmount: riskAmount, sizingMultiplier: mult };
  }

  return {
    approved: true,
    reason: capitalCapped ? `ok (capital-capped at ${(maxPosPct * 100).toFixed(0)}% of equity)` : "ok",
    qty, riskBudgetPct: riskPct, riskBudgetAmount: riskAmount, sizingMultiplier: mult,
  };
}

/** Position-Intake ("rescue mode"): verdict on a position bought OUTSIDE the system. */
export function intakeVerdict(inp: {
  equity: number; qty: number; entryPrice: number; proposedInvalidation: number; prefs: RiskPrefs;
}): { atRiskPct: number; maxAllowedQty: number; verdict: string } {
  const stop = inp.entryPrice - inp.proposedInvalidation;
  const atRisk = (stop * inp.qty) / inp.equity;
  const maxAllowedQty = Math.floor((inp.equity * inp.prefs.per_trade_risk_max) / Math.max(stop, 1e-9));
  const ratio = inp.qty / Math.max(maxAllowedQty, 1);
  const verdict =
    ratio <= 1 ? "within formula" :
    `OVERSIZED: ${ratio.toFixed(1)}x the maximum the formula allows (${maxAllowedQty} shares) — trim or accept documented excess risk`;
  return { atRiskPct: atRisk, maxAllowedQty, verdict };
}
