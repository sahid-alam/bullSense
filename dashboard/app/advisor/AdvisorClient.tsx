"use client";

import { useState } from "react";
import { buildCardAction } from "../actions";
import type { AdvisorCard } from "../../../src/lib/advisor.js";

const NSE = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "TATAMOTORS.NS", "ADANIENT.NS", "ITC.NS", "CUPID.NS"];
const cur = (m: string) => (m === "NSE" ? "₹" : "$");
const VERDICT: Record<string, { label: string; cls: string }> = {
  enter: { label: "ENTER", cls: "enter" }, watch: { label: "WATCH", cls: "watch" }, avoid: { label: "AVOID", cls: "avoid" },
};

export default function AdvisorClient() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [c, setC] = useState<AdvisorCard | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setLoading(true); setErr(null);
    try { setC(await buildCardAction(symbol.trim())); }
    catch (e: any) { setErr(e?.message ?? "Failed to build the card."); setC(null); }
    finally { setLoading(false); }
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Advisor Card</p>
      <h1 className="pagetitle">The six questions, answered — for any stock.</h1>
      <p className="lede">Market read · potential · enter/avoid · lot size · stop · target. Works for US and NSE. The verdict is an <em>interim heuristic</em>, shown with its uncertainty — not validated advice.</p>

      <form className="panel form" onSubmit={run}>
        <div className="field grow">
          <label>Ticker</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="RELIANCE.NS" spellCheck={false} />
        </div>
        <div className="field">
          <label>Popular NSE</label>
          <select value={NSE.includes(symbol) ? symbol : ""} onChange={(e) => e.target.value && setSymbol(e.target.value)}>
            <option value="">— pick —</option>
            {NSE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="run" disabled={loading}>{loading ? "Building…" : "Build card"}</button>
      </form>

      {err && <div className="panel error">✗ {err}</div>}
      {loading && !c && <div className="panel muted">Reading price history, market, and archive…</div>}

      {c && !loading && (!c.ok ? <div className="panel error">✗ {c.error}</div> : (
        <div className="results">
          <div className="panel cardhead">
            <div>
              <span className="mono big">{c.symbol}</span>
              <span className="dim"> · {c.market} · {c.horizon}</span>
            </div>
            <span className={`verdict-badge ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].label}</span>
          </div>

          <div className="panel">
            <h2>1 · Market</h2>
            <div className="mono">{c.marketRead.label}</div>
            {c.marketRead.facts.filter(Boolean).map((f, i) => <div key={i} className="dim small">· {f}</div>)}
          </div>

          <div className="panel">
            <h2>2 · Potential — {c.potential}/100</h2>
            <div className="factors">
              {c.factors.map((f) => (
                <div key={f.name} className="factor">
                  <div className="factor-top"><span>{f.name}</span><span className="mono">{f.score}</span></div>
                  <div className="bar"><div className="bar-fill" style={{ width: `${f.score}%` }} /></div>
                  <div className="dim small">{f.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel plan">
            <div className="plan-cell"><div className="k">4 · Lot size</div><div className="mono big2">{c.suggestedQty}<span className="dim small"> sh</span></div><div className="dim small">{(c.riskPct * 100).toFixed(1)}% risk · {c.account}</div></div>
            <div className="plan-cell"><div className="k">Entry</div><div className="mono big2">{cur(c.market)}{c.entry.toFixed(2)}</div></div>
            <div className="plan-cell"><div className="k">5 · Stop</div><div className="mono big2 neg">{cur(c.market)}{c.stop.toFixed(2)}</div><div className="dim small">risk {cur(c.market)}{(c.entry - c.stop).toFixed(2)}/sh</div></div>
            <div className="plan-cell"><div className="k">6 · Target</div><div className="mono big2 pos">{cur(c.market)}{c.target.toFixed(2)}</div><div className="dim small">{c.riskReward}R</div></div>
          </div>

          {c.rationale && <div className="panel"><h2>3 · The read</h2><p>{c.rationale}</p></div>}

          <div className="panel note small dim">⚠ {c.disclaimer}</div>
        </div>
      ))}
    </main>
  );
}
