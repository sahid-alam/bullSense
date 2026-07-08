import { fetchDailyBars, latestClose } from "../providers/prices.js";
import { computeRadar, sma } from "../lib/radar.js";
import { sendTelegram } from "../providers/telegram.js";

const SECTORS = ["XLK","XLF","XLV","XLE","XLI","XLY","XLP","XLU","XLB","XLRE","XLC"];

const [vix, vix3m, spy, hyg, lqd] = await Promise.all([
  fetchDailyBars("^VIX","3y"), fetchDailyBars("^VIX3M","3y"),
  fetchDailyBars("SPY","3y"), fetchDailyBars("HYG","3y"), fetchDailyBars("LQD","3y"),
]);
const sectors = await Promise.all(SECTORS.map(s => fetchDailyBars(s,"1y")));
let above = 0;
for (const bars of sectors) {
  const closes = bars.map(b=>b.close);
  const m = sma(closes,50);
  if (m!==null && closes[closes.length-1]>m) above++;
}
const r = computeRadar({
  vixCloses: vix.map(b=>b.close), vix3mCloses: vix3m.map(b=>b.close),
  spyCloses: spy.map(b=>b.close), hygCloses: hyg.map(b=>b.close),
  lqdCloses: lqd.map(b=>b.close), sectorAbove50dma: above/SECTORS.length,
});

// Watchtower check on the seeded Cupid position
const cupid = await latestClose("CUPID.NS");
const entry = 224.68, qty = 45;
const pnl = (cupid.close-entry)*qty;
const pnlPct = (cupid.close/entry-1)*100;

const regimeLabel = r.regime==="risk_on"?"🟢 RISK-ON":r.regime==="neutral"?"🟡 NEUTRAL":"🔴 RISK-OFF";
const msg = [
  `*BullSense — first briefing* 🐂`,
  ``,
  `*Market Radar* (${spy[spy.length-1].date})`,
  `Score: *${r.score}/100* → ${regimeLabel}`,
  `• Trend ${r.components.trend} · Credit ${r.components.credit}`,
  `• Breadth ${r.components.breadth} (${above}/11 sectors above 50DMA)`,
  `• VIX level ${r.components.vix_level} · VIX term ${r.components.vix_term}`,
  `Heat ceiling: *${r.regime==="risk_on"?"20%":r.regime==="neutral"?"12%":"5%"}* of equity at risk`,
  ``,
  `*Your Book* (test profile)`,
  `CUPID.NS — 45 @ ₹224.68 → ₹${cupid.close.toFixed(2)} (${pnlPct>=0?"+":""}${pnlPct.toFixed(1)}%, ₹${pnl.toFixed(0)})`,
  `⚠️ _No invalidation set on this position. Reply with a stop level or accept the proposed ₹195 (−13.2%) so the Watchtower can guard it._`,
  ``,
  `_The engine is scaffolded. Once the database connects, this briefing arrives every trading day at 18:15 ET automatically._`,
].join("\n");

const ok = await sendTelegram("5628026392", msg);
console.log("sent:", ok, "| radar:", r.score, r.regime, "| cupid:", cupid.close);
