import { computeIndiaRadar } from "./indiaRadar.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  if (!cond) failures++;
}

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);
const base = {
  vixCloses: flat(300, 14), niftyCloses: flat(300, 24000), breadthPct: 50,
  inrUsdCloses: flat(300, 83), brentCloses: flat(300, 80),
};

// Thin: fewer than the required rolling windows — must report neutral, not a false read.
const thin = computeIndiaRadar({ ...base, fiiDiiDailyNet: Array.from({ length: 15 }, () => 500) });
check("Thin FII/DII history: reports neutral (50), not a real percentile", thin.components.fii_dii === 50 && thin.fiiDiiThin);

// Sufficient history, steady flows — 5-day sum ranks mid-pack against itself (self-consistent).
const steady = computeIndiaRadar({ ...base, fiiDiiDailyNet: flat(40, 500) });
check("Sufficient, uniform flow: not thin", !steady.fiiDiiThin);
check("Sufficient, uniform flow: net5d is a SUM not a single day", steady.fiiDiiNet5d === 2500, `got ${steady.fiiDiiNet5d}`);

// Regression guard for the unit-mismatch bug: when the huge inflow IS in the current 5-day
// window, it should rank near the top (correctly — compared against OTHER 5-day sums, most
// of which are tiny flat windows).
const spikeInCurrentWindow = computeIndiaRadar({ ...base, fiiDiiDailyNet: [...flat(35, 10), 100_000, 10, 10, 10, 10] });
check("Spike in the current window: not thin with 40 days", !spikeInCurrentWindow.fiiDiiThin);
check("Spike in the current window: net5d is the raw sum including the spike", spikeInCurrentWindow.fiiDiiNet5d === 100_040, `got ${spikeInCurrentWindow.fiiDiiNet5d}`);
check("Spike in the current window: ranks near the top vs other 5-day sums", spikeInCurrentWindow.components.fii_dii > 80, `got ${spikeInCurrentWindow.components.fii_dii}`);

// The unit-mismatch bug, made concrete: with the spike buried EARLIER (not in the current
// window), today's flat 5-day sum (50) is still larger than any SINGLE day (10) — the old
// buggy code (ranking a sum against single days) would have pinned this near 100. The fixed
// code ranks it against OTHER 5-day sums (several of which overlap the buried spike and are
// far larger), so it should rank LOW instead.
const spikeBuried = computeIndiaRadar({ ...base, fiiDiiDailyNet: [...flat(15, 10), 100_000, ...flat(24, 10)] });
check("Buried spike, flat current window: net5d is just the flat sum", spikeBuried.fiiDiiNet5d === 50, `got ${spikeBuried.fiiDiiNet5d}`);
check("Buried spike, flat current window: ranks LOW (proves sum-vs-sum, not sum-vs-single-day)", spikeBuried.components.fii_dii < 50, `got ${spikeBuried.components.fii_dii} — old buggy code would have pinned this near 100`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
