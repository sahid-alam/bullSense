/**
 * The Watchtower — nightly vigilance over each profile's book (SCOPE.md).
 * Checks every holding against its trade plan and emits triaged events:
 *   fyi (logged) / look (worth a look) / decide (interrupts via Telegram).
 * Spam-guarded: the same event kind for the same symbol repeats at most weekly.
 */
import { latestClose } from "../providers/prices.js";
import { getProfiles, getBook, insertBookEvent, recentEventCount, nseFnoLatest } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";
import { fnoExpiryEvent, upcomingMacroEvents } from "./calendar.js";

export interface WatchtowerReport {
  checked: number;
  events: Array<{ profile: string; symbol: string; kind: string; triage: string; summary: string }>;
}

export async function runWatchtower(): Promise<WatchtowerReport> {
  const report: WatchtowerReport = { checked: 0, events: [] };
  const profiles = await getProfiles();

  const todayIso = new Date().toISOString().slice(0, 10);

  for (const profile of profiles) {
    const book = await getBook(profile.id);
    const holdings = book.filter((b) => b.kind === "holding" && b.qty > 0);

    // Calendar (A2) — macro dates (RBI MPC, Union Budget), once per profile, only if it
    // holds any NSE name (these are India-market events, not relevant to a US-only book).
    if (holdings.some((h) => h.symbol.endsWith(".NS"))) {
      for (const ev of upcomingMacroEvents(todayIso)) {
        if ((await recentEventCount(profile.id, "MARKET", ev.kind, 7)) > 0) continue;
        await insertBookEvent({ profile_id: profile.id, symbol: "MARKET", kind: ev.kind, triage: "fyi", summary: ev.summary });
        report.events.push({ profile: profile.id, symbol: "MARKET", kind: ev.kind, triage: "fyi", summary: ev.summary });
        if (profile.telegram_chat_id) await sendTelegram(profile.telegram_chat_id, `📅 *Calendar*\n${ev.summary}`);
      }
    }

    for (const pos of holdings) {
      report.checked++;
      let price: number;
      try {
        price = (await latestClose(pos.symbol)).close;
      } catch {
        continue; // symbol fetch failed — weekly job reports data-quality issues
      }
      const movePct = (price / pos.cost_basis - 1) * 100;

      const emit = async (kind: string, triage: "fyi" | "look" | "decide", summary: string, dedupeDays: number, icon?: string) => {
        if ((await recentEventCount(profile.id, pos.symbol, kind, dedupeDays)) > 0) return;
        await insertBookEvent({ profile_id: profile.id, symbol: pos.symbol, kind, triage, summary });
        report.events.push({ profile: profile.id, symbol: pos.symbol, kind, triage, summary });
        if ((triage === "decide" || triage === "look") && profile.telegram_chat_id) {
          // a win must not fire the same alarm as a blown stop — callers can override the icon
          const ic = icon ?? (triage === "decide" ? "🚨" : "👀");
          await sendTelegram(profile.telegram_chat_id, `${ic} *Watchtower — ${pos.symbol}*\n${summary}`);
        }
      };

      if (pos.invalidation_price == null) {
        await emit("no_invalidation", "decide",
          `No invalidation set on ${pos.symbol} (${pos.qty} @ ${pos.cost_basis}). ` +
          `Now ${price.toFixed(2)} (${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}%). ` +
          `An unguarded position is a hope, not a plan — set a stop level.`, 7);
        continue;
      }

      if (price <= pos.invalidation_price) {
        await emit("invalidation_hit", "decide",
          `INVALIDATION HIT: ${pos.symbol} closed ${price.toFixed(2)} ≤ stop ${pos.invalidation_price}. ` +
          `The plan says exit. Confirm the exit — or override (it will be logged and scored).`, 2);
      } else if (price <= pos.invalidation_price * 1.03) {
        await emit("invalidation_near", "look",
          `${pos.symbol} at ${price.toFixed(2)} — within 3% of the ${pos.invalidation_price} stop. No action required; the plan is armed.`, 3);
      }

      // Upside vigilance — the symmetric half of the stop. A target hit is a decision to
      // PROTECT the gain, never a reflexive "sell now": cutting winners early is itself a
      // documented failure mode. So we prompt bank-vs-trail, we don't order an exit.
      if (pos.target_price != null) {
        if (price >= pos.target_price) {
          await emit("target_hit", "decide",
            `🎯 TARGET REACHED: ${pos.symbol} at ${price.toFixed(2)} hit your ${pos.target_price} target ` +
            `(${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}% from cost). You've earned the planned reward. ` +
            `Decide deliberately: bank it, or trail your stop up under the price and let the winner run — ` +
            `just don't cut it on reflex.`, 3, "🎯");
        } else if (price >= pos.target_price * 0.97) {
          await emit("target_near", "look",
            `${pos.symbol} at ${price.toFixed(2)} — within 3% of your ${pos.target_price} target ` +
            `(${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}%). Decide the plan now (bank vs trail), ` +
            `not in the heat of the tick.`, 3, "🎯");
        }
      }

      if (pos.time_stop_date && new Date(pos.time_stop_date) <= new Date()) {
        await emit("time_stop", "decide",
          `TIME STOP: ${pos.symbol} passed its ${pos.time_stop_date} deadline at ${price.toFixed(2)} ` +
          `(${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}%). The thesis had a clock; the clock ran out. Exit or explicitly renew the thesis.`, 3);
      }

      // Calendar (A2) — F&O expiry, from the Archivist's own captured data (not a hardcoded rule).
      if (pos.symbol.endsWith(".NS")) {
        try {
          const fno = await nseFnoLatest(pos.symbol.replace(/\.NS$/, ""));
          const ev = fno ? fnoExpiryEvent(fno.near_expiry, todayIso) : null;
          if (ev) await emit(ev.kind, "fyi", `${pos.symbol}: ${ev.summary}`, 3);
        } catch { /* F&O data is best-effort */ }
      }
    }
  }
  return report;
}
