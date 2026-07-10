import { perfMetrics } from "./perf.js";
let fail = 0;
const chk = (n: string, c: boolean, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? " → " + d : ""}`); if (!c) fail++; };

// steady +0.1%/day for a year → strong positive Sharpe, small drawdown
const up = [100]; const noise = [0.008, -0.005, 0.011, -0.004, 0.006, -0.007, 0.009, -0.003];
for (let i = 0; i < 252; i++) up.push(up[up.length - 1] * (1 + 0.001 + noise[i % noise.length] * 0.3));
const m = perfMetrics(up);
chk("uptrend: positive CAGR", m.cagrPct > 15, `${m.cagrPct.toFixed(1)}%`);
chk("uptrend: positive Sharpe", m.sharpe > 1, `sharpe ${m.sharpe.toFixed(2)}`);
chk("uptrend: modest drawdown", m.maxDrawdownPct < 5, `${m.maxDrawdownPct.toFixed(2)}%`);

// a curve with a real drawdown
const dd = [100, 102, 105, 108, 95, 90, 98, 104, 110];
const m2 = perfMetrics(dd);
chk("drawdown series: maxDD reflects 108→90 (~16.7%)", Math.abs(m2.maxDrawdownPct - 16.67) < 1, `${m2.maxDrawdownPct.toFixed(1)}%`);
chk("Sortino >= Sharpe when downside is limited", m2.sortino >= m2.sharpe - 0.01, `sortino ${m2.sortino.toFixed(2)} sharpe ${m2.sharpe.toFixed(2)}`);

// flat curve → zero everything (the current engine state)
const flat = [100, 100, 100, 100];
const m3 = perfMetrics(flat);
chk("flat: zero return, zero sharpe", m3.cagrPct === 0 && m3.sharpe === 0);

console.log(fail === 0 ? "\nALL PERF TESTS PASSED" : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);
