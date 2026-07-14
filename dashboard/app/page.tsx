import TestLab from "./TestLab";
import { getProfiles, storeAvailable, getLatestRegime } from "../../src/providers/store.js";

// Always render fresh (reads live engine state); never statically prerender at build.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Profile options for the sizing dropdown + a live regime chip in the header.
  let profiles: string[] = ["sahid", "ansh", "jatin", "engine", "test"];
  let regime: { regime: string; score: number; date: string } | null = null;
  try {
    if (storeAvailable()) {
      const p = await getProfiles();
      if (p.length) profiles = p.map((x) => x.id);
      const r = await getLatestRegime();
      if (r) regime = { regime: r.regime, score: r.score, date: r.date };
    }
  } catch {
    /* store not configured — the Test Lab still runs on manual days-to-cover */
  }
  return <TestLab profiles={profiles} regime={regime} storeReady={storeAvailable()} />;
}
