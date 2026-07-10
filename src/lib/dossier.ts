/**
 * The Analyst Desk (P1) — multi-agent deep-dive dossier for one ticker.
 * Gather (deterministic, free data) → specialist analyses → bull/bear debate →
 * structured verdict. All LLM work on Groq's judgment tier ($0). Every dossier is
 * frozen with a stance + machine-checkable "what would change our mind" triggers,
 * so it can be scored later like a signal.
 */
import { fetchDailyBars } from "../providers/prices.js";
import { tickerToCik, fundamentals, recentFilings, summarizeFundamentals } from "../providers/edgar.js";
import { latestShortInterestForSymbol, latestSentimentForSymbol } from "../providers/store.js";
import { complete, completeJson } from "../providers/llm.js";

/** Judgment call with one retry on empty/short output (Groq free tier can rate-limit
 *  concurrent requests). Keeps dossier sections from coming back blank. */
async function judge(system: string, user: string, maxTokens: number): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await complete("judgment", system, user, maxTokens);
    if (r && r.trim().length > 20) return r.trim();
    await new Promise((res) => setTimeout(res, 1500)); // back off, then retry
  }
  return "—";
}

export interface Dossier {
  symbol: string;
  stance: "avoid" | "watch" | "interesting_long" | "interesting_short";
  confidence: number;
  summary_md: string;
  triggers: string[];
  entry_price: number | null;
  spy_at_creation: number | null;
}

function technicalSummary(bars: { close: number; high: number; low: number; volume: number }[]): string {
  if (bars.length < 50) return "Insufficient price history.";
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;
  const hi52 = Math.max(...closes.slice(-252));
  const lo52 = Math.min(...closes.slice(-252));
  const posInRange = ((last - lo52) / (hi52 - lo52)) * 100;
  const mom20 = (last / closes[closes.length - 21] - 1) * 100;
  const rets = closes.slice(-20).map((c, i, a) => (i ? c / a[i - 1] - 1 : 0)).slice(1);
  const vol = Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length) * Math.sqrt(252) * 100;
  return `Price ${last.toFixed(2)}, ${last > ma50 ? "above" : "below"} 50-day avg${ma200 ? `, ${last > ma200 ? "above" : "below"} 200-day avg` : ""}. ` +
    `${posInRange.toFixed(0)}% of the way up its 52-week range (${lo52.toFixed(2)}–${hi52.toFixed(2)}). ` +
    `20-day momentum ${mom20 >= 0 ? "+" : ""}${mom20.toFixed(1)}%. Annualized volatility ~${vol.toFixed(0)}%.`;
}

export async function buildDossier(symbol: string): Promise<Dossier | null> {
  // --- gather (parallel, deterministic) ---
  const cik = await tickerToCik(symbol);
  const [bars, spy, fund, filings, si, sent] = await Promise.all([
    fetchDailyBars(symbol, "3y").catch(() => []),
    fetchDailyBars("SPY", "1y").catch(() => []),
    cik ? fundamentals(cik) : Promise.resolve(null),
    cik ? recentFilings(cik, 10) : Promise.resolve([]),
    latestShortInterestForSymbol(symbol.replace(/\.[A-Z]+$/, "")),
    latestSentimentForSymbol(symbol.replace(/\.[A-Z]+$/, "")),
  ]);
  if (bars.length < 50) return null; // can't analyze without price history

  const tech = technicalSummary(bars);
  const fundTxt = fund ? summarizeFundamentals(fund) : "No EDGAR fundamentals (may be non-US or a fund).";
  const filingsTxt = filings.length ? filings.map((f) => `${f.form} ${f.date}`).join(", ") : "none retrieved";
  const siTxt = si ? `Short interest: ${(si.si_shares / 1e6).toFixed(1)}M shares, ${si.days_to_cover.toFixed(1)} days-to-cover (as of ${si.settlement_date}).` : "No short-interest data.";
  const sentTxt = sent?.mentions_24h ? `Social mentions (recent): ${sent.mentions_24h} in 24h.` : "No notable social chatter archived.";
  const dataBlock = `TICKER: ${symbol}\nFUNDAMENTALS: ${fundTxt}\nRECENT FILINGS: ${filingsTxt}\nTECHNICALS: ${tech}\n${siTxt}\n${sentTxt}`;

  // --- specialists then debate (sequential; free-tier concurrency is unreliable) ---
  const fundAnalysis = await judge(
    "You are a fundamentals analyst. From the data, assess financial health: growth trajectory, profitability, margins, dilution, and any balance-sheet concern. 3-4 sentences, specific, cite the numbers. No preamble.",
    dataBlock, 400);
  const mktAnalysis = await judge(
    "You are a market-structure analyst. From the data, assess the trade setup: trend, position in range, momentum, short-interest/squeeze potential, and sentiment. 3-4 sentences, specific. No preamble.",
    dataBlock, 400);
  const analyses = `FUNDAMENTALS ANALYST:\n${fundAnalysis}\n\nMARKET ANALYST:\n${mktAnalysis}`;

  const bull = await judge("You are the BULL. Make the strongest evidence-based case to be long, using ONLY the analysts' findings and data. 3 sentences. No hedging, no new facts.", `${dataBlock}\n\n${analyses}`, 500);
  const bear = await judge("You are the BEAR. Make the strongest evidence-based case against, or to be short, using ONLY the analysts' findings and data. 3 sentences. No hedging, no new facts.", `${dataBlock}\n\n${analyses}`, 500);

  // --- verdict (structured) ---
  const verdict = await completeJson(
    `You are the head of research synthesizing a dossier. Weigh the bull and bear cases and issue a verdict. Return JSON with EXACTLY these keys:
{
  "stance": one of "avoid" | "watch" | "interesting_long" | "interesting_short",
  "confidence": integer 0-100,
  "summary": array of 3-5 short plain-English bullet strings (the company/setup in brief),
  "priced_in": one sentence on what the current price seems to assume,
  "risk_flags": array of 2-4 short risk strings,
  "triggers": array of 3-5 SHORT machine-checkable "what would change our mind" conditions (e.g. "gross margin < 40% next quarter", "days-to-cover falls below 4", "price closes below 50-day average")
}
Be decisive but honest; "watch"/"avoid" are respectable. Aggressive/short-squeeze setups can be "interesting_long" even with weak fundamentals if the setup is strong — say so.`,
    `${dataBlock}\n\n${analyses}\n\nBULL CASE:\n${bull}\n\nBEAR CASE:\n${bear}`,
    1600,
  );
  if (!verdict || !verdict.stance) return null;

  // --- assemble markdown ---
  const entry = bars[bars.length - 1].close;
  const spyNow = spy.length ? spy[spy.length - 1].close : null;
  const md = [
    `*${symbol} — Analyst Desk dossier*`,
    `Stance: *${String(verdict.stance).replace("_", "-").toUpperCase()}* · confidence ${verdict.confidence}`,
    ``,
    ...(verdict.summary ?? []).map((s: string) => `• ${s}`),
    ``,
    `*Bull:* ${bull}`,
    `*Bear:* ${bear}`,
    ``,
    `*What's priced in:* ${verdict.priced_in ?? "—"}`,
    `*Risk flags:* ${(verdict.risk_flags ?? []).join("; ")}`,
    ``,
    `*What would change our mind:*`,
    ...(verdict.triggers ?? []).map((t: string) => `  ↳ ${t}`),
    ``,
    `_Fundamentals: ${fundTxt}_`,
    `_Technicals: ${tech}_`,
  ].join("\n");

  return {
    symbol,
    stance: verdict.stance,
    confidence: Math.max(0, Math.min(100, Number(verdict.confidence) || 50)),
    summary_md: md,
    triggers: verdict.triggers ?? [],
    entry_price: entry,
    spy_at_creation: spyNow,
  };
}
