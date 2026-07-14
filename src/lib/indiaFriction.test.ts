import { indiaFriction } from "./indiaFriction.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  if (!cond) failures++;
}

// A ₹10,000 gross winner on a ₹1L round trip, 40-day hold (STCG) — costs should be small
// (₹0 brokerage broker) but non-zero, and tax should bite the post-cost gain at 20%.
const win = indiaFriction({ entry: 1000, exit: 1100, qty: 100, holdingDays: 40 });
check("Winner: gross P&L is exactly (exit-entry)*qty", win.grossPnl === 10_000);
check("Winner: transaction costs are small but non-zero", win.totalTransactionCosts > 0 && win.totalTransactionCosts < 300, `costs=₹${win.totalTransactionCosts.toFixed(2)}`);
check("Winner: STCG rate applied (20%) since held <365d", win.taxRate === 0.20);
check("Winner: tax only on the post-cost gain, not the gross", Math.abs(win.taxOwed - win.preTaxPnl * 0.20) < 0.01);
check("Winner: net P&L is less than gross by costs+tax", win.netPnl < win.grossPnl && win.netPnl > 0, `net=₹${win.netPnl.toFixed(2)}`);

// A losing trade — no capital-gains tax on a loss, only transaction costs apply.
const loss = indiaFriction({ entry: 1000, exit: 950, qty: 100, holdingDays: 10 });
check("Loser: no tax owed on a loss", loss.taxOwed === 0);
check("Loser: net P&L is worse than gross by transaction costs alone", Math.abs((loss.netPnl - loss.grossPnl) + loss.totalTransactionCosts) < 0.01);

// LTCG: same trade held >=365 days gets the lower 12.5% rate, not 20%.
const ltcg = indiaFriction({ entry: 1000, exit: 1100, qty: 100, holdingDays: 400 });
check("LTCG: 12.5% rate applied at >=365 days held", ltcg.taxRate === 0.125);
check("LTCG: lower rate means more net P&L than the same trade under STCG", ltcg.netPnl > win.netPnl);

// A round trip that barely moves should still show real transaction drag on net return.
const flat = indiaFriction({ entry: 1000, exit: 1002, qty: 100, holdingDays: 5 });
check("Near-flat: transaction costs alone can flip a tiny gross gain to a net loss", flat.netPnl < flat.grossPnl, `gross=₹${flat.grossPnl} net=₹${flat.netPnl.toFixed(2)}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
