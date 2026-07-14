/**
 * India Archivist (A0.2) — captures NSE point-in-time data daily.
 *   default:            archive the latest available trading day
 *   --backfill <days>:  bootstrap history, walking back <days> calendar days
 *
 * Rows are keyed on the date INSIDE each file (NSE serves stale duplicates on non-trading
 * days), so re-runs and weekend fetches are idempotent. The equity+delivery capture is the
 * crown jewel; FII/DII is isolated in try/catch so its fragility can't fail the equity run.
 * A zero-equity capture pages the operators on Telegram — the archive must not die silently.
 */
import { fetchEquityDelivery, fetchFiiDii } from "../providers/nse.js";
import { storeAvailable, upsertNseEquity, upsertFiiDii, latestNseEquityDate, insertIndiaArchiveRun, operatorChatIds } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env directly */ }

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };

/** Capture one calendar day. Returns rows written (0 = no NSE file / weekend / holiday). */
async function captureDay(d: Date): Promise<{ date: string | null; equityRows: number }> {
  const eq = await fetchEquityDelivery(d);
  if (!eq) return { date: null, equityRows: 0 };
  await upsertNseEquity(eq.rows);
  return { date: eq.contentDate, equityRows: eq.rows.length };
}

async function page(msg: string) {
  try { for (const chat of await operatorChatIds()) await sendTelegram(chat, msg); } catch (e) { console.error("paging failed:", e); }
}

async function main() {
  if (!storeAvailable()) { console.log("[dry-run] India Archivist needs the store (SUPABASE_URL / SUPABASE_SECRET_KEY)."); return; }

  const backfillArg = process.argv.indexOf("--backfill");
  if (backfillArg >= 0) {
    const days = Math.max(1, Number(process.argv[backfillArg + 1] ?? 30));
    console.log(`Backfilling equity+delivery for the last ${days} calendar days…`);
    let captured = 0, rows = 0;
    for (let n = days; n >= 0; n--) {
      const r = await captureDay(daysAgo(n));
      if (r.equityRows > 0) { captured++; rows += r.equityRows; console.log(`  ${r.date}: ${r.equityRows} rows`); }
    }
    console.log(`Backfill done: ${captured} trading days, ${rows} equity rows.`);
    return;
  }

  // Default: the latest available trading day (walk back until NSE has a file).
  let day: { date: string | null; equityRows: number } = { date: null, equityRows: 0 };
  for (let n = 0; n <= 6 && day.equityRows === 0; n++) day = await captureDay(daysAgo(n));

  // FII/DII — isolated: its anti-bot host is the fragile one; never let it fail the equity run.
  let fiiDiiRows = 0;
  try {
    const flows = await fetchFiiDii();
    await upsertFiiDii(flows);
    fiiDiiRows = flows.length;
  } catch (e) { console.error("FII/DII capture failed (non-fatal):", e); }

  const status = day.equityRows > 0 ? "ok" : "error";
  const detail = `equity ${day.equityRows} rows (${day.date ?? "none"}) · FII/DII ${fiiDiiRows}`;
  await insertIndiaArchiveRun({ trade_date: day.date, equity_rows: day.equityRows, fii_dii_rows: fiiDiiRows, status, detail });

  if (day.equityRows === 0) {
    // The source most likely to die silently — page immediately.
    await page("🚨 *India Archivist* captured *0 equity rows* today. NSE fetch may be blocked or down — the point-in-time archive has a gap. Check the india-archive job.");
    console.error("India Archivist: NO equity data captured.");
    process.exit(1);
  }
  console.log(`India Archivist: ${detail}. Latest archived: ${await latestNseEquityDate()}.`);
}

main().catch(async (e) => {
  console.error("india-archive failed:", e);
  await page(`🚨 *India Archivist* crashed: ${String(e).slice(0, 160)}`);
  process.exit(1);
});
