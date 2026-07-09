/**
 * Short-interest archiver — pulls the latest FINRA settlement and stores it.
 * Called from the nightly job (cheap when no new settlement; FINRA is bi-monthly).
 */
import { fetchLatestShortInterest } from "../providers/shortinterest.js";
import { upsertShortInterest, latestShortInterestDate } from "../providers/store.js";

export async function archiveShortInterest(): Promise<{ settlement: string | null; archived: number; fresh: boolean }> {
  const existing = await latestShortInterestDate();
  const latest = await fetchLatestShortInterest();
  if (!latest) return { settlement: existing, archived: 0, fresh: false };

  // skip the (heavy) upsert if we already have this settlement
  if (existing === latest.date) return { settlement: latest.date, archived: 0, fresh: false };

  await upsertShortInterest(latest.rows.map((r) => ({
    symbol: r.symbol, settlement_date: r.settlementDate, si_shares: r.shortShares, days_to_cover: r.daysToCover,
  })));
  return { settlement: latest.date, archived: latest.rows.length, fresh: true };
}
