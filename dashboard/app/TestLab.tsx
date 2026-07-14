"use client";

import { useState } from "react";
import { runBenchAction } from "./actions";
import type { BenchResult } from "../../src/lib/benchcore.js";

const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
const sign = (x: number) => (x > 0 ? "pos" : x < 0 ? "neg" : "flat");

export default function TestLab({
  profiles,
  regime,
  storeReady,
}: {
  profiles: string[];
  regime: { regime: string; score: number; date: string } | null;
  storeReady: boolean;
}) {
  const [symbol, setSymbol] = useState("GME");
  const [dtc, setDtc] = useState("");
  const [years, setYears] = useState("3");
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<BenchResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await runBenchAction({
        symbol: symbol.trim(),
        dtc: dtc.trim() !== "" ? Number(dtc) : undefined,
        years: Number(years) || 3,
        profileId: profileId || undefined,
      });
      setRes(r);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong running the engine.");
      setRes(null);
    } finally {
      setLoading(false);
    }
  }

  const regimeClass = regime
    ? regime.regime === "risk_on"
      ? "on"
      : regime.regime === "risk_off"
      ? "off"
      : "neutral"
    : "neutral";

  return (
    <main className="wrap">
      <header className="head">
        <div className="brand">
          <span className="diamond" /> BULLSENSE <span className="sub">/ Test Lab</span>
        </div>
        <div className="head-right">
          {regime ? (
            <span className={`chip ${regimeClass}`}>
              RADAR {regime.score}/100 · {regime.regime.replace("_", "-").toUpperCase()}
            </span>
          ) : (
            <span className="chip warn">store not connected — manual DTC only</span>
          )}
        </div>
      </header>

      <p className="lede">
        Run the real engine on any ticker. It replays the price history, shows every day the
        engine <em>would</em> have fired with the forward outcome, sizes the most recent one, and
        checks whether it fires right now. US tickers only (FINRA short interest); for NSE, pass a
        days-to-cover to test the trigger hypothetically.
      </p>

      <form className="panel form" onSubmit={run}>
        <div className="field grow">
          <label>Ticker</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="GME"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Days-to-cover <span className="opt">(optional)</span></label>
          <input value={dtc} onChange={(e) => setDtc(e.target.value)} placeholder="auto" inputMode="decimal" />
        </div>
        <div className="field">
          <label>Years</label>
          <select value={years} onChange={(e) => setYears(e.target.value)}>
            {["1", "3", "5", "10"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Size for</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">hypothetical ₹100k</option>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button className="run" disabled={loading}>
          {loading ? "Running…" : "Run engine"}
        </button>
      </form>

      {err && <div className="panel error">✗ {err}</div>}

      {loading && !res && (
        <div className="panel muted">Fetching prices, replaying {years}y of history…</div>
      )}

      {res && !loading && <Results res={res} />}

      <footer className="foot">
        BullSense · internal test tool · engine runs server-side · not indexed
        {!storeReady && " · connect Supabase env for live regime + auto DTC"}
      </footer>
    </main>
  );
}

function Results({ res }: { res: BenchResult }) {
  if (!res.ok) {
    return <div className="panel error">✗ {res.error}</div>;
  }

  const gate = res.regime?.gateOpen;

  return (
    <div className="results">
      {/* context strip */}
      <div className="panel context">
        <div className="ctx-row">
          <span className="k">Symbol</span>
          <span className="mono big">{res.symbol}</span>
        </div>
        {res.priceMeta && (
          <div className="ctx-row">
            <span className="k">Price history</span>
            <span className="mono">
              {res.priceMeta.sessions} sessions · {res.priceMeta.from} → {res.priceMeta.to} · last{" "}
              {res.priceMeta.lastClose.toFixed(2)}
            </span>
          </div>
        )}
        {res.regime && (
          <div className="ctx-row">
            <span className="k">Regime</span>
            <span className="mono">
              {res.regime.label} ·{" "}
              <span className={gate ? "pos" : "neg"}>gate {gate ? "OPEN" : "CLOSED (suppressed live)"}</span>
            </span>
          </div>
        )}
        {res.dtc && (
          <div className="ctx-row">
            <span className="k">Days-to-cover</span>
            <span className="mono">
              {res.dtc.value.toFixed(1)} <span className="dim">· {res.dtc.source}</span>
            </span>
          </div>
        )}
      </div>

      {/* no short interest → honest boundary */}
      {!res.dtc && (
        <div className="panel boundary">
          <div className="boundary-title">⚠ Engine can’t generate a signal here</div>
          {res.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          {res.rightNow && (
            <p className="dim">
              Price-side today: 20-day MA cross-up{" "}
              {res.rightNow.features.close_vs_ma20__prev <= 0 && res.rightNow.features.close_vs_ma20 > 0
                ? "YES"
                : "no"}{" "}
              · rel-volume {res.rightNow.features.rel_volume}.
            </p>
          )}
        </div>
      )}

      {/* replay */}
      {res.replay && (
        <div className="panel">
          <h2>Historical replay</h2>
          <p className="dim small">
            Every day the engine would have fired (days-to-cover ≥ {res.replay.minDtc}, 20-day MA
            cross-up, rel-volume ≥ {res.replay.minRelVol}).
          </p>

          {res.replay.trades.length === 0 ? (
            <p className="muted">
              No fires — the price never crossed its 20-day average on ≥ {res.replay.minRelVol}×
              volume inside a short-interest window over this period.
            </p>
          ) : (
            <>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Entry date</th>
                      <th className="num">Entry</th>
                      <th className="num">Stop</th>
                      <th>Exit date</th>
                      <th className="num">Exit</th>
                      <th className="num">Held</th>
                      <th className="num">Return</th>
                      <th>Exit reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.replay.trades.map((t, i) => (
                      <tr key={i}>
                        <td className="dim">{i + 1}</td>
                        <td className="mono">{t.entryDate}</td>
                        <td className="num mono">{t.entry.toFixed(2)}</td>
                        <td className="num mono dim">{t.invalidation.toFixed(2)}</td>
                        <td className="mono">{t.exitDate}</td>
                        <td className="num mono">{t.exit.toFixed(2)}</td>
                        <td className="num mono">{t.heldDays}d</td>
                        <td className={`num mono ${sign(t.netReturnPct)}`}>{pct(t.netReturnPct)}</td>
                        <td>
                          <span className={`tag ${t.exitReason}`}>{t.exitReason.replace("_", " ")}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="stats">
                <Stat label="Trades" value={String(res.replay.stats.trades)} />
                <Stat label="Win rate" value={`${(res.replay.stats.winRate * 100).toFixed(0)}%`} />
                <Stat
                  label="Profit factor"
                  value={res.replay.stats.profitFactor.toFixed(2)}
                  tone={res.replay.stats.profitFactor >= 1.3 ? "pos" : res.replay.stats.profitFactor < 1 ? "neg" : "flat"}
                />
                <Stat label="Avg trade" value={pct(res.replay.stats.avgNetReturn)} tone={sign(res.replay.stats.avgNetReturn)} />
                <Stat label="SPY (same windows)" value={pct(res.replay.stats.avgSpyReturn)} tone={sign(res.replay.stats.avgSpyReturn)} />
                <Stat label="Excess vs SPY" value={pct(res.replay.stats.excessVsSpy)} tone={sign(res.replay.stats.excessVsSpy)} big />
                <Stat label="Max drawdown" value={`${res.replay.stats.maxDrawdownPct.toFixed(1)}%`} />
              </div>
            </>
          )}
        </div>
      )}

      {/* live decision */}
      {res.liveDecision && (
        <div className="panel">
          <h2>Live decision · most recent fire ({res.liveDecision.entryDate})</h2>
          <p className="dim small">What the desk would have told you at that entry.</p>
          <div className="decision">
            <div>
              <span className="k">Conviction</span>
              <span className="mono">{res.liveDecision.conviction}/100</span>
            </div>
            <div>
              <span className="k">Entry</span>
              <span className="mono">{res.liveDecision.entry.toFixed(2)}</span>
            </div>
            <div>
              <span className="k">Invalidation</span>
              <span className="mono">{res.liveDecision.invalidation.toFixed(2)}</span>
            </div>
            <div>
              <span className="k">Time stop</span>
              <span className="mono">{res.liveDecision.timeStop}</span>
            </div>
          </div>
          <div className="account mono">{res.liveDecision.account}</div>
          <div className={`treasury ${res.liveDecision.sized.approved ? "ok" : "no"}`}>
            {res.liveDecision.sized.approved ? (
              <>
                Treasury: <strong>{res.liveDecision.sized.qty} shares</strong> ·{" "}
                {(res.liveDecision.sized.riskBudgetPct * 100).toFixed(1)}% risk · max loss ~
                {res.liveDecision.maxLoss.toFixed(0)} — {res.liveDecision.sized.reason}
              </>
            ) : (
              <>Treasury: NO POSITION — {res.liveDecision.sized.reason}</>
            )}
          </div>
        </div>
      )}

      {/* right now */}
      {res.rightNow && res.dtc && (
        <div className="panel">
          <h2>Right now ({res.priceMeta?.to})</h2>
          <div className={`verdict ${res.rightNow.fires ? "pos" : "flat"}`}>
            {res.rightNow.fires ? "✅ WOULD FIRE" : "— no fire today"}
            {res.rightNow.suppressed && " (but suppressed by regime gate)"}
          </div>
          <div className="features mono dim small">{JSON.stringify(res.rightNow.features)}</div>
          {!res.rightNow.fires && (
            <p className="dim small">
              Not met: {res.rightNow.failedOn.join(", ")}. A one-day MA cross is rare on any given
              day — the replay above is the real test.
            </p>
          )}
        </div>
      )}

      {/* assumption footnote */}
      {res.notes.find((n) => n.includes("held constant")) && (
        <div className="panel note small dim">{res.notes.find((n) => n.includes("held constant"))}</div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className={`stat ${big ? "wide" : ""}`}>
      <div className="stat-l">{label}</div>
      <div className={`stat-v mono ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
