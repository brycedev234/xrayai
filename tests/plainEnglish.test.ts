import assert from "node:assert/strict";
import { test } from "node:test";
import { explainFinding, vitals } from "@/lib/analysis/plainEnglish";
import { demoScanResult } from "@/data/demoScanResult";
import type { ScanResult } from "@/lib/types/scan";

test("Quick read answers every question from the scan, and unknowns stay unknown", () => {
  const r = demoScanResult();
  const v = vitals(r);
  assert.deepEqual(v.map((x) => x.key), ["mint", "freeze", "liquidity", "whales", "linked", "creator", "flow"]);
  for (const x of v) assert.ok(x.question && x.answer && x.detail, x.key);

  const blank: ScanResult = {
    ...r,
    genome: { ...r.genome, mintAuthorityActive: null, freezeAuthorityActive: null, transferHook: null, defaultAccountState: null },
    heart: { ...r.heart, liquidityUsd: null },
    cells: { ...r.cells, top10Percent: null },
    mass: { ...r.mass, graphState: "INSUFFICIENT_GRAPH_DATA", clusters: [] },
    brain: { ...r.brain, originAddress: null },
    bloodstream: { ...r.bloodstream, buys24h: null, sells24h: null },
  };
  for (const x of vitals(blank)) assert.equal(x.tone, "unknown", x.key);
});

test("Quick read flags printable supply and linked holders without accusing anyone", () => {
  const r = demoScanResult();
  const v = vitals({ ...r, genome: { ...r.genome, mintAuthorityActive: true } });
  assert.equal(v.find((x) => x.key === "mint")?.tone, "bad");
  const linked = v.find((x) => x.key === "linked");
  if (r.mass.graphState === "ENHANCED") {
    assert.equal(linked?.tone, "bad");
    assert.match(linked!.detail, /look connected/);
  }
  for (const x of v) assert.doesNotMatch(`${x.answer} ${x.detail}`, /\bsafe\b|scam|rug/i);
});

test("Findings carry a plain explanation", () => {
  for (const f of demoScanResult().findings) {
    if (f.code === "AUTHORITY_LINK") continue;
    assert.ok(explainFinding(f), f.code);
  }
});
