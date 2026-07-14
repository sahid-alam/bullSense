// BullSense Telegram command console — Supabase Edge Function (Deno).
// Webhook target for @bullsense_desk_bot. Reads config + state directly from Postgres
// via the auto-injected SUPABASE_DB_URL, so no function secrets need manual setup.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

async function cfg(key: string): Promise<string | null> {
  const rows = await sql`select value from config where key = ${key}`;
  return rows[0]?.value ?? null;
}

async function reply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
}

/** Chat interrogation: answer a question grounded ONLY in BullSense's own data. */
async function groqAsk(context: string, question: string): Promise<string> {
  const key = await cfg("groq_api_key");
  const model = (await cfg("groq_model")) ?? "llama-3.3-70b-versatile";
  if (!key) return "Chat isn't configured.";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 500, temperature: 0.3,
      messages: [
        { role: "system", content: "You are BullSense, a disciplined AI trading analyst answering its operator. Answer ONLY from the SYSTEM STATE provided — never invent numbers, prices, or signals. If the state doesn't cover the question, say so plainly. Be concise (2-4 sentences), specific, and cite the actual figures. No hedging, no disclaimers." },
        { role: "user", content: `SYSTEM STATE:\n${context}\n\nQUESTION: ${question}` },
      ],
    }),
  });
  if (!res.ok) return "Couldn't reach the analyst right now.";
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? "No answer.";
}

const HELP = [
  "*BullSense commands* 🐂",
  "",
  "/status — engine heartbeat & job health",
  "/radar — today's market regime + read",
  "/book — your positions vs their stops",
  "/took `SYMBOL QTY [ENTRY]` — record that you traded a signal (tracks your P&L)",
  "/pnl — your realized P&L, win rate, and open positions",
  "/dossier `SYMBOL` — deep-dive research (fundamentals, bull/bear, verdict)",
  "/fund — engine paper fund: return, Sharpe, drawdown vs SPY",
  "/lab — latest genome re-tuning result",
  "/beliefs — what BullSense currently believes (and recent mind-changes)",
  "/ask `question` — interrogate the analyst about its own data",
  "/calibration — does higher conviction actually win more?",
  "/overrides — does overruling the system help or hurt?",
  "/add `SYM QTY COST [STOP]` — log a position you already own (Position Intake)",
  "/sold `SYMBOL QTY [PRICE]` — record a sale, realize P&L, reduce your book",
  "/stop `SYMBOL PRICE` — set an invalidation (e.g. `/stop CUPID.NS 195`)",
  "/target `SYMBOL PRICE` — set a profit target (Watchtower prompts protect-the-gain when hit)",
  "/remove `SYMBOL` — drop a position without recording a sale (prefer /sold)",
  "/pause — halt new signals & alerts (archives keep running)",
  "/resume — resume the engine",
  "/help — this list",
].join("\n");

interface Profile { id: string; equity: number; risk_prefs: any }

async function isOperator(chatId: number): Promise<boolean> {
  const rows = await sql`select 1 from profiles where telegram_chat_id = ${String(chatId)} and is_operator = true limit 1`;
  return rows.length > 0;
}

/** The profile a command writes to: the operator profile for this chat, preferring the
 *  real named account over the shared 'test' sandbox when a chat maps to both. */
async function primaryProfileFor(chatId: number): Promise<Profile | null> {
  const rows = await sql`
    select id, equity, risk_prefs from profiles
    where telegram_chat_id = ${String(chatId)} and is_operator = true
    order by (id = 'test') asc, id limit 1`;
  return rows[0] ?? null;
}

/** Treasury Position-Intake verdict (mirrors src/lib/treasury.ts intakeVerdict). */
function intakeVerdict(equity: number, qty: number, cost: number, stop: number, riskMax: number) {
  const stopDist = cost - stop;
  const atRiskPct = (stopDist * qty) / equity;
  const maxQty = Math.floor((equity * riskMax) / Math.max(stopDist, 1e-9));
  const ratio = qty / Math.max(maxQty, 1);
  return { atRiskPct, maxQty, ratio, stopDist };
}

/** Treasury-suggested share count (mirrors src/lib/treasury.ts sizePosition core:
 *  conviction-scaled risk within band, capped by capital %). */
function treasurySuggestedQty(equity: number, conviction: number, entry: number, stop: number, prefs: any): number {
  const rmin = Number(prefs?.per_trade_risk_min ?? 0.01);
  const rmax = Number(prefs?.per_trade_risk_max ?? 0.025);
  const maxPos = Number(prefs?.max_position_pct ?? 0.25);
  const stopDist = entry - stop;
  if (stopDist <= 0) return 0;
  const c = Math.min(100, Math.max(0, conviction)) / 100;
  const riskPct = rmin + c * (rmax - rmin);
  const byRisk = Math.floor((equity * riskPct) / stopDist);
  const byCapital = Math.floor((equity * maxPos) / entry);
  return Math.max(0, Math.min(byRisk, byCapital));
}

/** Pre-trade behavioral guards — the documented ways retail traders lose money,
 *  caught at the moment of entry. Returns warning lines (empty = clean). */
async function behavioralGuards(profileId: string, symbol: string, qty: number, entry: number): Promise<string[]> {
  const w: string[] = [];

  // 1. AVERAGING DOWN — adding to an underwater position turns small losses into large ones
  const held = await sql`select qty, cost_basis from book where profile_id=${profileId} and symbol=${symbol} and kind='holding' limit 1`;
  if (held[0] && entry < Number(held[0].cost_basis)) {
    w.push(`⚠️ *Averaging down:* you already hold ${symbol} at ${held[0].cost_basis}; this adds below cost. Adding to losers is how small losses become account-threatening ones.`);
  }

  // 2. CONCENTRATION — one name dominating the book is uncompensated risk
  const book = await sql`select qty, cost_basis from book where profile_id=${profileId} and kind='holding' and qty>0`;
  let bookVal = qty * entry;
  for (const b of book) bookVal += Number(b.qty) * Number(b.cost_basis);
  const posVal = qty * entry + (held[0] ? Number(held[0].qty) * Number(held[0].cost_basis) : 0);
  if (bookVal > 0 && posVal / bookVal > 0.35) {
    w.push(`⚠️ *Concentration:* ${symbol} would be ~${Math.round((posVal / bookVal) * 100)}% of your book. Single stocks are far more volatile than an index — this is uncompensated risk.`);
  }

  // 3. OVERTRADING / REVENGE — a burst of trades (esp. after a loss) is a top way accounts bleed
  const recent = await sql`select count(*) as n, count(*) filter (where realized_pnl < 0) as losses from positions where profile_id=${profileId} and entry_at > now() - interval '48 hours'`;
  if (Number(recent[0].n) >= 3) {
    const revenge = Number(recent[0].losses) > 0 ? " Some were losses — beware revenge trading." : "";
    w.push(`⚠️ *Overtrading:* that's your ${Number(recent[0].n) + 1}th trade in 48h.${revenge} Trades taken from boredom, FOMO, or to recover a loss have no edge.`);
  }

  // 4. CHASING AN EXTENDED MOVE — buying far above trend is poor risk/reward (FOMO)
  try {
    const yh = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (yh.ok) {
      const j = await yh.json();
      const closes = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c: number) => c != null);
      if (closes.length >= 50) {
        const ma50 = closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50;
        const ext = (entry / ma50 - 1) * 100;
        if (ext > 25) w.push(`⚠️ *Extended:* ${symbol} is ~${Math.round(ext)}% above its 50-day average. Chasing a move that's already run is exactly the FOMO entry that hands you a poor risk/reward — the Cupid pattern.`);
      }
    }
  } catch { /* price check is best-effort */ }

  return w;
}

async function handle(text: string, chatId: number): Promise<string> {
  const [cmdRaw, ...args] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");

  // Every command exposes engine state or mutates it — restrict to known operators.
  // Unknown chats get a flat refusal (no data, no engine control, no /help enumeration).
  if (!(await isOperator(chatId))) {
    return "This is a private analyst. Access is restricted to its operators.";
  }

  if (cmd === "/start" || cmd === "/help") return HELP;

  if (cmd === "/status") {
    const routines = await sql`select name, enabled, master_paused, last_run_at, last_summary from routines order by name`;
    const errs = await sql`select count(*)::int as n from job_runs where started_at > now() - interval '24 hours' and status = 'error'`;
    const paused = routines.some((r) => r.master_paused);
    const lines = [`*Engine status* ${paused ? "⏸️ PAUSED" : "▶️ running"}`, ""];
    for (const r of routines) {
      const when = r.last_run_at ? new Date(r.last_run_at).toISOString().slice(5, 16).replace("T", " ") : "never";
      lines.push(`${r.enabled ? "✅" : "⛔"} *${r.name}* — ${when}\n   _${r.last_summary ?? "—"}_`);
    }
    lines.push("", errs[0].n === 0 ? "No job errors in 24h." : `⚠️ ${errs[0].n} job error(s) in 24h.`);
    return lines.join("\n");
  }

  if (cmd === "/radar") {
    const r = await sql`select date, score, regime, narrative from regime_scores order by date desc limit 1`;
    if (!r[0]) return "No Radar reading yet.";
    const label = r[0].regime === "risk_on" ? "🟢 RISK-ON" : r[0].regime === "neutral" ? "🟡 NEUTRAL" : "🔴 RISK-OFF";
    const heat = r[0].regime === "risk_on" ? "20%" : r[0].regime === "neutral" ? "12%" : "5%";
    return `*Market Radar* (${r[0].date})\nScore *${r[0].score}/100* → ${label}\nHeat ceiling: *${heat}*\n\n_${r[0].narrative ?? "—"}_`;
  }

  if (cmd === "/book") {
    const rows = await sql`
      select b.symbol, b.qty, b.cost_basis, b.invalidation_price, b.target_price, b.time_stop_date
      from book b join profiles p on p.id = b.profile_id
      where p.telegram_chat_id = ${String(chatId)} and b.kind = 'holding' and b.qty > 0
      order by b.symbol`;
    if (rows.length === 0) return "Your book is empty. Positions bought outside the system can be added later via Position Intake.";
    const lines = ["*Your Book*", ""];
    for (const b of rows) {
      const guard = b.invalidation_price ? `stop *${b.invalidation_price}*` : "⚠️ *no stop set*";
      const tgt = b.target_price ? ` · 🎯 ${b.target_price}` : "";
      const ts = b.time_stop_date ? ` · time-stop ${b.time_stop_date}` : "";
      lines.push(`*${b.symbol}* — ${b.qty} @ ${b.cost_basis} · ${guard}${tgt}${ts}`);
    }
    lines.push("", "_Set a stop: /stop SYMBOL PRICE · a target: /target SYMBOL PRICE_");
    return lines.join("\n");
  }

  if (cmd === "/add") {
    // Position Intake: /add SYMBOL QTY COST [STOP]
    if (args.length < 3) return "Usage: `/add SYMBOL QTY COST [STOP]`\ne.g. `/add CUPID.NS 45 224.68 195`";
    const symbol = args[0].toUpperCase();
    const qty = Number(args[1]), cost = Number(args[2]);
    const stop = args[3] !== undefined ? Number(args[3]) : null;
    if (!isFinite(qty) || qty <= 0) return "QTY must be a positive number.";
    if (!isFinite(cost) || cost <= 0) return "COST must be a positive number.";
    if (stop !== null && (!isFinite(stop) || stop <= 0)) return "STOP must be a positive number.";
    const exchange = symbol.endsWith(".NS") ? "NSE" : "US";

    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";

    // behavioral guards run against PRIOR state, before the upsert
    const guards = await behavioralGuards(profile.id, symbol, qty, cost);

    await sql`
      insert into book (profile_id, symbol, exchange, kind, qty, cost_basis, invalidation_price)
      values (${profile.id}, ${symbol}, ${exchange}, 'holding', ${qty}, ${cost}, ${stop})
      on conflict (profile_id, symbol, kind)
      do update set qty = ${qty}, cost_basis = ${cost},
        invalidation_price = coalesce(${stop}, book.invalidation_price)`;

    const lines = [`✅ *${symbol}* logged — ${qty} @ ${cost} (${profile.id}).`];
    if (stop !== null) {
      const riskMax = Number(profile.risk_prefs?.per_trade_risk_max ?? 0.025);
      const v = intakeVerdict(Number(profile.equity), qty, cost, stop, riskMax);
      if (v.stopDist <= 0) {
        lines.push(`Stop ${stop} is at/above cost — that locks a gain, not a loss cap.`);
      } else {
        lines.push(`Risk to stop ${stop}: *~${(v.stopDist * qty).toFixed(0)}* (${(v.atRiskPct * 100).toFixed(1)}% of equity).`);
        lines.push(v.ratio <= 1
          ? `Treasury: *within formula* (max ~${v.maxQty} shares at this stop). Well-sized.`
          : `Treasury: ⚠️ *oversized ${v.ratio.toFixed(1)}×* — the formula caps this at ~${v.maxQty} shares. You're carrying more risk than the rules allow.`);
      }
      lines.push("The Watchtower now guards it nightly.");
    } else {
      lines.push("⚠️ *No stop set.* An unguarded position is a hope, not a plan — set one:");
      lines.push(`\`/stop ${symbol} <price>\``);
    }
    if (guards.length) lines.push("", ...guards);
    return lines.join("\n");
  }

  if (cmd === "/took") {
    // Record a signal you actually traded: /took SYMBOL QTY [ENTRY]
    if (args.length < 2) return "Usage: `/took SYMBOL QTY [ENTRY]` — records a trade you took on a signal, so your P&L is tracked.";
    const symbol = args[0].toUpperCase();
    const qty = Number(args[1]);
    if (!isFinite(qty) || qty <= 0) return "QTY must be a positive number.";
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";

    // link to the most recent signal for this symbol
    const sig = await sql`select id, invalidation_price, entry_price, conviction from signals where symbol = ${symbol} order by triggered_at desc limit 1`;
    if (sig.length === 0) return `No signal on record for *${symbol}*. Use /add for a manual (non-signal) position.`;
    const s = sig[0];
    const entry = args[2] !== undefined ? Number(args[2]) : Number(s.entry_price);
    if (!isFinite(entry) || entry <= 0) return "ENTRY must be a positive number (or the signal must have a filled entry).";

    const guards = await behavioralGuards(profile.id, symbol, qty, entry); // prior state, before insert

    const riskBudgetPct = (Math.abs(entry - Number(s.invalidation_price)) * qty) / profile.equity;
    const posRows = await sql`
      insert into positions (profile_id, signal_id, symbol, side, qty, entry_price, entry_at, risk_budget_pct, invalidation_price, status)
      values (${profile.id}, ${s.id}, ${symbol}, 'long', ${qty}, ${entry}, now(), ${riskBudgetPct}, ${Number(s.invalidation_price)}, 'open')
      returning id`;

    // Override receipt: did you size materially off the Treasury's suggestion?
    const suggested = treasurySuggestedQty(Number(profile.equity), Number(s.conviction), entry, Number(s.invalidation_price), profile.risk_prefs);
    let overrideNote = "";
    if (suggested > 0 && Math.abs(qty - suggested) / suggested > 0.5) {
      const kind = qty > suggested ? "oversized" : "undersized";
      await sql`
        insert into overrides (profile_id, position_id, override_type, system_recommendation, actual_action)
        values (${profile.id}, ${posRows[0].id}, ${kind}, ${'Treasury size ' + suggested + ' shares'}, ${'took ' + qty + ' shares'})`;
      overrideNote = `\n⚠️ *${kind.toUpperCase()}*: Treasury suggested ~${suggested} shares; you took ${qty}. Logged — /overrides tracks whether this helps or hurts.`;
    }

    return `✅ Recorded: you took *${symbol}* — ${qty} @ ${entry} (${profile.id}).\n` +
      `Risk to invalidation ${s.invalidation_price}: ~${(Math.abs(entry - Number(s.invalidation_price)) * qty).toFixed(0)} (${(riskBudgetPct * 100).toFixed(1)}% of equity).${overrideNote}\n` +
      (guards.length ? "\n" + guards.join("\n") + "\n" : "") +
      `Your P&L on this trade is now tracked vs the engine's — see /pnl.`;
  }

  if (cmd === "/sold") {
    // Record a sale of a book holding: /sold SYMBOL QTY [PRICE]
    // Realizes P&L against average cost, reduces (or closes) the holding, logs an audit event.
    if (args.length < 2) return "Usage: `/sold SYMBOL QTY [PRICE]` — records shares you sold, realizes the P&L, and reduces your book.\ne.g. `/sold CUPID.NS 20 210`";
    const symbol = args[0].toUpperCase();
    const sellQty = Number(args[1]);
    const price = args[2] !== undefined ? Number(args[2]) : null;
    if (!isFinite(sellQty) || sellQty <= 0) return "QTY must be a positive number.";
    if (price !== null && (!isFinite(price) || price <= 0)) return "PRICE must be a positive number.";

    const rows = await sql`
      select b.profile_id, b.qty, b.cost_basis, b.invalidation_price
      from book b join profiles p on p.id = b.profile_id
      where p.telegram_chat_id = ${String(chatId)} and b.symbol = ${symbol} and b.kind = 'holding'
      limit 1`;
    if (rows.length === 0) return `No holding *${symbol}* in your book. Check the symbol (NSE names end in .NS), or see /book.`;
    const h = rows[0];
    const held = Number(h.qty);
    if (sellQty > held + 1e-9) return `You only hold *${held}* ${symbol} — can't sell ${sellQty}. Sell ≤ ${held}, or use /book to check.`;

    const cur = symbol.endsWith(".NS") ? "₹" : "$";
    const cost = Number(h.cost_basis);
    const remaining = held - sellQty;
    const closing = remaining <= 1e-9;
    const realized = price !== null && isFinite(cost) ? (price - cost) * sellQty : null;

    if (closing) {
      await sql`delete from book b using profiles p
        where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
          and b.symbol = ${symbol} and b.kind = 'holding'`;
    } else {
      // cost_basis is average cost per share — a sale doesn't change it, only qty.
      await sql`update book b set qty = ${remaining}
        from profiles p
        where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
          and b.symbol = ${symbol} and b.kind = 'holding'`;
    }

    const pnlTxt = realized !== null
      ? `${realized >= 0 ? "+" : "−"}${cur}${Math.abs(realized).toFixed(0)}`
      : "not recorded (no sale price)";
    await sql`insert into book_events (profile_id, symbol, kind, triage, summary)
      values (${h.profile_id}, ${symbol}, 'sale', 'fyi',
        ${`Sold ${sellQty} @ ${price ?? "?"} vs cost ${cost}. Realized ${pnlTxt}. ${closing ? "Position closed." : remaining + " left."}`})`;

    const lines = [`✅ Sold *${sellQty}* ${symbol}${price !== null ? ` @ ${price}` : ""}.`];
    if (realized !== null) {
      const pct = cost > 0 ? (realized / (cost * sellQty)) * 100 : 0;
      lines.push(`Realized P&L: *${pnlTxt}*${cost > 0 ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% on this lot)` : ""}.`);
    } else {
      lines.push("_Tip: pass the sale price next time — `/sold SYM QTY PRICE` — to realize P&L._");
    }
    lines.push(closing
      ? "Position fully closed and removed from your book."
      : `*${remaining}* ${symbol} still held${h.invalidation_price ? ` · stop ${h.invalidation_price}` : " · ⚠️ no stop set"}. The Watchtower keeps guarding it.`);
    return lines.join("\n");
  }

  if (cmd === "/dossier") {
    if (!args[0]) return "Usage: `/dossier SYMBOL` — a deep-dive research dossier (fundamentals, filings, bull vs bear, verdict). US tickers.";
    const symbol = args[0].toUpperCase();
    // serve a fresh cached dossier instantly
    const cached = await sql`select summary_md from dossiers where symbol = ${symbol} and created_at > now() - interval '3 days' order by created_at desc limit 1`;
    if (cached.length) return cached[0].summary_md + "\n\n_(cached · ask again in 3+ days for a fresh build)_";
    // otherwise queue a build (avoid duplicate queued rows)
    const pending = await sql`select 1 from dossier_requests where symbol = ${symbol} and status = 'queued' limit 1`;
    if (pending.length === 0) {
      await sql`insert into dossier_requests (symbol, requested_by, chat_id) values (${symbol}, ${String(chatId)}, ${String(chatId)})`;
    }
    return `🔬 Dossier queued for *${symbol}*. The Analyst Desk is researching — the full write-up arrives here shortly.`;
  }

  if (cmd === "/fund") {
    const m = await sql`select * from fund_metrics where profile_id = 'engine' order by date desc limit 1`;
    const eq = await sql`select equity, drawdown_pct from treasury_state where profile_id = 'engine' order by date desc limit 1`;
    if (m.length === 0 || Number(m[0].days) < 10) {
      const e = eq[0] ? `Equity *${Math.round(Number(eq[0].equity))}*.` : "";
      return `*Engine Paper Fund*\n\n${e}\n_Risk-adjusted stats (Sharpe, Sortino, CAGR) appear once the equity curve has ~10 days of history. The fund takes every live signal automatically — it's the strategy's own scorecard._`;
    }
    const f = m[0];
    const excess = f.spy_return_pct != null ? Number(f.total_return_pct) - Number(f.spy_return_pct) : null;
    return [
      `*Engine Paper Fund* (${f.days} days)`,
      ``,
      `Equity: *${eq[0] ? Math.round(Number(eq[0].equity)) : "—"}*`,
      `Total return: *${Number(f.total_return_pct) >= 0 ? "+" : ""}${Number(f.total_return_pct).toFixed(1)}%* · CAGR ${Number(f.cagr_pct).toFixed(0)}%`,
      `Sharpe *${Number(f.sharpe).toFixed(2)}* · Sortino ${Number(f.sortino).toFixed(2)} · vol ${Number(f.vol_pct).toFixed(0)}%`,
      `Max drawdown: ${Number(f.max_drawdown_pct).toFixed(1)}%`,
      excess != null ? `vs SPY: *${excess >= 0 ? "+" : ""}${excess.toFixed(1)}%* (SPY ${Number(f.spy_return_pct).toFixed(1)}%)` : ``,
      ``,
      `_An aggressive strategy has to beat SPY on a risk-adjusted basis, not just make money._`,
    ].filter(Boolean).join("\n");
  }

  if (cmd === "/lab") {
    const e = await sql`select run_at, family, n_variants, verdict, detail from lab_experiments order by run_at desc limit 1`;
    if (e.length === 0) return "*Lab*\n\n_No re-tuning run yet. The Lab tests parameter variants of each genome against historical data monthly and proposes a promotion only if one beats the incumbent AND the benchmark out-of-sample._";
    const r = e[0];
    const icon = r.verdict === "promotion_proposed" ? "✅" : "↔️";
    return [
      `*Lab — latest re-tune* (${new Date(r.run_at).toISOString().slice(0, 10)})`,
      ``,
      `Family: ${r.family} · ${r.n_variants} variants tested`,
      `${icon} *${r.verdict === "promotion_proposed" ? "Promotion proposed" : "No promotion"}*`,
      r.detail,
      ``,
      `_The Lab proposes; you approve. It won't chase a curve-fit that fails out-of-sample._`,
    ].join("\n");
  }

  if (cmd === "/beliefs") {
    const market = await sql`select stance, confidence, as_of, rationale from beliefs where category='market_regime' and superseded_at is null order by as_of desc limit 1`;
    const stocks = await sql`select subject, stance, confidence from beliefs where category='stock_stance' and superseded_at is null order by as_of desc limit 6`;
    const changes = await sql`select category, subject, stance, as_of from beliefs where superseded_at is not null order by superseded_at desc limit 4`;
    const lines = ["*What BullSense believes* 🧭", ""];
    if (market[0]) {
      const m = market[0];
      const label = m.stance === "risk_on" ? "🟢 RISK-ON" : m.stance === "neutral" ? "🟡 NEUTRAL" : "🔴 RISK-OFF";
      lines.push(`*Market:* ${label} (conf ${m.confidence}) since ${new Date(m.as_of).toISOString().slice(0, 10)}`);
      if (m.rationale) lines.push(`_${String(m.rationale).slice(0, 160)}_`);
    }
    if (stocks.length) {
      lines.push("", "*Stock stances:*");
      for (const s of stocks) lines.push(`• *${s.subject}* — ${String(s.stance).replace("_", "-")} (${s.confidence})`);
    }
    if (changes.length) {
      lines.push("", "*Recent mind-changes:*");
      for (const c of changes) lines.push(`↳ ${c.subject} → ${String(c.stance).replace("_", "-")} (${new Date(c.as_of).toISOString().slice(0, 10)})`);
    }
    if (!market[0] && !stocks.length) lines.push("_No beliefs recorded yet — they accrue from the Radar and dossiers._");
    return lines.join("\n");
  }

  if (cmd === "/ask") {
    const question = args.join(" ").trim();
    if (!question) return "Usage: `/ask <question>` — e.g. `/ask what's the market regime and why?` or `/ask what do you think of GME?`";
    // gather a compact snapshot of BullSense's own state
    const regime = await sql`select date, score, regime, narrative from regime_scores order by date desc limit 1`;
    const sigs = await sql`select symbol, conviction, thesis_md, status from signals order by triggered_at desc limit 5`;
    const doss = await sql`select symbol, stance, confidence from dossiers order by created_at desc limit 3`;
    const fund = await sql`select equity, drawdown_pct from treasury_state where profile_id='engine' order by date desc limit 1`;
    const lab = await sql`select verdict, detail from lab_experiments order by run_at desc limit 1`;
    const pos = await sql`select b.symbol, b.qty, b.cost_basis, b.invalidation_price from book b join profiles p on p.id=b.profile_id where p.telegram_chat_id=${String(chatId)} and b.kind='holding' and b.qty>0`;
    // ticker-specific pull if a symbol is mentioned
    const tick = (question.toUpperCase().match(/\b[A-Z]{2,5}(?:\.NS)?\b/) ?? [])[0];
    let tickCtx = "";
    if (tick) {
      const td = await sql`select stance, confidence, summary_md from dossiers where symbol=${tick} order by created_at desc limit 1`;
      const ts = await sql`select conviction, thesis_md, status from signals where symbol=${tick} order by triggered_at desc limit 1`;
      const si = await sql`select days_to_cover, si_shares, settlement_date from short_interest where symbol=${tick.replace(/\.NS$/, "")} order by settlement_date desc limit 1`;
      if (td[0]) tickCtx += `\n${tick} DOSSIER: ${td[0].stance} (conf ${td[0].confidence}). ${String(td[0].summary_md).slice(0, 400)}`;
      if (ts[0]) tickCtx += `\n${tick} SIGNAL: conviction ${ts[0].conviction}, ${ts[0].status}. ${ts[0].thesis_md ?? ""}`;
      if (si[0]) tickCtx += `\n${tick} SHORT INTEREST: ${(Number(si[0].si_shares) / 1e6).toFixed(1)}M shares, ${Number(si[0].days_to_cover).toFixed(1)} days-to-cover (${si[0].settlement_date}).`;
    }
    const ctx = [
      regime[0] ? `MARKET: score ${regime[0].score}/100 ${regime[0].regime} (${regime[0].date}). ${regime[0].narrative ?? ""}` : "",
      sigs.length ? `RECENT SIGNALS: ${sigs.map((s: any) => `${s.symbol} conv${s.conviction} ${s.status}`).join("; ")}` : "No recent signals.",
      doss.length ? `RECENT DOSSIERS: ${doss.map((d: any) => `${d.symbol}=${d.stance}(${d.confidence})`).join("; ")}` : "",
      fund[0] ? `ENGINE FUND: equity ${Math.round(Number(fund[0].equity))}, drawdown ${(Number(fund[0].drawdown_pct) * 100).toFixed(1)}%.` : "",
      lab[0] ? `LAB: ${lab[0].verdict} — ${lab[0].detail}` : "",
      pos.length ? `YOUR HOLDINGS: ${pos.map((p: any) => `${p.symbol} ${p.qty}@${p.cost_basis} stop ${p.invalidation_price ?? "none"}`).join("; ")}` : "You hold no tracked positions.",
      tickCtx,
    ].filter(Boolean).join("\n");
    return await groqAsk(ctx, question);
  }

  if (cmd === "/calibration") {
    const closed = await sql`
      select
        case when conviction < 55 then '40-55' when conviction < 65 then '55-65'
             when conviction < 75 then '65-75' else '75-100' end as band,
        count(*) as n,
        count(*) filter (where m.ret > 0) as wins,
        round(avg(m.ret)::numeric, 1) as avg_ret
      from signals s
      join lateral (select return_pct as ret from signal_marks where signal_id = s.id order by mark_date desc limit 1) m on true
      where s.status like 'closed_%'
      group by 1 order by 1`;
    if (closed.length === 0) return "*Calibration*\n\n_No closed signals yet. This table fills as signals resolve — it will show whether higher conviction actually means a higher win rate._";
    const lines = ["*Calibration* — conviction band → actual win rate", ""];
    for (const r of closed) {
      const wr = Number(r.n) > 0 ? Math.round((Number(r.wins) / Number(r.n)) * 100) : 0;
      lines.push(`conviction *${r.band}*: ${wr}% win (${r.wins}/${r.n}), avg ${r.avg_ret}%`);
    }
    lines.push("", "_Well-calibrated = win rate rises with conviction band._");
    return lines.join("\n");
  }

  if (cmd === "/overrides") {
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";
    const rows = await sql`
      select override_type, count(*) as n, coalesce(sum(outcome_pnl),0) as pnl,
        count(*) filter (where outcome_pnl is null) as pending
      from overrides where profile_id = ${profile.id} group by 1 order by 1`;
    if (rows.length === 0) return "*Override receipts*\n\n_None yet. When you size off the Treasury's suggestion or overrule an exit, it's logged here — and scored, so you get an honest answer on whether your discretion helps or hurts._";
    const lines = ["*Override receipts* — does overruling the system pay?", ""];
    for (const r of rows) {
      const resolved = Number(r.n) - Number(r.pending);
      lines.push(`*${r.override_type}*: ${r.n} total${resolved > 0 ? `, scored P&L ${Number(r.pnl) >= 0 ? "+" : ""}${Math.round(Number(r.pnl))}` : ""}${Number(r.pending) > 0 ? ` (${r.pending} still open)` : ""}`);
    }
    return lines.join("\n");
  }

  if (cmd === "/pnl") {
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";
    const closed = await sql`select coalesce(sum(realized_pnl),0) as realized, count(*) filter (where realized_pnl > 0) as wins, count(*) as n from positions where profile_id = ${profile.id} and status = 'closed'`;
    const open = await sql`select count(*) as n from positions where profile_id = ${profile.id} and status = 'open'`;
    const ts = await sql`select equity, drawdown_pct from treasury_state where profile_id = ${profile.id} order by date desc limit 1`;
    const c = closed[0];
    const wr = Number(c.n) > 0 ? `${((Number(c.wins) / Number(c.n)) * 100).toFixed(0)}%` : "—";
    const lines = [`*Your P&L* (${profile.id})`, ""];
    if (ts[0]) lines.push(`Equity: *${Math.round(Number(ts[0].equity))}* (drawdown ${(Number(ts[0].drawdown_pct) * 100).toFixed(1)}%)`);
    lines.push(`Realized: *${Number(c.realized) >= 0 ? "+" : ""}${Math.round(Number(c.realized))}* over ${c.n} closed`);
    lines.push(`Win rate: ${wr} · ${open[0].n} open`);
    if (Number(c.n) === 0 && Number(open[0].n) === 0) lines.push("", "_No tracked trades yet. When you act on a signal, log it with /took._");
    return lines.join("\n");
  }

  if (cmd === "/remove") {
    if (args.length < 1) return "Usage: `/remove SYMBOL`";
    const symbol = args[0].toUpperCase();
    const deleted = await sql`
      delete from book b using profiles p
      where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
        and b.symbol = ${symbol} and b.kind = 'holding'
      returning b.symbol`;
    return deleted.length > 0
      ? `🗑️ Removed *${symbol}* from your book.`
      : `No holding *${symbol}* found in your book.`;
  }

  if (cmd === "/stop") {
    if (args.length < 2) return "Usage: `/stop SYMBOL PRICE` — e.g. `/stop CUPID.NS 195`";
    const symbol = args[0].toUpperCase();
    const price = Number(args[1]);
    if (!isFinite(price) || price <= 0) return "Price must be a positive number.";
    const updated = await sql`
      update book b set invalidation_price = ${price}
      from profiles p
      where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
        and b.symbol = ${symbol} and b.kind = 'holding'
      returning b.profile_id, b.qty, b.cost_basis`;
    if (updated.length === 0) return `No holding *${symbol}* found in your book. Check the symbol (NSE names end in .NS).`;
    const u = updated[0];
    const riskPerShare = Number(u.cost_basis) - price;
    const riskNote = riskPerShare > 0
      ? `Risk to stop: ~${(riskPerShare * Number(u.qty)).toFixed(0)} (${((riskPerShare / Number(u.cost_basis)) * 100).toFixed(1)}% from cost).`
      : `Note: stop is above your cost — this locks in a gain rather than capping a loss.`;
    return `✅ Stop set on *${symbol}* at *${price}*. ${riskNote}\nThe Watchtower now guards it nightly.`;
  }

  if (cmd === "/target") {
    if (args.length < 2) return "Usage: `/target SYMBOL PRICE` — set a profit target, e.g. `/target CUPID.NS 245`";
    const symbol = args[0].toUpperCase();
    const price = Number(args[1]);
    if (!isFinite(price) || price <= 0) return "Price must be a positive number.";
    const rows = await sql`
      select b.cost_basis, b.qty from book b join profiles p on p.id = b.profile_id
      where p.telegram_chat_id = ${String(chatId)} and b.symbol = ${symbol} and b.kind = 'holding' limit 1`;
    if (rows.length === 0) return `No holding *${symbol}* found in your book. Check the symbol (NSE names end in .NS).`;
    const cost = Number(rows[0].cost_basis);
    if (price <= cost) return `Target ${price} is at/below your cost ${cost} — that's not a profit target. Set it above cost.`;
    await sql`update book b set target_price = ${price}
      from profiles p
      where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
        and b.symbol = ${symbol} and b.kind = 'holding'`;
    const cur = symbol.endsWith(".NS") ? "₹" : "$";
    const gainPct = ((price / cost - 1) * 100).toFixed(1);
    const gainAmt = ((price - cost) * Number(rows[0].qty)).toFixed(0);
    return `🎯 Target set on *${symbol}* at *${price}* (+${gainPct}% from cost · ~${cur}${gainAmt} on your ${rows[0].qty}).\n` +
      `When it's hit, the Watchtower prompts you to *protect the gain* — bank it or trail your stop, your call. It won't tell you to cut a winner on reflex.`;
  }

  if (cmd === "/pause" || cmd === "/resume") {
    const paused = cmd === "/pause";
    await sql`update routines set master_paused = ${paused}`;
    return paused
      ? "⏸️ *Engine paused.* No new signals or alerts will fire. Archives keep running — the analyst sleeps, its memory doesn't."
      : "▶️ *Engine resumed.* Signals and alerts are live again.";
  }

  return `Unrecognized command. ${HELP}`;
}

Deno.serve(async (req) => {
  const token = await cfg("telegram_bot_token");
  const secret = await cfg("telegram_webhook_secret");
  if (!token) return new Response("not configured", { status: 500 });

  // Fail CLOSED: if the webhook secret is missing, refuse to serve rather than
  // silently skipping verification. Then require the header to match exactly.
  if (!secret) return new Response("webhook secret not configured", { status: 500 });
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }
  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text = msg?.text;
  if (!chatId || !text) return new Response("ok");

  try {
    const out = await handle(text, chatId);
    await reply(token, chatId, out);
  } catch (e) {
    // Log detail server-side; never reflect DB/internal error text to the user.
    console.error("handler error:", e);
    await reply(token, chatId, "⚠️ Something went wrong handling that. Try again shortly.");
  }
  return new Response("ok");
});
