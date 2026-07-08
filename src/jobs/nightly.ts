/**
 * Nightly job (17:30 ET weekdays via GitHub Actions):
 * ingest regime inputs → compute Radar → persist → (later) run squeeze genome,
 * mark positions, Watchtower sweep.
 *
 * Runs in DRY-RUN (console only) when DATABASE_URL is a placeholder, so the
 * engine is testable before any account exists.
 */
import { fetchDailyBars } from "../providers/prices.js";
import { computeRadar, sma } from "../lib/radar.js";

const SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC"];

async function main() {
  const started = Date.now();

  // --- gather inputs (Yahoo free; FMP replaces once key exists) ---
  const [vix, vix3m, spy, hyg, lqd] = await Promise.all([
    fetchDailyBars("^VIX", "3y"),
    fetchDailyBars("^VIX3M", "3y"),
    fetchDailyBars("SPY", "3y"),
    fetchDailyBars("HYG", "3y"),
    fetchDailyBars("LQD", "3y"),
  ]);

  const sectors = await Promise.all(SECTOR_ETFS.map((s) => fetchDailyBars(s, "1y")));
  let above = 0;
  for (const bars of sectors) {
    const closes = bars.map((b) => b.close);
    const ma50 = sma(closes, 50);
    if (ma50 !== null && closes[closes.length - 1] > ma50) above++;
  }

  const radar = computeRadar({
    vixCloses: vix.map((b) => b.close),
    vix3mCloses: vix3m.map((b) => b.close),
    spyCloses: spy.map((b) => b.close),
    hygCloses: hyg.map((b) => b.close),
    lqdCloses: lqd.map((b) => b.close),
    sectorAbove50dma: above / SECTOR_ETFS.length,
  });

  const asOf = spy[spy.length - 1].date;
  const out = {
    as_of: asOf,
    score: radar.score,
    regime: radar.regime,
    components: radar.components,
    breadth_detail: `${above}/${SECTOR_ETFS.length} sector ETFs above their 50DMA`,
    heat_ceiling: radar.regime === "risk_on" ? "20%" : radar.regime === "neutral" ? "12%" : "5%",
    ms: Date.now() - started,
  };

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl === "placeholder") {
    console.log("[dry-run — no DATABASE_URL] Radar computed from live market data:\n");
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // --- persist (Supabase Postgres, TLS verified; set DATABASE_CA_CERT for direct connections) ---
  const { default: pg } = await import("pg");
  const ca = process.env.DATABASE_CA_CERT;
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: ca ? { ca } : true });
  await pool.query(
    `insert into regime_scores (date, score, regime, components, prev_score)
     values ($1, $2, $3, $4, (select score from regime_scores where date < $1 order by date desc limit 1))
     on conflict (date) do update set score = excluded.score, regime = excluded.regime, components = excluded.components`,
    [asOf, radar.score, radar.regime, JSON.stringify(radar.components)],
  );
  await pool.query(
    `insert into job_runs (job, trading_date, status, started_at, ms, meta)
     values ('nightly', $1, 'ok', to_timestamp($2 / 1000.0), $3, $4)`,
    [asOf, started, Date.now() - started, JSON.stringify(out)],
  );
  await pool.end();
  console.log("Radar persisted:", JSON.stringify(out));
}

main().catch((err) => {
  console.error("nightly job failed:", err);
  process.exit(1);
});
