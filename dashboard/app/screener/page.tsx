import { screenerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const rows = await screenerAction(30);
  return (
    <main className="wrap">
      <p className="eyebrow">India Screener</p>
      <h1 className="pagetitle">Which NSE stocks have potential — today.</h1>
      <p className="lede">
        Liquid NSE equities ranked from the archive by 1-month &amp; 3-month momentum, delivery-%
        trend (accumulation), and relative volume. A <em>heuristic</em> ranking — factors shown, not
        validated alpha. Updates as the daily archive grows.
      </p>

      {rows.length === 0 ? (
        <div className="panel muted">No screener data yet — the India archive needs to be populated.</div>
      ) : (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Symbol</th><th className="num">Close</th>
                  <th className="num">1M</th><th className="num">3M</th>
                  <th className="num">Delivery</th><th className="num">Δ Deliv</th>
                  <th className="num">Rel Vol</th><th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.symbol}>
                    <td className="dim">{i + 1}</td>
                    <td className="mono">{r.symbol}</td>
                    <td className="num mono">{Number(r.close).toFixed(1)}</td>
                    <td className={`num mono ${r.mom_1m >= 0 ? "pos" : "neg"}`}>{r.mom_1m >= 0 ? "+" : ""}{r.mom_1m}%</td>
                    <td className={`num mono ${r.mom_3m >= 0 ? "pos" : "neg"}`}>{r.mom_3m >= 0 ? "+" : ""}{r.mom_3m}%</td>
                    <td className="num mono">{r.delivery_recent}%</td>
                    <td className={`num mono ${r.delivery_trend > 0 ? "pos" : "dim"}`}>{r.delivery_trend > 0 ? "+" : ""}{r.delivery_trend}</td>
                    <td className="num mono">{Number(r.rel_volume).toFixed(1)}×</td>
                    <td className="num mono score-cell">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim small" style={{ marginTop: "12px" }}>
            Δ Deliv = recent-5d vs prior-20d delivery %. Higher = accumulation. Rankings are a
            starting point for research (open a name in the Advisor), not buy signals.
          </p>
        </div>
      )}
    </main>
  );
}
