import { evaluateEntry, conviction, invalidationPrice, timeStopDate, type GenomeDef } from "./genome.js";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  if (!cond) failures++;
};

const squeeze: GenomeDef = {
  entry: [
    { feature: "si_pct_float", op: ">=", value: 0.20 },
    { feature: "days_to_cover", op: ">=", value: 4 },
    { feature: "close_vs_ma20", op: "cross_above" },
    { feature: "rel_volume", op: ">=", value: 1.5 },
    { feature: "si_age_days", op: "<=", value: 21 },
  ],
  regime_gate: ["risk_on", "neutral"],
  dedupe_days: 20,
  exit: { invalidation: "low_20d_or_-10pct", time_stop_days: 30 },
};

// a clean qualifying squeeze
const pass = evaluateEntry(squeeze, {
  si_pct_float: 0.27, days_to_cover: 6, rel_volume: 2.1, si_age_days: 10,
  close_vs_ma20: 0.5, close_vs_ma20__prev: -0.3,  // crossed above today
});
check("Squeeze: all rules pass on a clean setup", pass.passed, JSON.stringify(pass.evidence));

// stale short-interest data blocks it
const stale = evaluateEntry(squeeze, {
  si_pct_float: 0.27, days_to_cover: 6, rel_volume: 2.1, si_age_days: 30,
  close_vs_ma20: 0.5, close_vs_ma20__prev: -0.3,
});
check("Squeeze: stale SI (age 30 > 21) blocks", !stale.passed, stale.failedOn.join(","));

// no cross (already above yesterday) blocks
const nocross = evaluateEntry(squeeze, {
  si_pct_float: 0.27, days_to_cover: 6, rel_volume: 2.1, si_age_days: 10,
  close_vs_ma20: 0.5, close_vs_ma20__prev: 0.3,  // already above → not a fresh cross
});
check("Squeeze: no fresh MA20 cross blocks", !nocross.passed, nocross.failedOn.join(","));

// conviction scales with strength
const weak = conviction("squeeze", { si_pct_float: 0.20, days_to_cover: 4, rel_volume: 1.5 });
const strong = conviction("squeeze", { si_pct_float: 0.40, days_to_cover: 10, rel_volume: 4 });
check("Squeeze: conviction scales (weak < strong)", weak < strong, `weak=${weak} strong=${strong}`);
check("Squeeze: conviction bounded 0-100", strong <= 100 && weak >= 0, `weak=${weak} strong=${strong}`);

// invalidation: 20-day low but floored at -10%
const inv1 = invalidationPrice(squeeze.exit, { entry: 100, low20: 95 });
check("Invalidation: uses 20d low when above -10% floor", inv1 === 95, `${inv1}`);
const inv2 = invalidationPrice(squeeze.exit, { entry: 100, low20: 80 });
check("Invalidation: floors at -10% when 20d low is deeper", inv2 === 90, `${inv2}`);

// time stop skips weekends
const ts = timeStopDate("2026-07-08", 30); // Wed
check("Time stop: 30 trading days lands on a weekday", new Date(ts).getDay() >= 1 && new Date(ts).getDay() <= 5, ts);

console.log(failures === 0 ? "\nALL GENOME TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
