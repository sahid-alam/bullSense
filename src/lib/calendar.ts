/**
 * Calendar (A2) — dated events that should flag a Watchtower check.
 *
 * F&O expiry is derived from the Archivist's own captured data (nse_fno_oi.near_expiry,
 * NSE's FininstrmActlXpryDt) — never an assumed "last Thursday" rule, which NSE has changed
 * more than once. RBI MPC + Union Budget are genuinely fixed public dates (announced by RBI/
 * the Finance Ministry well in advance), so a small static table is honest here — unlike
 * expiry, there's no archived data to derive them from. Needs a yearly top-up.
 *
 * HONEST SCOPE: earnings dates and ex-dividend dates are NOT modeled — no free, reliable
 * NSE source has been confirmed yet (candidate: NSE corporate-announcements, which News
 * Sentry scrapes for a different purpose — parsing structured dates out of free-text
 * announcement subjects is future work, not faked here).
 */

export interface CalendarEvent { kind: string; daysAway: number; summary: string }

/** RBI Monetary Policy Committee decision dates + the Union Budget — update yearly. */
export const RBI_MPC_DATES_2026 = ["2026-02-06", "2026-04-08", "2026-06-05", "2026-08-06", "2026-10-01", "2026-12-05"];
export const UNION_BUDGET_DATE_2026 = "2026-02-01";

/** F&O expiry flag for one underlying, if it trades in F&O and expiry is within the window. */
export function fnoExpiryEvent(nearExpiry: string | null, todayIso: string, windowDays = 5): CalendarEvent | null {
  if (!nearExpiry) return null;
  const days = daysBetween(todayIso, nearExpiry);
  if (days < 0 || days > windowDays) return null;
  return {
    kind: "fno_expiry",
    daysAway: days,
    summary: days === 0
      ? `F&O contracts expire TODAY (${nearExpiry}). Expect elevated volatility into the close.`
      : `F&O expiry in ${days}d (${nearExpiry}). Positioning (OI/PCR) often unwinds or rolls into it.`,
  };
}

/** Macro calendar events (RBI/Budget) within the window — not symbol-specific. */
export function upcomingMacroEvents(todayIso: string, windowDays = 5): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const d of RBI_MPC_DATES_2026) {
    const days = daysBetween(todayIso, d);
    if (days >= 0 && days <= windowDays) out.push({ kind: "rbi_mpc", daysAway: days, summary: `RBI MPC decision in ${days}d (${d}) — rate-sensitive sectors can move on the outcome.` });
  }
  const budgetDays = daysBetween(todayIso, UNION_BUDGET_DATE_2026);
  if (budgetDays >= 0 && budgetDays <= windowDays) out.push({ kind: "union_budget", daysAway: budgetDays, summary: `Union Budget in ${budgetDays}d (${UNION_BUDGET_DATE_2026}) — broad market volatility is typical.` });
  return out;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + "T00:00:00Z");
  const to = Date.parse(toIso + "T00:00:00Z");
  return Math.round((to - from) / 86_400_000);
}
