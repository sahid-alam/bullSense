/**
 * Dossier job — processes queued Analyst Desk requests: builds each dossier,
 * persists it (frozen with stance + triggers for later scoring), and delivers it
 * to the requester over Telegram. Runs on schedule + on-demand (workflow_dispatch).
 */
import { storeAvailable, queuedDossierRequests, insertDossier, completeDossierRequest, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";
import { buildDossier } from "../lib/dossier.js";
import { sendTelegram } from "../providers/telegram.js";

async function main() {
  const started = Date.now();
  if (!storeAvailable()) { console.log("[dry-run] dossier job needs the store."); return; }
  if (!(await routineEnabled("dossier"))) { console.log("dossier: disabled/paused."); return; }

  const reqs = await queuedDossierRequests();
  if (reqs.length === 0) { console.log("dossier: queue empty."); return; }

  let built = 0;
  for (const req of reqs) {
    try {
      const d = await buildDossier(req.symbol);
      if (!d) {
        await completeDossierRequest(req.id, null, "no data / build failed");
        if (req.chat_id) await sendTelegram(req.chat_id, `Couldn't build a dossier for *${req.symbol}* — no usable data (non-US ticker, or too little price history).`);
        continue;
      }
      const dossierId = await insertDossier({
        symbol: d.symbol, stance: d.stance, confidence: d.confidence, summary_md: d.summary_md,
        triggers: d.triggers, entry_price: d.entry_price, spy_at_creation: d.spy_at_creation,
      });
      await completeDossierRequest(req.id, dossierId);
      built++;
      if (req.chat_id) await sendTelegram(req.chat_id, d.summary_md);
    } catch (e) {
      console.error("dossier build error", req.symbol, e);
      await completeDossierRequest(req.id, null, String(e).slice(0, 200));
      if (req.chat_id) await sendTelegram(req.chat_id, `⚠️ Dossier for *${req.symbol}* failed. Try again shortly.`);
    }
  }

  const asOf = new Date().toISOString().slice(0, 10);
  await logJobRun("dossier", asOf, "ok", started, { processed: reqs.length, built });
  await touchRoutine("dossier", `processed ${reqs.length}, built ${built}`);
  console.log(`dossier: processed ${reqs.length}, built ${built}`);
}

main().catch((e) => { console.error("dossier job failed:", e); process.exit(1); });
