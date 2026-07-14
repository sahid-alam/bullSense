/**
 * India friction model (A2) — net expectancy for a delivery-equity round trip on the NSE,
 * using real published rates (FY2025-26). Pure function, no I/O — same discipline as perf.ts.
 *
 * Rates modeled (delivery equity, buy then sell — NOT intraday, which has different STT):
 *   STT              0.1% of turnover, BOTH legs (Finance Act, delivery equity)
 *   Exchange txn chg 0.00297% of turnover, both legs (NSE)
 *   SEBI turnover fee 0.0001% of turnover, both legs
 *   Stamp duty       0.015% of buy turnover only (uniform union rate)
 *   DP charges       flat ~₹15 + 18% GST per scrip, sell leg only (typical CDSL debit charge)
 *   Brokerage        0 by default — Zerodha/Groww/Upstox (the brokers this desk's profiles
 *                    use, per profiles.broker) charge ₹0 delivery brokerage; pass a value to
 *                    override for a different broker.
 *   GST              18% on (brokerage + exchange txn charge + SEBI fee)
 *   STCG             20% if held < 365 days (Budget 2024 rate)
 *   LTCG             12.5% if held >= 365 days, above a ₹1.25L/year exemption
 *
 * HONEST LIMITS (do not silently ignore): the LTCG exemption and loss set-off are computed
 * at the PORTFOLIO level by the tax code, not per-trade — this function taxes each trade in
 * isolation, which overstates tax drag for anyone with losses elsewhere or under the LTCG
 * exemption in a given year. Treat `taxOwed`/`netPnl` as a conservative (worst-case) estimate,
 * not a filing-ready number.
 */

export interface FrictionInput {
  entry: number; exit: number; qty: number; holdingDays: number;
  brokerageFlat?: number; // per-leg flat brokerage, ₹; default 0 (discount-broker delivery)
}

export interface FrictionResult {
  grossPnl: number;
  stt: number; exchangeCharges: number; sebiFee: number; stampDuty: number; dpCharges: number; brokerage: number; gst: number;
  totalTransactionCosts: number;
  preTaxPnl: number;
  taxRate: number; // 0.20 STCG or 0.125 LTCG — 0 if the trade lost money (losses aren't taxed)
  taxOwed: number;
  netPnl: number;
  netReturnPct: number; // net of costs + tax, vs buy turnover
}

const STT_RATE = 0.001;
const EXCHANGE_RATE = 0.0000297;
const SEBI_RATE = 0.000001;
const STAMP_RATE = 0.00015;
const DP_CHARGE = 15 * 1.18;
const GST_RATE = 0.18;
const STCG_RATE = 0.20;
const LTCG_RATE = 0.125;
const LTCG_HOLDING_DAYS = 365;

export function indiaFriction(inp: FrictionInput): FrictionResult {
  const { entry, exit, qty, holdingDays } = inp;
  const brokerageLeg = inp.brokerageFlat ?? 0;
  const buyTurnover = entry * qty;
  const sellTurnover = exit * qty;
  const turnover = buyTurnover + sellTurnover;

  const stt = turnover * STT_RATE;
  const exchangeCharges = turnover * EXCHANGE_RATE;
  const sebiFee = turnover * SEBI_RATE;
  const stampDuty = buyTurnover * STAMP_RATE;
  const dpCharges = qty > 0 ? DP_CHARGE : 0; // one debit instruction, flat regardless of qty
  const brokerage = brokerageLeg * 2; // buy + sell legs
  const gst = (brokerage + exchangeCharges + sebiFee) * GST_RATE;

  const totalTransactionCosts = stt + exchangeCharges + sebiFee + stampDuty + dpCharges + brokerage + gst;

  const grossPnl = (exit - entry) * qty;
  const preTaxPnl = grossPnl - totalTransactionCosts;

  const taxRate = holdingDays >= LTCG_HOLDING_DAYS ? LTCG_RATE : STCG_RATE;
  const taxOwed = preTaxPnl > 0 ? preTaxPnl * taxRate : 0;
  const netPnl = preTaxPnl - taxOwed;
  const netReturnPct = buyTurnover > 0 ? (netPnl / buyTurnover) * 100 : 0;

  return { grossPnl, stt, exchangeCharges, sebiFee, stampDuty, dpCharges, brokerage, gst, totalTransactionCosts, preTaxPnl, taxRate, taxOwed, netPnl, netReturnPct };
}
