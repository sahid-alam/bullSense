/**
 * Weekly backup (A0.1) — a logical snapshot of the irreplaceable tables to Supabase Storage.
 *
 * Scope: the receipts spine, personal book, beliefs, fund history, and strategies — small,
 * cannot be re-derived, and the project's core asset. The large point-in-time archives
 * (nse_equity, short_interest, sentiment) are intentionally NOT snapshotted weekly — they'd
 * bloat storage; they get the incremental R2/DuckDB offload noted in the plan instead.
 *
 * Uses the REST + Storage APIs with the secret key (no Postgres password needed).
 */
import { pageOperators } from "../lib/alert.js";

try { process.loadEnvFile(".env"); } catch { /* CI injects env */ }

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "backups";
const TABLES = [
  "signals", "signal_marks", "positions", "book", "book_events", "overrides",
  "treasury_state", "fund_metrics", "benchmark", "beliefs", "regime_scores",
  "genomes", "genome_graveyard", "dossiers", "fii_dii_flows",
];

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY!, Authorization: `Bearer ${KEY}`, ...extra };
}

/** All rows of a table via offset pagination (PostgREST caps each page). */
async function fetchAll(table: string): Promise<any[]> {
  const out: any[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=${page}&offset=${offset}`, { headers: headers() });
    if (!res.ok) throw new Error(`read ${table}: HTTP ${res.status}`);
    const rows = (await res.json()) as any[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function ensureBucket() {
  // idempotent: creating an existing bucket returns an error we ignore
  await fetch(`${URL}/storage/v1/bucket`, {
    method: "POST", headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).catch(() => {});
}

async function main() {
  if (!URL || !KEY || URL === "placeholder" || KEY === "placeholder") {
    console.log("[dry-run] backup needs SUPABASE_URL / SUPABASE_SECRET_KEY."); return;
  }
  const snapshot: Record<string, any[]> = {};
  let total = 0;
  for (const t of TABLES) {
    const rows = await fetchAll(t);
    snapshot[t] = rows;
    total += rows.length;
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ as_of: asOf, tables: snapshot });

  await ensureBucket();
  const path = `backup-${asOf}.json`;
  const up = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", "x-upsert": "true" }),
    body,
  });
  if (!up.ok) throw new Error(`upload ${path}: HTTP ${up.status} ${await up.text()}`);

  console.log(`backup: ${TABLES.length} tables, ${total} rows → ${BUCKET}/${path} (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch(async (e) => {
  console.error("backup failed:", e);
  await pageOperators(`🚨 *backup* failed: ${String(e).slice(0, 180)}`);
  process.exit(1);
});
