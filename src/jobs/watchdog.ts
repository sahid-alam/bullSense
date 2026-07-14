/**
 * Watchdog / dead-man's switch (A0.1). Runs on its own schedule and checks that the
 * critical jobs actually RAN recently — the failure mode the per-job paging can't catch
 * (a job that silently stops running, a disabled workflow, an infra pause).
 *
 * Two layers:
 *   • in-house — pages operators on Telegram if nightly or the India archive is stale;
 *   • external — if HEALTHCHECKS_URL is set (a free healthchecks.io check), pings it each
 *     run. If the watchdog itself dies (or GitHub disables workflows), healthchecks stops
 *     receiving pings and alerts independently — the belt-and-suspenders the doctrine wants.
 *
 * Threshold is 4 days so normal weekends/holidays (nightly & NSE are weekday-only) never
 * false-alarm, while a genuine multi-day outage still surfaces.
 */
import { storeAvailable, latestOkRunAt, latestNseEquityDate } from "../providers/store.js";
import { pageOperators } from "../lib/alert.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env */ }

const STALE_MS = 4 * 86400_000;

async function pingHealthchecks(ok: boolean) {
  const url = process.env.HEALTHCHECKS_URL;
  if (!url) return;
  try { await fetch(ok ? url : `${url.replace(/\/$/, "")}/fail`, { method: "POST" }); }
  catch (e) { console.error("healthchecks ping failed:", e); }
}

async function main() {
  if (!storeAvailable()) { console.log("[dry-run] watchdog needs the store."); return; }

  const stale: string[] = [];

  // 1. nightly — the core engine loop (logs to job_runs)
  const nightly = await latestOkRunAt("nightly");
  if (!nightly || Date.now() - nightly.getTime() > STALE_MS) {
    stale.push(`*nightly* last ok: ${nightly ? nightly.toISOString().slice(0, 16).replace("T", " ") : "never"}`);
  }

  // 2. India archive — freshness of the actual data, not just a run row
  const archived = await latestNseEquityDate();
  if (!archived || Date.now() - new Date(archived).getTime() > STALE_MS) {
    stale.push(`*india-archive* latest data: ${archived ?? "none"}`);
  }

  if (stale.length > 0) {
    await pageOperators(`🚨 *Watchdog: the desk may be down.* No recent activity from:\n${stale.join("\n")}\n\nExpected within ~1 business day — investigate the GitHub Actions runs.`);
    await pingHealthchecks(false);
    console.error("watchdog: STALE —", stale.join(" · "));
    return;
  }

  await pingHealthchecks(true);
  console.log(`watchdog: healthy. nightly ok ${nightly!.toISOString().slice(0, 10)} · archive ${archived}`);
}

main().catch(async (e) => {
  console.error("watchdog failed:", e);
  await pageOperators(`🚨 *watchdog* itself failed: ${String(e).slice(0, 160)}`);
  process.exit(1);
});
