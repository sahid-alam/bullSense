/**
 * News Sentry (A2) — checks NSE corporate announcements on every held NSE name, triages new
 * ones via LLM (see lib/newsSentry.ts for the untrusted-content handling), and emits
 * Watchtower-style book_events. Isolated per symbol: one broken/rate-limited symbol can't
 * fail the run — same resilience discipline as the India Archivist.
 */
import { fetchCorporateAnnouncements } from "../providers/nse.js";
import { triageAnnouncement } from "../lib/newsSentry.js";
import {
  storeAvailable, nseHoldings, newsSentryLastSeenDate, updateNewsSentryState, insertBookEvent,
} from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";
import { failJob } from "../lib/alert.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env directly */ }

const MAX_NEW_PER_SYMBOL = 5; // cap so a symbol's first-ever check doesn't backfill its whole history as alerts

async function main() {
  if (!storeAvailable()) { console.log("[dry-run] News Sentry needs the store (SUPABASE_URL / SUPABASE_SECRET_KEY)."); return; }

  const holdings = await nseHoldings();
  const bySymbol = new Map<string, Array<{ profileId: string; telegramChatId: string | null }>>();
  for (const h of holdings) {
    const bare = h.symbol.replace(/\.NS$/, "");
    if (!bySymbol.has(bare)) bySymbol.set(bare, []);
    bySymbol.get(bare)!.push({ profileId: h.profileId, telegramChatId: h.telegramChatId });
  }

  let checked = 0, triaged = 0, errors = 0;
  for (const [symbol, holders] of bySymbol) {
    checked++;
    try {
      const lastSeen = await newsSentryLastSeenDate(symbol);
      const anns = await fetchCorporateAnnouncements(symbol);
      // Freshness is judged on sort_date (ISO, directly comparable) — NOT seq_id, whose
      // numbering isn't monotonic across NSE's own ID-system eras.
      const fresh = anns
        .filter((a) => lastSeen === null || a.sort_date > lastSeen)
        .sort((a, b) => (a.sort_date < b.sort_date ? -1 : 1)) // oldest-of-the-new first
        .slice(-MAX_NEW_PER_SYMBOL);

      for (const ann of fresh) {
        const result = await triageAnnouncement(symbol, ann.desc, ann.text);
        if (!result) continue; // LLM unavailable or malformed — don't act on an unclassified item
        triaged++;
        // news_sentry_state.last_seq_id (updated below, after all holders are processed) is the
        // sole dedup gate — each announcement's seq_id only ever appears in `fresh` once.
        const summary = `${ann.desc || "Announcement"} (${ann.an_dt}): ${result.summary}`;
        for (const h of holders) {
          await insertBookEvent({ profile_id: h.profileId, symbol: `${symbol}.NS`, kind: "news", triage: result.triage, summary, source_ref: ann.seq_id });
          if ((result.triage === "decide" || result.triage === "look") && h.telegramChatId) {
            const icon = result.triage === "decide" ? "🚨" : "📰";
            await sendTelegram(h.telegramChatId, `${icon} *News Sentry — ${symbol}.NS*\n${summary}`);
          }
        }
      }
      if (anns.length > 0) {
        const newest = anns.reduce((max, a) => (a.sort_date > max ? a.sort_date : max), anns[0].sort_date);
        await updateNewsSentryState(symbol, newest);
      }
    } catch (e) {
      errors++;
      console.error(`News Sentry: ${symbol} failed (non-fatal):`, e);
    }
  }

  console.log(`News Sentry: ${checked} symbols checked, ${triaged} announcements triaged, ${errors} errors.`);
}

main().catch((e) => failJob("news-sentry", e));
