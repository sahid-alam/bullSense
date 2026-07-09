import { sizePosition, intakeVerdict, type RiskPrefs } from "./treasury.js";

const prefs: RiskPrefs = {
  per_trade_risk_min: 0.010,
  per_trade_risk_max: 0.025,
  heat_cap_risk_on: 0.20,
  heat_cap_neutral: 0.12,
  heat_cap_risk_off: 0.05,
  dd_throttle_half: 0.10,
  dd_throttle_pause: 0.18,
};

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  if (!cond) failures++;
}

// --- The Cupid trade, replayed through the Treasury (₹1,00,000 account, conviction 60) ---
const cupid = sizePosition({
  equity: 100_000, peakEquity: 100_000, regime: "neutral",
  conviction: 60, entryPrice: 224.68, invalidationPrice: 206.71, // -8%
  currentHeatPct: 0, prefs,
});
console.log("\nCupid replay:", JSON.stringify(cupid, null, 2));
check("Cupid: approved with a defined stop", cupid.approved);
check("Cupid: qty is ~105 shares (1.9% risk / ₹17.97 stop), NOT feel-based 45",
  cupid.qty >= 95 && cupid.qty <= 115, `qty=${cupid.qty}`);
check("Cupid: max loss pre-capped ≈ ₹1,900 (vs the open-ended -₹1,250 and counting)",
  Math.abs(cupid.qty * (224.68 - 206.71) - cupid.riskBudgetAmount) < 100,
  `capped at ₹${(cupid.qty * 17.97).toFixed(0)}`);

// --- Heat cap: risk_off ceiling blocks a 6th position ---
const blocked = sizePosition({
  equity: 100_000, peakEquity: 100_000, regime: "risk_off",
  conviction: 90, entryPrice: 100, invalidationPrice: 92,
  currentHeatPct: 0.045, prefs,
});
check("Heat cap: RISK_OFF ceiling (5%) blocks when 4.5% already open", !blocked.approved, blocked.reason);

// --- Drawdown throttle ---
const halved = sizePosition({
  equity: 88_000, peakEquity: 100_000, regime: "risk_on",
  conviction: 100, entryPrice: 100, invalidationPrice: 90,
  currentHeatPct: 0, prefs,
});
check("Drawdown 12%: sizing halved", halved.sizingMultiplier === 0.5);

const paused = sizePosition({
  equity: 80_000, peakEquity: 100_000, regime: "risk_on",
  conviction: 100, entryPrice: 100, invalidationPrice: 90,
  currentHeatPct: 0, prefs,
});
check("Drawdown 20%: PAUSED", !paused.approved && paused.sizingMultiplier === 0);

// --- Position Intake on the real Cupid position (45 @ 224.68, stop proposed at 195) ---
const intake = intakeVerdict({ equity: 100_000, qty: 45, entryPrice: 224.68, proposedInvalidation: 195, prefs });
console.log("\nCupid intake verdict:", JSON.stringify(intake, null, 2));
check("Intake: reports % of equity at risk", intake.atRiskPct > 0.012 && intake.atRiskPct < 0.015,
  `${(intake.atRiskPct * 100).toFixed(2)}% at risk to ₹195 stop`);

// --- Capital-concentration cap: tight stop must not deploy >25% of equity ---
const tightStop = sizePosition({
  equity: 100_000, peakEquity: 100_000, regime: "risk_on",
  conviction: 63, entryPrice: 15.82, invalidationPrice: 15.50, // 0.32 stop → huge share count
  currentHeatPct: 0, prefs,
});
console.log("\nTight-stop replay (BPYPM delivery test):", JSON.stringify(tightStop));
check("Capital cap: qty capped so capital ≤ 25% of equity",
  tightStop.qty * 15.82 <= 25_000 + 20, `capital=₹${(tightStop.qty * 15.82).toFixed(0)}`);
check("Capital cap: reason notes the cap", tightStop.reason.includes("capital-capped"), tightStop.reason);

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
